import { $, cd, fs } from 'npm:zx';
import { detectScriptsDirectory } from '../utils/divers.ts';
import inquirer from 'npm:inquirer';

////////////////////////////////////////////////////////////////////////////////
// MUTE BY DEFAULT
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

////////////////////////////////////////////////////////////////////////////////
// RUNNING COMMAND LOCATION
////////////////////////////////////////////////////////////////////////////////

let currentPath = await detectScriptsDirectory(Deno.cwd());

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

  await $`git clone https://github.com/ghostmind-dev/machine.git ${projectName}`;

  // remove the user path from currentPath

  const pathFromHome = currentPath.replace(`${Deno.env.get('HOME')}/`, '');

  cd(projectName);

  // we have to change so value in a few files. First
  // First is the .devcontainer/devcontainer.json file
  // Get the json file and parse it

  let devcontainer: any = await fs.readFile(
    `${currentPath}/${projectName}/.devcontainer/devcontainer.json`,
    'utf8'
  );

  devcontainer = JSON.parse(devcontainer);

  // Change the name of the container

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

  devcontainer.runArgs[3] = `--name=devcontainer-${projectName}`;

  // write the file back

  await fs.writeFile(
    `${currentPath}/${projectName}/.devcontainer/devcontainer.json`,
    JSON.stringify(devcontainer, null, 2),
    'utf8'
  );

  // now , we need to modify ./meta.json

  let meta = await fs.readFile(
    `${currentPath}/${projectName}/meta.json`,
    'utf8'
  );

  meta = JSON.parse(meta);

  meta.name = projectName;

  await fs.writeFile(
    `${currentPath}/${projectName}/meta.json`,
    JSON.stringify(meta, null, 2),
    'utf8'
  );

  // now we need replace the content of Readme.md and only write a ssingle line header

  await fs.writeFile(
    `${currentPath}/${projectName}/Readme.md`,
    `# ${projectName}`,
    'utf8'
  );
  $.verbose = true;

  await $`rm -rf .git`;

  await $`git init`;
  // exit the execution

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
