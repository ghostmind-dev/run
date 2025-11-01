/**
 * @fileoverview Machine operations module for @ghostmind/run
 *
 * This module provides functionality for initializing new projects with
 * devcontainer configurations, Git repositories, and project templates.
 *
 * @module
 */

import { $, cd } from 'npm:zx@8.1.0';
import { createUUID } from '../utils/divers.ts';
import inquirer from 'npm:inquirer@9.2.22';
import fs from 'npm:fs-extra@11.2.0';
import _ from 'npm:lodash@4.17.21';

////////////////////////////////////////////////////////////////////////////////
// MUTE BY DEFAULT
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

////////////////////////////////////////////////////////////////////////////////
// RUNNING COMMAND LOCATION
////////////////////////////////////////////////////////////////////////////////

let currentPath = Deno.cwd();

cd(currentPath);

////////////////////////////////////////////////////////////////////////////////
// INIT
////////////////////////////////////////////////////////////////////////////////

/**
 * Initialize a new project with devcontainer and configuration files
 *
 * This function creates a new project directory with devcontainer setup,
 * Git repository initialization, and standard configuration files including
 * meta.json, .gitignore, README, and VS Code settings.
 *
 * @example
 * ```typescript
 * // Initialize a new project (prompts for project name and home directory)
 * await machineInit();
 * ```
 */
export async function machineInit() {
  // ask for the project name and home directory
  const { projectName, homeDirectory } = await inquirer.prompt([
    {
      type: 'input',
      name: 'projectName',
      message: 'What is the name of the project?',
    },
    {
      type: 'input',
      name: 'homeDirectory',
      message: 'What is the home directory for projects?',
      default: Deno.env.get('RUN_PROJECT') || Deno.env.get('HOME'),
    },
  ]);

  const HOME = homeDirectory;

  const pathFromHome = currentPath.replace(`${HOME}/`, '');

  /// diable cache for now

  await $`mkdir -p ${currentPath}/${projectName}`;

  cd(`${currentPath}/${projectName}`);

  // Always create .env template from repository
  const envTemplateResponse = await fetch(
    'https://raw.githubusercontent.com/ghostmind-dev/config/refs/heads/main/config/env/.env.template',
    {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    }
  );
  const envTemplateContent = await envTemplateResponse.text();

  await fs.writeFile(`.env.template`, envTemplateContent, 'utf8');

  // Always create devcontainer
  await $`mkdir -p ${currentPath}/${projectName}/.devcontainer`;

  const defaultDevcontainerJsonRaw = await fetch(
    'https://raw.githubusercontent.com/ghostmind-dev/config/main/config/devcontainer/devcontainer.json',
    {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    }
  );

  let devcontainer = await defaultDevcontainerJsonRaw.json();

  // // Change the name of the container

  ///////////////////////////////////////////////////////////////////////////////////////////////
  ///////////////////////////////////////////////////////////////////////////////////////////////

  // SETTING THINGS UP

  ///////////////////////////////////////////////////////////////////////////////////////////////
  ///////////////////////////////////////////////////////////////////////////////////////////////

  devcontainer.name = projectName;
  devcontainer.runArgs.push(`--name=${projectName}`);

  ///////////////////////////////////////////////////////////////////////////////////////////////
  ///////////////////////////////////////////////////////////////////////////////////////////////

  // SETTING THINGS UP

  ///////////////////////////////////////////////////////////////////////////////////////////////
  ///////////////////////////////////////////////////////////////////////////////////////////////

  // // write the file back

  await fs.writeFile(
    `${currentPath}/${projectName}/.devcontainer/devcontainer.json`,
    JSON.stringify(devcontainer, null, 2),
    'utf8'
  );

  await $`curl -o ${currentPath}/${projectName}/.devcontainer/Dockerfile https://raw.githubusercontent.com/ghostmind-dev/config/main/config/devcontainer/Dockerfile`;

  await $`mkdir -p ${currentPath}/${projectName}/.devcontainer/library-scripts`;

  await $`curl -o ${currentPath}/${projectName}/.devcontainer/library-scripts/post-start.ts https://raw.githubusercontent.com/ghostmind-dev/config/main/config/devcontainer/library-scripts/post-start.ts`;

  // // now , we need to modify ./meta.json

  await $`curl -o ${currentPath}/${projectName}/.gitignore https://raw.githubusercontent.com/ghostmind-dev/config/main/config/git/.gitignore`;

  // create a new meta.json file

  await fs.writeJson(`${currentPath}/${projectName}/meta.json`, {
    id: await createUUID(),
    name: projectName,
    type: 'app',
  });

  // // now we need replace the content of Readme.md and only write a ssingle line header

  await fs.writeFile(
    `${currentPath}/${projectName}/Readme.md`,
    `# ${projectName}`,
    'utf8'
  );

  await $`mkdir -p ${currentPath}/${projectName}/.vscode`;

  await $`curl -o ${currentPath}/${projectName}/.vscode/settings.json https://raw.githubusercontent.com/ghostmind-dev/config/main/config/vscode/settings.json`;

  $.verbose = true;

  // Always initialize Git repository
  await $`rm -rf .git`;
  await $`git init`;

  Deno.exit(0);
}

