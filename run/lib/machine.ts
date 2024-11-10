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

export async function machineInit() {
  // ask for the project name

  const { projectName } = await inquirer.prompt([
    {
      type: 'input',
      name: 'projectName',
      message: 'What is the name of the project?',
    },
  ]);

  const pathFromHome = currentPath.replace(`${Deno.env.get('HOME')}/`, '');

  /// diable cache for now

  await $`mkdir -p ${currentPath}/${projectName}`;

  cd(`${currentPath}/${projectName}`);

  await $`mkdir -p ${currentPath}/${projectName}/.devcontainer`;

  const defaultDevcontainerJsonRaw = await fetch(
    'https://raw.githubusercontent.com/ghostmind-dev/config/main/config/devcontainer/devcontainer.json',
    {
      headers: {
        'Cache-Control': 'no-cache',
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

  await $`rm -rf .git`;

  await $`git init`;

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
