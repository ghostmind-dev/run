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
    .option('--all', 'Process all MCP configurations found in the project')
    .action(
      async (serverName: string | undefined, options: { all?: boolean }) => {
        const { all } = options;

        if (all) {
          await discoverAndPrintMCPConfigurations();
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
 * Find a specific MCP server configuration by name and update .cursor/mcp.json
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

    // Now update the .cursor/mcp.json file
    await updateCursorMcpJson(serverName, mcpServerConfig);
  } catch (error) {
    console.error('❌ Error searching for MCP server:', error);
    Deno.exit(1);
  }
}

/**
 * Update the .cursor/mcp.json file with the MCP server configuration
 */
async function updateCursorMcpJson(
  serverName: string,
  serverConfig: any
): Promise<void> {
  const SRC = Deno.env.get('SRC');
  const mcpJsonPath = `${SRC}/.cursor/mcp.json`;

  console.log(`📝 Updating .cursor/mcp.json...`);

  try {
    let mcpJson: any = { mcpServers: {} };

    // Try to read existing .cursor/mcp.json file
    try {
      const existingContent = await Deno.readTextFile(mcpJsonPath);
      mcpJson = JSON.parse(existingContent);

      // Ensure mcpServers property exists
      if (!mcpJson.mcpServers) {
        mcpJson.mcpServers = {};
      }
    } catch (error) {
      // File doesn't exist or is invalid, use default structure
      console.log(`📄 Creating new .cursor/mcp.json file`);
      mcpJson = { mcpServers: {} };
    }

    // Check if server already exists
    const serverExists = mcpJson.mcpServers[serverName] !== undefined;

    if (serverExists) {
      console.log(`🔄 Replacing existing MCP server '${serverName}'`);
    } else {
      console.log(`➕ Adding new MCP server '${serverName}'`);
    }

    // Add or replace the server configuration (preserving all other existing servers)
    mcpJson.mcpServers[serverName] = serverConfig;

    // Write the updated configuration back to the file
    await Deno.writeTextFile(mcpJsonPath, JSON.stringify(mcpJson, null, 4));

    console.log(
      `✅ Successfully added MCP server '${serverName}' to .cursor/mcp.json`
    );
  } catch (error) {
    console.error('❌ Error updating .cursor/mcp.json:', error);
    Deno.exit(1);
  }
}

////////////////////////////////////////////////////////////////////////////////
// DISCOVER AND PRINT MCP CONFIGURATIONS
////////////////////////////////////////////////////////////////////////////////

/**
 * Discover all directories with meta.json files containing MCP configurations
 * and print directory paths with their MCP server names
 */
async function discoverAndPrintMCPConfigurations(): Promise<void> {
  const SRC = Deno.env.get('SRC');

  if (!SRC) {
    console.error('SRC environment variable is not defined');
    Deno.exit(1);
  }

  console.log('🔍 Discovering MCP configurations...\n');

  try {
    // Get all directories recursively
    const directories = await recursiveDirectoriesDiscovery(SRC);

    // Add the SRC directory itself since recursiveDirectoriesDiscovery doesn't include it
    // but there's always a meta.json file in the SRC folder
    directories.unshift(SRC);

    let mcpConfigurationsFound = 0;

    // Check each directory for meta.json with mcp property
    for (const directory of directories) {
      const metaConfig = await verifyIfMetaJsonExists(directory);

      if (metaConfig && metaConfig.mcp) {
        mcpConfigurationsFound++;

        // Loop through all MCP servers in this directory
        const mcpServerNames = Object.keys(metaConfig.mcp);

        for (const serverName of mcpServerNames) {
          console.log(`${directory} ${serverName}`);

          // Run the mcp set command from within the directory context
          await within(async () => {
            cd(directory);
            $.verbose = true;

            // Get the path to the current command binary
            const currentScriptPath = new URL(import.meta.url).pathname;
            const binPath = currentScriptPath.replace(
              '/lib/mcp.ts',
              '/bin/cmd.ts'
            );

            await $`${binPath} mcp set ${serverName}`;
          });
        }
      }
    }

    if (mcpConfigurationsFound === 0) {
      console.log('❌ No MCP configurations found in any meta.json files');
    }
  } catch (error) {
    console.error('❌ Error discovering MCP configurations:', error);
    Deno.exit(1);
  }
}