////////////////////////////////////////////////////////////////////////////////
// MOVE
////////////////////////////////////////////////////////////////////////////////

/**
 * Resolve a path to absolute form, handling both relative and absolute paths
 *
 * @param inputPath - The path to resolve (can be relative or absolute)
 * @param basePath - The base path to use for relative paths (defaults to current directory)
 * @returns Promise resolving to the absolute path
 */
async function resolvePath(
  inputPath: string,
  basePath: string = currentPath
): Promise<string> {
  // If path is absolute, use it as-is
  if (inputPath.startsWith('/')) {
    return inputPath;
  }

  // If path is relative, resolve relative to basePath
  const fullPath = `${basePath}/${inputPath}`;

  try {
    // Try to resolve the real path if it exists
    return await fs.realpath(fullPath);
  } catch {
    // If path doesn't exist, manually resolve it
    // This handles cases like ../folder or ./folder where the target doesn't exist yet
    const parts = fullPath.split('/').filter((part) => part !== '');
    const resolvedParts: string[] = [];

    for (const part of parts) {
      if (part === '.') {
        // Current directory, skip
        continue;
      } else if (part === '..') {
        // Parent directory, remove last part
        resolvedParts.pop();
      } else {
        // Regular directory name
        resolvedParts.push(part);
      }
    }

    return '/' + resolvedParts.join('/');
  }
}

/**
 * Move a project to a new location and update devcontainer configuration
 *
 * This function moves an existing project directory to a new location and
 * updates the devcontainer configuration to reflect the new path, specifically
 * the LOCALHOST_SRC environment variable.
 *
 * @param sourcePath - The source path (can be relative or absolute)
 * @param destinationPath - The destination path where the project should be moved (can be relative or absolute)
 *
 * @example
 * ```typescript
 * // Move project using relative paths
 * await machineMove("my-app", "../new-location");
 *
 * // Move project using absolute paths
 * await machineMove("/current/path/my-app", "/Volumes/Projects/new-location");
 *
 * // Mix relative and absolute paths
 * await machineMove("../my-app", "/Volumes/Projects/new-location");
 * ```
 */
export async function machineMove(sourcePath: string, destinationPath: string) {
  // Resolve both source and destination paths to handle relative/absolute paths
  const resolvedSourcePath = await resolvePath(sourcePath);
  const resolvedDestinationPath = await resolvePath(destinationPath);

  // Extract the project name from the source path
  const sourceProjectName = resolvedSourcePath.split('/').pop() || '';
  const fullDestinationPath = `${resolvedDestinationPath}/${sourceProjectName}`;

  // Check if source project exists
  if (!(await fs.pathExists(resolvedSourcePath))) {
    console.error(`Source project "${resolvedSourcePath}" does not exist.`);
    Deno.exit(1);
  }

  // Check if destination already exists
  if (await fs.pathExists(fullDestinationPath)) {
    console.error(`Destination "${fullDestinationPath}" already exists.`);
    Deno.exit(1);
  }

  // Update devcontainer configuration if it exists BEFORE moving
  const devcontainerPath = `${resolvedSourcePath}/.devcontainer/devcontainer.json`;

  if (await fs.pathExists(devcontainerPath)) {
    console.log('Updating devcontainer configuration...');

    // Read existing devcontainer config
    const devcontainer = await fs.readJson(devcontainerPath);

    // Update LOCALHOST_SRC with the resolved destination path
    if (devcontainer.remoteEnv && devcontainer.remoteEnv.LOCALHOST_SRC) {
      devcontainer.remoteEnv.LOCALHOST_SRC = fullDestinationPath;

      // Write updated configuration back
      await fs.writeJson(devcontainerPath, devcontainer, { spaces: 2 });

      console.log(
        `Updated LOCALHOST_SRC to: ${devcontainer.remoteEnv.LOCALHOST_SRC}`
      );
    }
  }

  // Ensure destination directory exists
  await fs.ensureDir(resolvedDestinationPath);

  console.log(`Moving ${resolvedSourcePath} to ${fullDestinationPath}...`);

  // Move the project folder
  await fs.move(resolvedSourcePath, fullDestinationPath);

  console.log(
    `Successfully moved project "${sourceProjectName}" to "${fullDestinationPath}"`
  );
}

