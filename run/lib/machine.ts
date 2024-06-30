import { $, cd, spinner, sleep, question } from 'npm:zx@8.1.0';
import Table from 'npm:cli-table3@0.6.5';
import {
  detectScriptsDirectory,
  createUUID,
  verifyIfMetaJsonExists,
} from '../utils/divers.ts';
import inquirer from 'npm:inquirer@9.2.22';
import fs from 'npm:fs-extra@11.2.0';
import prettier from 'npm:prettier@3.3.2';

////////////////////////////////////////////////////////////////////////////////
// MUTE BY DEFAULT
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

////////////////////////////////////////////////////////////////////////////////
// RUNNING COMMAND LOCATION
////////////////////////////////////////////////////////////////////////////////

let currentPath = await detectScriptsDirectory(Deno.cwd());

cd(currentPath);

export async function appClone(app: string) {
  // git@github.com:ghostmind-dev/templates.git
  // clone this repo in /tmp/templates

  await spinner('Cloning templates', async () => {
    await $`rm -rf /tmp/templates`;

    await $`git clone git@github.com:ghostmind-dev/templates.git /tmp/templates`;

    await sleep(1000);
  });

  // read all meta.json in all folders contains in  /tmp/templates/templates
  // pull the name and description

  if (!app) {
    const table = new Table({
      head: ['Name', 'Description'],
    });

    for await (const entry of Deno.readDir('/tmp/templates/templates')) {
      const meta = await verifyIfMetaJsonExists(
        `/tmp/templates/templates/${entry.name}`
      );

      if (meta) {
        table.push([meta.name, meta.description]);
      }
    }

    console.log(table.toString());

    Deno.exit(0);
  }

  // copy the folder to the current directory

  const name = await question('Name of the app: ');

  await $`cp -r /tmp/templates/templates/${app} ${name}`;

  cd(name);

  //  change id in meta.json

  // read the meta.json

  const meta = await verifyIfMetaJsonExists(`${currentPath}/${name}`);

  // change the id

  if (meta) {
    meta.id = await createUUID();

    // write the file back

    await fs.writeJson(`${currentPath}/${name}/meta.json`, meta);

    // format the file

    const formatted = await prettier.format(JSON.stringify(meta), {
      parser: 'json',
    });

    await fs.writeFile(`${currentPath}/${name}/meta.json`, formatted, 'utf8');
  }

  console.log(`App ${app} has been cloned`);

  // remove the /tmp/templates

  await $`rm -rf /tmp/templates`;

  Deno.exit(0);
}

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

  devcontainer.runArgs[3] = `--name=devcontainer-${projectName}`;

  // // write the file back

  await fs.writeFile(
    `${currentPath}/${projectName}/.devcontainer/devcontainer.json`,
    JSON.stringify(devcontainer, null, 2),
    'utf8'
  );

  await $`curl -o ${currentPath}/${projectName}/.devcontainer/Dockerfile https://raw.githubusercontent.com/ghostmind-dev/config/main/config/devcontainer/Dockerfile`;

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

  await $`mkdir -p ${currentPath}/${projectName}/vscode`;

  await $`curl -o ${currentPath}/${projectName}/vscode/settings.json https://raw.githubusercontent.com/ghostmind-dev/config/main/config/vscode/settings.json`;

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

  const dvc = machine.command('dvc');
  dvc.description('initialixe and manage a devcontainer for the project');

  const init = dvc.command('init');
  init.description('create a devcontainer for the project');
  init.action(machineInit);

  const app = machine.command('app');
  app.description('initialize and manage a new app');

  const clone = app.command('clone');
  clone.description('clone an app from the templates');
  clone.argument('[app]', 'app to clone');
  clone.action(appClone);
}
