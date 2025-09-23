/**
 * @fileoverview MCP (Model Context Protocol) utility commands module for @ghostmind/run
 *
 * This module provides commands for managing MCP configurations across the project.
 * It can discover and list all meta.json files that contain MCP configurations.
 *
 * @module
 */

import {
  recursiveDirectoriesDiscovery,
  verifyIfMetaJsonExists,
  withMetaMatching,
  setSecretsOnLocal,
} from '../utils/divers.ts';

import { cd } from 'npm:zx@8.1.0';

/**
 * Escape a string for TOML format
 * Escapes backslashes and double quotes
 */
function escapeTomlString(str: string): string {
  return str
    .replace(/\\/g, '\\\\') // Escape backslashes
    .replace(/"/g, '\\"'); // Escape double quotes
}

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function mcp(program: any) {
  const mcpCommand = program.command('mcp');
  mcpCommand.description('MCP (Model Context Protocol) related commands');

  ////////////////////////////////////////////////////////////////////////////
  // MCP SET COMMAND
  ////////////////////////////////////////////////////////////////////////////

  const setCommand = mcpCommand.command('set');
  setCommand.description('Set MCP configurations');

  setCommand
    .argument('[server-name]', 'Name of the MCP server to install')
    .option(
      '--all',
      'Sync all MCP configurations from meta.json files (cleanup mode)'
    )
    .action(
      async (serverName: string | undefined, options: { all?: boolean }) => {
        const { all } = options;

        if (all) {
          await syncAllMCPConfigurationsFromMetaJson();
        } else if (serverName) {
          await setIndividualMCPConfiguration(serverName);
        } else {
          console.error('❌ Server name is required when not using --all flag');
          console.log('Usage: run mcp set <server-name> OR run mcp set --all');
          Deno.exit(1);
        }
      }
    );
}

////////////////////////////////////////////////////////////////////////////////
// SET INDIVIDUAL MCP CONFIGURATION
////////////////////////////////////////////////////////////////////////////////

/**
 * Find a specific MCP server configuration by name and update MCP configs
 */
async function setIndividualMCPConfiguration(
  serverName: string
): Promise<void> {
  const SRC = Deno.env.get('SRC');

  if (!SRC) {
    console.error('SRC environment variable is not defined');
    Deno.exit(1);
  }

  console.log(`🔍 Looking for MCP server: ${serverName}...\n`);

  try {
    // Get all directories recursively
    const directories = await recursiveDirectoriesDiscovery(SRC);

    // Add the SRC directory itself since recursiveDirectoriesDiscovery doesn't include it
    // but there's always a meta.json file in the SRC folder
    directories.unshift(SRC);

    let serverFound = false;
    let mcpServerConfig: any = null;

    // Check each directory for meta.json with the specific mcp server
    for (const directory of directories) {
      const metaConfig = await verifyIfMetaJsonExists(directory);

      if (metaConfig && metaConfig.mcp && metaConfig.mcp[serverName]) {
        serverFound = true;
        mcpServerConfig = metaConfig.mcp[serverName];

        console.log(
          `✅ Found MCP server '${serverName}' in project '${metaConfig.name}'`
        );
        console.log(`📁 Source: ${directory}`);
        break; // Found the server, no need to continue searching
      }
    }

    if (!serverFound) {
      console.log(
        `❌ MCP server '${serverName}' not found in any meta.json files`
      );
      console.log(`💡 Available MCP servers:`);

      // Show available MCP servers
      let availableServers: string[] = [];
      for (const directory of directories) {
        const metaConfig = await verifyIfMetaJsonExists(directory);
        if (metaConfig && metaConfig.mcp) {
          const servers = Object.keys(metaConfig.mcp);
          availableServers.push(...servers);
        }
      }

      if (availableServers.length > 0) {
        const uniqueServers = [...new Set(availableServers)];
        uniqueServers.forEach((server) => console.log(`   - ${server}`));
      } else {
        console.log('   No MCP servers found in the project');
      }
      return;
    }

    // Now update Claude, Cursor, and Codex MCP configuration files (only if they exist)
    await updateClaudeMcpJson(SRC, serverName, mcpServerConfig, false);
    await updateCursorMcpJson(SRC, serverName, mcpServerConfig, false);
    await updateCodexMcpToml(SRC, serverName, mcpServerConfig, false);
  } catch (error) {
    console.error('❌ Error searching for MCP server:', error);
    Deno.exit(1);
  }
}

/**
 * Update the .cursor/mcp.json file with the MCP server configuration (Cursor format - same as Claude)
 */
async function updateCursorMcpJson(
  srcPath: string,
  serverName: string,
  serverConfig: any,
  reset: boolean
): Promise<void> {
  const cursorDir = `${srcPath}/.cursor`;
  const mcpJsonPath = `${cursorDir}/mcp.json`;

  // Check if .cursor directory exists - if not, skip Cursor configuration
  try {
    await Deno.stat(cursorDir);
  } catch (error) {
    console.log(
      `⚠️  Cursor directory not found at ${cursorDir}, skipping Cursor configuration`
    );
    return;
  }

  console.log(`📝 Updating MCP configuration for Cursor (.cursor/mcp.json)...`);

  try {
    let mcpJson: any = { mcpServers: {} };

    // If reset flag is true, start with a fresh configuration
    if (reset) {
      console.log(`🔄 Resetting Cursor MCP configuration`);
      mcpJson = { mcpServers: {} };
    } else {
      // Try to read existing Cursor .cursor/mcp.json file
      try {
        const existingContent = await Deno.readTextFile(mcpJsonPath);
        mcpJson = JSON.parse(existingContent);

        // Ensure mcpServers property exists
        if (!mcpJson.mcpServers) {
          mcpJson.mcpServers = {};
        }
      } catch (error) {
        console.log(`📄 Creating new Cursor MCP configuration`);
        mcpJson = { mcpServers: {} };
      }
    }

    // Check if server already exists (only relevant when not resetting)
    const serverExists = !reset && mcpJson.mcpServers[serverName] !== undefined;

    if (reset) {
      console.log(
        `➕ Adding MCP server '${serverName}' to fresh Cursor configuration`
      );
    } else if (serverExists) {
      console.log(
        `🔄 Updating existing MCP server '${serverName}' in Cursor configuration`
      );
    } else {
      console.log(
        `➕ Adding new MCP server '${serverName}' to Cursor configuration`
      );
    }

    // Add or replace the server configuration
    mcpJson.mcpServers[serverName] = serverConfig;

    // Write the updated configuration back to the file
    await Deno.writeTextFile(mcpJsonPath, JSON.stringify(mcpJson, null, 2));

    console.log(`✅ Successfully updated Cursor MCP configuration`);
  } catch (error) {
    console.error('❌ Error updating Cursor MCP configuration:', error);
  }
}

/**
 * Update the .mcp.json file with the MCP server configuration (Claude format)
 */
async function updateClaudeMcpJson(
  srcPath: string,
  serverName: string,
  serverConfig: any,
  reset: boolean
): Promise<void> {
  const mcpJsonPath = `${srcPath}/.mcp.json`;

  // Check if Claude MCP file exists
  try {
    await Deno.stat(mcpJsonPath);
  } catch (error) {
    console.log(
      `⚠️  Claude MCP file not found at ${mcpJsonPath}, skipping Claude configuration`
    );
    return;
  }

  console.log(`📝 Updating MCP configuration for Claude Code (.mcp.json)...`);

  try {
    let mcpJson: any = { mcpServers: {} };

    // If reset flag is true, start with a fresh configuration
    if (reset) {
      console.log(`🔄 Resetting Claude MCP configuration`);
      mcpJson = { mcpServers: {} };
    } else {
      // Try to read existing Claude .mcp.json file
      try {
        const existingContent = await Deno.readTextFile(mcpJsonPath);
        mcpJson = JSON.parse(existingContent);

        // Ensure mcpServers property exists
        if (!mcpJson.mcpServers) {
          mcpJson.mcpServers = {};
        }
      } catch (error) {
        console.log(`📄 Creating new Claude MCP configuration`);
        mcpJson = { mcpServers: {} };
      }
    }

    // Check if server already exists (only relevant when not resetting)
    const serverExists = !reset && mcpJson.mcpServers[serverName] !== undefined;

    if (reset) {
      console.log(
        `➕ Adding MCP server '${serverName}' to fresh Claude configuration`
      );
    } else if (serverExists) {
      console.log(
        `🔄 Updating existing MCP server '${serverName}' in Claude configuration`
      );
    } else {
      console.log(
        `➕ Adding new MCP server '${serverName}' to Claude configuration`
      );
    }

    // Add or replace the server configuration
    mcpJson.mcpServers[serverName] = serverConfig;

    // Write the updated configuration back to the file
    await Deno.writeTextFile(mcpJsonPath, JSON.stringify(mcpJson, null, 2));

    console.log(`✅ Successfully updated Claude MCP configuration`);
  } catch (error) {
    console.error('❌ Error updating Claude MCP configuration:', error);
  }
}

////////////////////////////////////////////////////////////////////////////////
// SYNC ALL MCP CONFIGURATIONS FROM META.JSON
////////////////////////////////////////////////////////////////////////////////

/**
 * Sync all MCP configurations from meta.json files across the project
 * This function performs a complete cleanup: only MCP servers defined in meta.json files
 * will be kept in the VS Code and Claude MCP configurations
 *
 * Uses the tunnel.ts pattern: CD into each directory and setSecretsOnLocal for proper env var substitution
 */
async function syncAllMCPConfigurationsFromMetaJson(): Promise<void> {
  const SRC = Deno.env.get('SRC');

  if (!SRC) {
    console.error('SRC environment variable is not defined');
    Deno.exit(1);
  }

  const currentPath = Deno.cwd();
  console.log(
    '🔄 Syncing all MCP configurations from meta.json files (cleanup mode)...\n'
  );

  try {
    // Use withMetaMatching to find all directories that have MCP property (like tunnel.ts does)
    const directories = await withMetaMatching({
      property: 'mcp',
      path: SRC,
    });

    // Collect all MCP servers from all meta.json files
    const allMcpServers: Record<string, any> = {};
    let mcpConfigurationsFound = 0;

    console.log('🔍 Collecting MCP servers from meta.json files...');

    // Process each directory with MCP configurations (following tunnel.ts pattern)
    for (const directory of directories) {
      // CD into the directory (like tunnel.ts line 127)
      cd(directory);

      // Load environment variables for this specific directory (like tunnel.ts line 128)
      await setSecretsOnLocal('local');

      // Read meta.json with proper environment context (like tunnel.ts line 129)
      const metaConfig = await verifyIfMetaJsonExists(directory);

      if (metaConfig && metaConfig.mcp) {
        mcpConfigurationsFound++;

        // Loop through all MCP servers in this directory
        const mcpServerNames = Object.keys(metaConfig.mcp);

        for (const serverName of mcpServerNames) {
          console.log(`  ✓ Found MCP server '${serverName}' in ${directory}`);
          allMcpServers[serverName] = metaConfig.mcp[serverName];
        }
      }
    }

    // Return to original directory
    cd(currentPath);

    if (mcpConfigurationsFound === 0) {
      console.log('❌ No MCP configurations found in any meta.json files');
      return;
    }

    console.log(
      `\n📊 Total MCP servers found: ${Object.keys(allMcpServers).length}`
    );
    console.log(`📂 Directories with MCP configs: ${mcpConfigurationsFound}\n`);

    // Now sync Claude, Cursor, and Codex MCP configurations with cleanup (only if they exist)
    await syncClaudeMcpJsonWithCleanup(SRC, allMcpServers);
    await syncCursorMcpJsonWithCleanup(SRC, allMcpServers);
    await syncCodexMcpTomlWithCleanup(SRC, allMcpServers);

    console.log('\n✅ MCP configuration sync completed!');
  } catch (error) {
    console.error('❌ Error syncing MCP configurations:', error);
    Deno.exit(1);
  }
}

/**
 * Sync Cursor MCP configuration with cleanup
 */
async function syncCursorMcpJsonWithCleanup(
  srcPath: string,
  allMcpServers: Record<string, any>
): Promise<void> {
  const cursorDir = `${srcPath}/.cursor`;
  const mcpJsonPath = `${cursorDir}/mcp.json`;

  // Check if .cursor directory exists - if not, skip Cursor configuration
  try {
    await Deno.stat(cursorDir);
  } catch (error) {
    console.log(
      `⚠️  Cursor directory not found at ${cursorDir}, skipping Cursor configuration`
    );
    return;
  }

  console.log(`📝 Syncing MCP configuration for Cursor (.cursor/mcp.json)...`);

  try {
    let existingServers: string[] = [];

    // Read existing Cursor .cursor/mcp.json file to see what servers are currently there
    try {
      const existingContent = await Deno.readTextFile(mcpJsonPath);
      const existingMcpJson = JSON.parse(existingContent);
      if (existingMcpJson.mcpServers) {
        existingServers = Object.keys(existingMcpJson.mcpServers);
      }
    } catch (error) {
      // File doesn't exist or is invalid, start fresh
      existingServers = [];
    }

    // Create fresh configuration with only meta.json servers
    const newMcpJson = {
      mcpServers: { ...allMcpServers },
    };

    // Report what's being removed and added
    const serversToRemove = existingServers.filter(
      (server) => !allMcpServers[server]
    );
    const serversToAdd = Object.keys(allMcpServers).filter(
      (server) => !existingServers.includes(server)
    );
    const serversToUpdate = Object.keys(allMcpServers).filter((server) =>
      existingServers.includes(server)
    );

    if (serversToRemove.length > 0) {
      console.log(
        `  🗑️  Removing servers not in meta.json: ${serversToRemove.join(', ')}`
      );
    }
    if (serversToAdd.length > 0) {
      console.log(`  ➕ Adding new servers: ${serversToAdd.join(', ')}`);
    }
    if (serversToUpdate.length > 0) {
      console.log(
        `  🔄 Updating existing servers: ${serversToUpdate.join(', ')}`
      );
    }

    // Write the updated configuration back to the file
    await Deno.writeTextFile(mcpJsonPath, JSON.stringify(newMcpJson, null, 2));

    console.log(
      `✅ Cursor MCP configuration synced (${
        Object.keys(allMcpServers).length
      } servers)`
    );
  } catch (error) {
    console.error('❌ Error syncing Cursor MCP configuration:', error);
  }
}

/**
 * Convert MCP server config to Codex TOML format
 * Handles HTTP/SSE servers by converting them to stdio using mcp-proxy
 */
function convertToCodexFormat(serverName: string, serverConfig: any): any {
  const codexConfig: any = {};

  // Check if this is an HTTP or SSE server (check for type or transport field)
  if (
    serverConfig.type === 'http' ||
    serverConfig.transport === 'http' ||
    serverConfig.type === 'sse' ||
    serverConfig.transport === 'sse'
  ) {
    // Use mcp-proxy to convert HTTP/SSE to stdio
    codexConfig.command = 'mcp-proxy';
    codexConfig.args = [serverConfig.url];

    // Add transport flag
    const transportType = serverConfig.type || serverConfig.transport;
    if (transportType === 'http') {
      codexConfig.args.push('--transport', 'streamablehttp');
    } else if (transportType === 'sse') {
      codexConfig.args.push('--transport', 'sse');
    }

    // Add headers if present
    if (serverConfig.headers) {
      for (const [key, value] of Object.entries(serverConfig.headers)) {
        codexConfig.args.push('--headers', key, value as string);
      }
    }

    // Environment variables from original config
    if (serverConfig.env) {
      codexConfig.env = serverConfig.env;
    }
  } else {
    // Standard stdio server - convert directly
    if (serverConfig.command) {
      codexConfig.command = serverConfig.command;
    }

    if (serverConfig.args) {
      codexConfig.args = serverConfig.args;
    }

    if (serverConfig.env) {
      codexConfig.env = serverConfig.env;
    }
  }

  // Add startup timeout if specified
  if (serverConfig.startup_timeout_ms) {
    codexConfig.startup_timeout_ms = serverConfig.startup_timeout_ms;
  }

  return codexConfig;
}

/**
 * Update the .codex/config.toml file with the MCP server configuration
 */
async function updateCodexMcpToml(
  srcPath: string,
  serverName: string,
  serverConfig: any,
  reset: boolean
): Promise<void> {
  const codexDir = `${srcPath}/.codex`;
  const configPath = `${codexDir}/config.toml`;

  // Check if .codex directory exists - if not, skip Codex configuration
  try {
    await Deno.stat(codexDir);
  } catch (error) {
    console.log(
      `⚠️  Codex directory not found at ${codexDir}, skipping Codex configuration`
    );
    return;
  }

  console.log(
    `📝 Updating MCP configuration for Codex (.codex/config.toml)...`
  );

  try {
    let configContent = '';
    let nonMcpContent = '';

    // Try to read existing config.toml file
    try {
      configContent = await Deno.readTextFile(configPath);

      // Remove all existing MCP server configurations
      // Split content into lines and filter out MCP server sections
      const lines = configContent.split('\n');
      let inMcpSection = false;
      const filteredLines: string[] = [];

      for (const line of lines) {
        // Check if we're entering an MCP server section
        if (line.startsWith('[mcp_servers.')) {
          inMcpSection = true;
          continue;
        }

        // Check if we're entering a new non-MCP section
        if (line.startsWith('[') && !line.startsWith('[mcp_servers.')) {
          inMcpSection = false;
        }

        // Only keep non-MCP content
        if (!inMcpSection) {
          filteredLines.push(line);
        }
      }

      nonMcpContent = filteredLines.join('\n').trimEnd();
    } catch (error) {
      console.log(`📄 Creating new Codex configuration`);
      nonMcpContent = '';
    }

    // Convert server config to Codex format
    const codexServerConfig = convertToCodexFormat(serverName, serverConfig);

    // Build TOML section manually to ensure proper formatting
    let mcpSection = `[mcp_servers.${serverName}]\n`;
    mcpSection += `command = "${codexServerConfig.command}"\n`;

    if (codexServerConfig.args && codexServerConfig.args.length > 0) {
      mcpSection += `args = [${codexServerConfig.args
        .map((arg: string) => `"${escapeTomlString(arg)}"`)
        .join(', ')}]\n`;
    }

    if (
      codexServerConfig.env &&
      Object.keys(codexServerConfig.env).length > 0
    ) {
      const envPairs = Object.entries(codexServerConfig.env)
        .map(
          ([key, value]) => `"${key}" = "${escapeTomlString(String(value))}"`
        )
        .join(', ');
      mcpSection += `env = { ${envPairs} }\n`;
    }

    if (codexServerConfig.startup_timeout_ms) {
      mcpSection += `startup_timeout_ms = ${codexServerConfig.startup_timeout_ms}\n`;
    }

    // Combine non-MCP content with new MCP server configuration
    let finalContent = nonMcpContent;
    if (finalContent && !finalContent.endsWith('\n')) {
      finalContent += '\n';
    }
    if (finalContent) {
      finalContent += '\n'; // Add extra newline before MCP section
    }
    finalContent += mcpSection;

    // Write the updated configuration back to the file
    await Deno.writeTextFile(configPath, finalContent);

    console.log(`✅ Successfully updated Codex MCP configuration`);
  } catch (error) {
    console.error('❌ Error updating Codex MCP configuration:', error);
  }
}

/**
 * Sync Codex MCP configuration with cleanup
 */
async function syncCodexMcpTomlWithCleanup(
  srcPath: string,
  allMcpServers: Record<string, any>
): Promise<void> {
  const codexDir = `${srcPath}/.codex`;
  const configPath = `${codexDir}/config.toml`;

  // Check if .codex directory exists - if not, skip Codex configuration
  try {
    await Deno.stat(codexDir);
  } catch (error) {
    console.log(
      `⚠️  Codex directory not found at ${codexDir}, skipping Codex configuration`
    );
    return;
  }

  console.log(`📝 Syncing MCP configuration for Codex (.codex/config.toml)...`);

  try {
    let nonMcpContent = '';
    let existingServers: string[] = [];

    // Try to read existing config.toml file
    try {
      const configContent = await Deno.readTextFile(configPath);

      // Parse existing MCP servers and remove them from content
      const lines = configContent.split('\n');
      let inMcpSection = false;
      let currentServerName = '';
      const filteredLines: string[] = [];

      for (const line of lines) {
        // Check if we're entering an MCP server section
        const mcpMatch = line.match(/^\[mcp_servers\.(.+)\]/);
        if (mcpMatch) {
          inMcpSection = true;
          currentServerName = mcpMatch[1];
          existingServers.push(currentServerName);
          continue;
        }

        // Check if we're entering a new non-MCP section
        if (line.startsWith('[') && !line.startsWith('[mcp_servers.')) {
          inMcpSection = false;
        }

        // Only keep non-MCP content
        if (!inMcpSection) {
          filteredLines.push(line);
        }
      }

      nonMcpContent = filteredLines.join('\n').trimEnd();
    } catch (error) {
      // File doesn't exist or is invalid, start fresh
      nonMcpContent = '';
      existingServers = [];
    }

    // Build TOML sections for all servers manually to ensure proper formatting
    let mcpSection = '';
    for (const [name, config] of Object.entries(allMcpServers)) {
      const codexConfig = convertToCodexFormat(name, config);

      if (mcpSection) {
        mcpSection += '\n'; // Add blank line between servers
      }

      mcpSection += `[mcp_servers.${name}]\n`;
      mcpSection += `command = "${escapeTomlString(codexConfig.command)}"\n`;

      if (codexConfig.args && codexConfig.args.length > 0) {
        mcpSection += `args = [${codexConfig.args
          .map((arg: string) => `"${escapeTomlString(arg)}"`)
          .join(', ')}]\n`;
      }

      if (codexConfig.env && Object.keys(codexConfig.env).length > 0) {
        const envPairs = Object.entries(codexConfig.env)
          .map(
            ([key, value]) => `"${key}" = "${escapeTomlString(String(value))}"`
          )
          .join(', ');
        mcpSection += `env = { ${envPairs} }\n`;
      }

      if (codexConfig.startup_timeout_ms) {
        mcpSection += `startup_timeout_ms = ${codexConfig.startup_timeout_ms}\n`;
      }
    }

    // Report what's being removed and added
    const serversToRemove = existingServers.filter(
      (server) => !allMcpServers[server]
    );
    const serversToAdd = Object.keys(allMcpServers).filter(
      (server) => !existingServers.includes(server)
    );
    const serversToUpdate = Object.keys(allMcpServers).filter((server) =>
      existingServers.includes(server)
    );

    if (serversToRemove.length > 0) {
      console.log(
        `  🗑️  Removing servers not in meta.json: ${serversToRemove.join(', ')}`
      );
    }
    if (serversToAdd.length > 0) {
      console.log(`  ➕ Adding new servers: ${serversToAdd.join(', ')}`);
    }
    if (serversToUpdate.length > 0) {
      console.log(
        `  🔄 Updating existing servers: ${serversToUpdate.join(', ')}`
      );
    }

    // Combine non-MCP content with new MCP servers configuration
    let finalContent = nonMcpContent;
    if (finalContent && !finalContent.endsWith('\n')) {
      finalContent += '\n';
    }
    if (finalContent) {
      finalContent += '\n'; // Add extra newline before MCP section
    }
    finalContent += mcpSection;

    // Write the updated configuration back to the file
    await Deno.writeTextFile(configPath, finalContent);

    console.log(
      `✅ Codex MCP configuration synced (${
        Object.keys(allMcpServers).length
      } servers)`
    );
  } catch (error) {
    console.error('❌ Error syncing Codex MCP configuration:', error);
  }
}

/**
 * Sync Claude MCP configuration with cleanup
 */
async function syncClaudeMcpJsonWithCleanup(
  srcPath: string,
  allMcpServers: Record<string, any>
): Promise<void> {
  const mcpJsonPath = `${srcPath}/.mcp.json`;

  // Check if Claude MCP file exists
  try {
    await Deno.stat(mcpJsonPath);
  } catch (error) {
    console.log(
      `⚠️  Claude MCP file not found at ${mcpJsonPath}, skipping Claude configuration`
    );
    return;
  }

  console.log(`📝 Syncing MCP configuration for Claude Code (.mcp.json)...`);

  try {
    let existingServers: string[] = [];

    // Read existing Claude .mcp.json file to see what servers are currently there
    try {
      const existingContent = await Deno.readTextFile(mcpJsonPath);
      const existingMcpJson = JSON.parse(existingContent);
      if (existingMcpJson.mcpServers) {
        existingServers = Object.keys(existingMcpJson.mcpServers);
      }
    } catch (error) {
      // File doesn't exist or is invalid, start fresh
      existingServers = [];
    }

    // Create fresh configuration with only meta.json servers
    const newMcpJson = {
      mcpServers: { ...allMcpServers },
    };

    // Report what's being removed and added
    const serversToRemove = existingServers.filter(
      (server) => !allMcpServers[server]
    );
    const serversToAdd = Object.keys(allMcpServers).filter(
      (server) => !existingServers.includes(server)
    );
    const serversToUpdate = Object.keys(allMcpServers).filter((server) =>
      existingServers.includes(server)
    );

    if (serversToRemove.length > 0) {
      console.log(
        `  🗑️  Removing servers not in meta.json: ${serversToRemove.join(', ')}`
      );
    }
    if (serversToAdd.length > 0) {
      console.log(`  ➕ Adding new servers: ${serversToAdd.join(', ')}`);
    }
    if (serversToUpdate.length > 0) {
      console.log(
        `  🔄 Updating existing servers: ${serversToUpdate.join(', ')}`
      );
    }

    // Write the updated configuration back to the file
    await Deno.writeTextFile(mcpJsonPath, JSON.stringify(newMcpJson, null, 2));

    console.log(
      `✅ Claude MCP configuration synced (${
        Object.keys(allMcpServers).length
      } servers)`
    );
  } catch (error) {
    console.error('❌ Error syncing Claude MCP configuration:', error);
  }
}
