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

import { $, within, cd } from 'npm:zx@8.1.0';

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
    .option('--all', 'Sync all MCP configurations from meta.json files (cleanup mode)')
    .action(
      async (
        serverName: string | undefined,
        options: { all?: boolean }
      ) => {
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

    // Now update both VS Code and Claude MCP configuration files
    await updateMcpConfigurations(serverName, mcpServerConfig, false);
  } catch (error) {
    console.error('❌ Error searching for MCP server:', error);
    Deno.exit(1);
  }
}

/**
 * Update both VS Code and Claude MCP configuration files
 */
async function updateMcpConfigurations(
  serverName: string,
  serverConfig: any,
  reset: boolean
): Promise<void> {
  const SRC = Deno.env.get('SRC');

  if (!SRC) {
    console.error('SRC environment variable is not defined');
    Deno.exit(1);
  }

  console.log(`📝 Updating MCP configurations for all tools...`);

  // Update VS Code configuration
  await updateVSCodeMcpJson(SRC, serverName, serverConfig, reset);
  
  // Update Claude configuration  
  await updateClaudeMcpJson(SRC, serverName, serverConfig, reset);
}

/**
 * Update the .vscode/mcp.json file with the MCP server configuration
 */
async function updateVSCodeMcpJson(
  srcPath: string,
  serverName: string,
  serverConfig: any,
  reset: boolean
): Promise<void> {
  const vscodeDir = `${srcPath}/.vscode`;
  const mcpJsonPath = `${vscodeDir}/mcp.json`;

  // Check if VS Code MCP file exists
  try {
    await Deno.stat(mcpJsonPath);
  } catch (error) {
    console.log(`⚠️  VS Code MCP file not found at ${mcpJsonPath}, skipping VS Code configuration`);
    return;
  }

  console.log(`📝 Updating VS Code MCP configuration (.vscode/mcp.json)...`);

  try {
    let mcpJson: any = { servers: {} };

    // If reset flag is true, start with a fresh configuration
    if (reset) {
      console.log(`🔄 Resetting VS Code MCP configuration`);
      mcpJson = { servers: {} };
    } else {
      // Try to read existing VS Code mcp.json file
      try {
        const existingContent = await Deno.readTextFile(mcpJsonPath);
        mcpJson = JSON.parse(existingContent);

        // Ensure servers property exists
        if (!mcpJson.servers) {
          mcpJson.servers = {};
        }
      } catch (error) {
        console.log(`📄 Creating new VS Code MCP configuration`);
        mcpJson = { servers: {} };
      }
    }

    // Check if server already exists (only relevant when not resetting)
    const serverExists = !reset && mcpJson.servers[serverName] !== undefined;

    if (reset) {
      console.log(`➕ Adding MCP server '${serverName}' to fresh VS Code configuration`);
    } else if (serverExists) {
      console.log(`🔄 Updating existing MCP server '${serverName}' in VS Code configuration`);
    } else {
      console.log(`➕ Adding new MCP server '${serverName}' to VS Code configuration`);
    }

    // Add or replace the server configuration
    mcpJson.servers[serverName] = serverConfig;

    // Write the updated configuration back to the file
    await Deno.writeTextFile(mcpJsonPath, JSON.stringify(mcpJson, null, 2));

    console.log(`✅ Successfully updated VS Code MCP configuration`);
  } catch (error) {
    console.error('❌ Error updating VS Code MCP configuration:', error);
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
    console.log(`⚠️  Claude MCP file not found at ${mcpJsonPath}, skipping Claude configuration`);
    return;
  }

  console.log(`📝 Updating Claude MCP configuration (.mcp.json)...`);

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
      console.log(`➕ Adding MCP server '${serverName}' to fresh Claude configuration`);
    } else if (serverExists) {
      console.log(`🔄 Updating existing MCP server '${serverName}' in Claude configuration`);
    } else {
      console.log(`➕ Adding new MCP server '${serverName}' to Claude configuration`);
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
  console.log('🔄 Syncing all MCP configurations from meta.json files (cleanup mode)...\n');

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

    console.log(`\n📊 Total MCP servers found: ${Object.keys(allMcpServers).length}`);
    console.log(`📂 Directories with MCP configs: ${mcpConfigurationsFound}\n`);

    // Now sync both VS Code and Claude MCP configurations with cleanup
    await syncMcpConfigurationsWithCleanup(SRC, allMcpServers);

    console.log('\n✅ MCP configuration sync completed!');
  } catch (error) {
    console.error('❌ Error syncing MCP configurations:', error);
    Deno.exit(1);
  }
}

