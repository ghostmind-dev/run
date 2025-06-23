/**
 * @fileoverview Machine operations module for @ghostmind/run
 *
 * This module provides functionality for initializing new projects with
 * devcontainer configurations, Git repositories, and project templates.
 *
 * @module
 */

import { $, cd, spinner, sleep, question } from 'npm:zx@8.1.0';
import Table from 'npm:cli-table3@0.6.5';
import {
  createUUID,
  verifyIfMetaJsonExists,
  withMetaMatching,
} from '../utils/divers.ts';
import inquirer from 'npm:inquirer@9.2.22';
import fs from 'npm:fs-extra@11.2.0';
import prettier from 'npm:prettier@3.3.2';
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

  const pathFromHome = currentPath.replace(`${Deno.env.get('HOME')}/`, '');

  /// diable cache for now

  await $`mkdir -p ${currentPath}/${projectName}`;

  cd(`${currentPath}/${projectName}`);

  // Always create .env template from repository
  const envTemplateResponse = await fetch(
    'https://raw.githubusercontent.com/ghostmind-dev/config/refs/heads/main/config/env/template.md',
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

    devcontainer.name = projectName;
    devcontainer.build.args.PROJECT_DIR =
      '${env:HOME}${env:USERPROFILE}/' + pathFromHome + '/' + projectName;
    devcontainer.remoteEnv.LOCALHOST_SRC =
      '${env:HOME}${env:USERPROFILE}/' + pathFromHome + '/' + projectName;
    devcontainer.mounts[2] = `source=ghostmind-${projectName}-history,target=/commandhistory,type=volume`;
    devcontainer.mounts[3] =
      'source=${env:HOME}${env:USERPROFILE}/' +
      pathFromHome +
      '/' +
      projectName +
      ',' +
      `target=${Deno.env.get('HOME')}/${pathFromHome}/${projectName},type=bind`;

    devcontainer.runArgs[3] = `--name=${projectName}`;

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
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function machine(program: any) {
  const machine = program.command('machine');
  machine.description('create a devcontainer for the project');

  const init = machine.command('init');
  init.description('create a devcontainer for the project');
  init.action(machineInit);
}
