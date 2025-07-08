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
 * This function creates a new project directory with optional devcontainer setup,
 * Git repository initialization, and standard configuration files including
 * meta.json, .gitignore, README, and VS Code settings.
 *
 * @example
 * ```typescript
 * // Initialize a new project (interactive prompts will guide setup)
 * await machineInit();
 * ```
 */
export async function machineInit() {
  // ask for the project name
  const { projectName, needsDevcontainer, needsGitRepo } =
    await inquirer.prompt([
      {
        type: 'input',
        name: 'projectName',
        message: 'What is the name of the project?',
      },
      {
        type: 'confirm',
        name: 'needsDevcontainer',
        message: 'Do you need a devcontainer?',
        default: true,
      },
      {
        type: 'confirm',
        name: 'needsGitRepo',
        message: 'Do you want to initialize a Git repository?',
        default: true,
      },
    ]);

  const HOME = '/Volumes/Projects';

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

  // Conditionally create devcontainer
  if (needsDevcontainer) {
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
    devcontainer.remoteEnv.LOCALHOST_SRC =
      `${HOME}/` + pathFromHome + '/' + projectName;

    devcontainer.runArgs[3] = `--name=${projectName}`;

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

    await $`curl -o ${currentPath}/${projectName}/.devcontainer/library-scripts/post-create.ts https://raw.githubusercontent.com/ghostmind-dev/config/main/config/devcontainer/library-scripts/post-create.ts`;
  }

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

  // Conditionally initialize Git repository
  if (needsGitRepo) {
    await $`rm -rf .git`;
    await $`git init`;
  }

  Deno.exit(0);
}

////////////////////////////////////////////////////////////////////////////////
// MOVE
////////////////////////////////////////////////////////////////////////////////

/**
 * Move a project to a new location and update devcontainer configuration
 *
 * This function moves an existing project directory to a new location and
 * updates the devcontainer configuration to reflect the new path, specifically
 * the LOCALHOST_SRC environment variable.
 *
 * @param sourceProject - The name of the project folder to move
 * @param destinationPath - The destination path where the project should be moved
 *
 * @example
 * ```typescript
 * // Move project "my-app" to "/Volumes/Projects/new-location"
 * await machineMove("my-app", "/Volumes/Projects/new-location");
 * ```
 */
export async function machineMove(
  sourceProject: string,
  destinationPath: string
) {
  const HOME = '/Volumes/Projects';

  // Construct full paths
  const sourcePath = `${currentPath}/${sourceProject}`;

  // Resolve destination path to handle relative paths
  let resolvedDestinationPath: string;
  try {
    resolvedDestinationPath = await fs.realpath(destinationPath);
  } catch {
    // If path doesn't exist, resolve parent and append the last part
    const parentPath = destinationPath.split('/').slice(0, -1).join('/');
    const lastPart = destinationPath.split('/').slice(-1)[0];
    try {
      const resolvedParent = await fs.realpath(parentPath);
      resolvedDestinationPath = `${resolvedParent}/${lastPart}`;
    } catch {
      // Fallback to the original path if resolution fails
      resolvedDestinationPath = destinationPath;
    }
  }

  const fullDestinationPath = `${resolvedDestinationPath}/${sourceProject}`;

  // Check if source project exists
  if (!(await fs.pathExists(sourcePath))) {
    console.error(`Source project "${sourcePath}" does not exist.`);
    Deno.exit(1);
  }

  // Check if destination already exists
  if (await fs.pathExists(fullDestinationPath)) {
    console.error(`Destination "${fullDestinationPath}" already exists.`);
    Deno.exit(1);
  }

  // Update devcontainer configuration if it exists BEFORE moving
  const devcontainerPath = `${sourcePath}/.devcontainer/devcontainer.json`;

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

  console.log(`Moving ${sourcePath} to ${fullDestinationPath}...`);

  // Move the project folder
  await fs.move(sourcePath, fullDestinationPath);

  console.log(
    `Successfully moved project "${sourceProject}" to "${fullDestinationPath}"`
  );
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
  move.argument('<sourceProject>', 'name of the project folder to move');
  move.argument(
    '<destinationPath>',
    'destination path where the project should be moved'
  );
  move.action(machineMove);
}