/**
 * Sync MCP configurations with cleanup - only keep servers defined in meta.json files
 */
async function syncMcpConfigurationsWithCleanup(
  srcPath: string,
  allMcpServers: Record<string, any>
): Promise<void> {
  console.log('🧹 Performing cleanup sync for all MCP configurations...');

  // Sync VS Code configuration
  await syncVSCodeMcpJsonWithCleanup(srcPath, allMcpServers);
  
  // Sync Claude configuration  
  await syncClaudeMcpJsonWithCleanup(srcPath, allMcpServers);
}

/**
 * Sync VS Code MCP configuration with cleanup
 */
async function syncVSCodeMcpJsonWithCleanup(
  srcPath: string,
  allMcpServers: Record<string, any>
): Promise<void> {
  const vscodeDir = `${srcPath}/.vscode`;
  const mcpJsonPath = `${vscodeDir}/mcp.json`;

  // Check if VS Code MCP file exists
  try {
    await Deno.stat(mcpJsonPath);
  } catch (error) {
    console.log(`⚠️  VS Code MCP file not found at ${mcpJsonPath}, skipping VS Code configuration`);
    return;
  }

  console.log(`📝 Syncing VS Code MCP configuration (.vscode/mcp.json)...`);

  try {
    let existingServers: string[] = [];
    
    // Read existing VS Code mcp.json file to see what servers are currently there
    try {
      const existingContent = await Deno.readTextFile(mcpJsonPath);
      const existingMcpJson = JSON.parse(existingContent);
      if (existingMcpJson.servers) {
        existingServers = Object.keys(existingMcpJson.servers);
      }
    } catch (error) {
      // File doesn't exist or is invalid, start fresh
      existingServers = [];
    }

    // Create fresh configuration with only meta.json servers
    const newMcpJson = {
      servers: { ...allMcpServers }
    };

    // Report what's being removed and added
    const serversToRemove = existingServers.filter(server => !allMcpServers[server]);
    const serversToAdd = Object.keys(allMcpServers).filter(server => !existingServers.includes(server));
    const serversToUpdate = Object.keys(allMcpServers).filter(server => existingServers.includes(server));

    if (serversToRemove.length > 0) {
      console.log(`  🗑️  Removing servers not in meta.json: ${serversToRemove.join(', ')}`);
    }
    if (serversToAdd.length > 0) {
      console.log(`  ➕ Adding new servers: ${serversToAdd.join(', ')}`);
    }
    if (serversToUpdate.length > 0) {
      console.log(`  🔄 Updating existing servers: ${serversToUpdate.join(', ')}`);
    }

    // Write the updated configuration back to the file
    await Deno.writeTextFile(mcpJsonPath, JSON.stringify(newMcpJson, null, 2));

    console.log(`✅ VS Code MCP configuration synced (${Object.keys(allMcpServers).length} servers)`);
  } catch (error) {
    console.error('❌ Error syncing VS Code MCP configuration:', error);
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
    console.log(`⚠️  Claude MCP file not found at ${mcpJsonPath}, skipping Claude configuration`);
    return;
  }

  console.log(`📝 Syncing Claude MCP configuration (.mcp.json)...`);

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
      mcpServers: { ...allMcpServers }
    };

    // Report what's being removed and added
    const serversToRemove = existingServers.filter(server => !allMcpServers[server]);
    const serversToAdd = Object.keys(allMcpServers).filter(server => !existingServers.includes(server));
    const serversToUpdate = Object.keys(allMcpServers).filter(server => existingServers.includes(server));

    if (serversToRemove.length > 0) {
      console.log(`  🗑️  Removing servers not in meta.json: ${serversToRemove.join(', ')}`);
    }
    if (serversToAdd.length > 0) {
      console.log(`  ➕ Adding new servers: ${serversToAdd.join(', ')}`);
    }
    if (serversToUpdate.length > 0) {
      console.log(`  🔄 Updating existing servers: ${serversToUpdate.join(', ')}`);
    }

    // Write the updated configuration back to the file
    await Deno.writeTextFile(mcpJsonPath, JSON.stringify(newMcpJson, null, 2));

    console.log(`✅ Claude MCP configuration synced (${Object.keys(allMcpServers).length} servers)`);
  } catch (error) {
    console.error('❌ Error syncing Claude MCP configuration:', error);
  }
}