////////////////////////////////////////////////////////////////////////////////
// UPDATE
////////////////////////////////////////////////////////////////////////////////

/**
 * Update extensions in devcontainer configuration
 *
 * This function fetches the latest extensions list from the remote config repository
 * and updates the local .devcontainer/devcontainer.json file, adding any new extensions
 * while preserving existing ones.
 *
 * @example
 * ```typescript
 * // Update extensions from remote config
 * await machineUpdateExtensions();
 * ```
 */
export async function machineUpdateExtensions() {
  const devcontainerPath = `${currentPath}/.devcontainer/devcontainer.json`;

  // Check if .devcontainer folder exists
  if (!(await fs.pathExists(devcontainerPath))) {
    console.error(
      'Error: .devcontainer/devcontainer.json not found in current directory.'
    );
    console.error('Please run this command from the root of your project.');
    Deno.exit(1);
  }

  console.log('Fetching remote extensions list...');

  // Fetch remote extensions list
  const remoteExtensionsResponse = await fetch(
    'https://raw.githubusercontent.com/ghostmind-dev/config/main/config/vscode/extensions.json',
    {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    }
  );

  if (!remoteExtensionsResponse.ok) {
    console.error('Error: Failed to fetch remote extensions list.');
    Deno.exit(1);
  }

  const remoteExtensions: string[] = await remoteExtensionsResponse.json();
  console.log(`Found ${remoteExtensions.length} extensions in remote config.`);

  // Read local devcontainer.json
  console.log('Reading local devcontainer configuration...');
  const devcontainer = await fs.readJson(devcontainerPath);

  // Get current extensions list
  const currentExtensions: string[] =
    devcontainer?.customizations?.vscode?.extensions || [];
  console.log(`Found ${currentExtensions.length} extensions in local config.`);

  // Compare and merge extensions lists
  const newExtensions = remoteExtensions.filter(
    (ext) => !currentExtensions.includes(ext)
  );

  if (newExtensions.length === 0) {
    console.log(
      '✅ All remote extensions are already present in local config.'
    );
    return;
  }

  console.log(`Adding ${newExtensions.length} new extensions:`);
  newExtensions.forEach((ext) => console.log(`  + ${ext}`));

  // Update devcontainer configuration
  const updatedExtensions = [...currentExtensions, ...newExtensions];

  // Ensure customizations structure exists
  if (!devcontainer.customizations) {
    devcontainer.customizations = {};
  }
  if (!devcontainer.customizations.vscode) {
    devcontainer.customizations.vscode = {};
  }

  devcontainer.customizations.vscode.extensions = updatedExtensions;

  // Write updated configuration back
  await fs.writeJson(devcontainerPath, devcontainer, { spaces: 2 });

  console.log('✅ Successfully updated devcontainer extensions configuration.');
  console.log(`Total extensions: ${updatedExtensions.length}`);
}

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function machine(program: any) {
  const machine = program.command('machine');
  machine.description('create a devcontainer for the project');

  const init = machine.command('init');
  init.description('create a devcontainer for the project');
  init.action(machineInit);

  const move = machine.command('move');
  move.description('move a project to a new location and update devcontainer');
  move.argument(
    '<sourcePath>',
    'source path of the project to move (relative or absolute)'
  );
  move.argument(
    '<destinationPath>',
    'destination path where the project should be moved (relative or absolute)'
  );
  move.action(machineMove);

  const update = machine.command('update');
  update.description('update project configuration');

  const updateExtensions = update.command('extensions');
  updateExtensions.description(
    'update devcontainer extensions from remote config'
  );
  updateExtensions.action(machineUpdateExtensions);
}
