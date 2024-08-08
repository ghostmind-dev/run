import { $, cd, spinner, sleep, question } from 'npm:zx@8.1.0';
import Table from 'npm:cli-table3@0.6.5';
import {
  detectScriptsDirectory,
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

let currentPath = await detectScriptsDirectory(Deno.cwd());

cd(currentPath);

////////////////////////////////////////////////////////////////////////////////
// ENVIRONMENT VARIABLES
////////////////////////////////////////////////////////////////////////////////

const RUN_MACHINE_GITHUB_REPO = Deno.env.get('RUN_MACHINE_GITHUB_REPO');

////////////////////////////////////////////////////////////////////////////////
// LISTE
////////////////////////////////////////////////////////////////////////////////

async function machineList(options: any) {
  const { repo, ascending, descending, tag } = options;

  $.verbose = false;

  let githubRepo = repo || RUN_MACHINE_GITHUB_REPO;

  const folder = `/tmp/run/${githubRepo}`;

  await spinner('Acquiring the list...', async () => {
    if (fs.existsSync(folder)) {
      cd(folder);

      // mute the output

      await $`git pull origin main --quiet > /dev/null 2>&1`;
    } else {
      await $`rm -rf ${folder}`;

      await $`git clone git@github.com:${githubRepo}.git ${folder} --quiet > /dev/null 2>&1`;

      cd(folder);
    }

    const appsPath = await withMetaMatching({
      property: 'type',
      value: 'app',
      path: `${folder}`,
    });

    const table = new Table({
      head: ['Name', 'Description', 'Tags'],
      colWidths: [20, 60, 60],
    });

    let tmpTable = [];

    for (const appPath of appsPath) {
      const meta = await verifyIfMetaJsonExists(appPath);

      let tags = '';

      if (meta?.tags) {
        tags = meta.tags.join(', ');
      }

      let lastTimeUpdatedRaw =
        await $`git log -1 --format=%cd --date=short ${appPath}`;

      // remove the new line

      let lastTimeUpdated = `${lastTimeUpdatedRaw}`.replace(/\n/g, '');

      if (meta) {
        tmpTable.push([meta.name, meta.description, tags, lastTimeUpdated]);
      }
    }

    if (tag) {
      tmpTable = _.filter(tmpTable, (row: any) => {
        return row[2].includes(tag);
      });
    }

    await sleep(1300);

    if (ascending) {
      tmpTable = _.sortBy(tmpTable, (row: any) => -new Date(row[3]).getTime());
    }

    if (descending) {
      tmpTable = _.sortBy(tmpTable, (row: any) => new Date(row[3]).getTime());
    }

    // remove the lastTimeUpdated field

    function wrapText(text: any, width: any) {
      const lines = [];
      let line = '';
      const words = text.split(' ');
      for (const word of words) {
        if ((line + word).length > width) {
          lines.push(line.trim());
          line = '';
        }
        line += word + ' ';
      }
      if (line.trim().length > 0) {
        lines.push(line.trim());
      }
      return lines.join('\n');
    }

    const cleanedTable = _.chain(tmpTable)

      .map((row: any) => _.slice(row, 0, 3))
      .value();

    for (const row of cleanedTable) {
      table.push(
        row.map((cell: any, index: any) =>
          wrapText(cell, table.options.colWidths[index])
        )
      );
    }

    console.log(table.toString());
  });

  Deno.exit(0);
}

////////////////////////////////////////////////////////////////////////////////
// CLONE
////////////////////////////////////////////////////////////////////////////////

export async function appClone(app: string, options: any) {
  const { repo } = options;

  $.verbose = false;

  let githubRepo = repo || RUN_MACHINE_GITHUB_REPO;

  const folder = `/tmp/run/${githubRepo}`;

  let appPath = '';

  await spinner('Cloning in progress...', async () => {
    if (fs.existsSync(folder)) {
      cd(folder);

      // mute the output

      await $`git pull origin main --quiet > /dev/null 2>&1`;
    } else {
      await $`rm -rf ${folder}`;

      await $`git clone git@github.com:${githubRepo}.git ${folder} --quiet > /dev/null 2>&1`;
    }

    cd(currentPath);

    const appsPath = await withMetaMatching({
      property: 'name',
      value: app,
      path: `${folder}`,
    });

    if (appsPath.length === 0) {
      console.log(`App ${app} not found`);
      Deno.exit(0);
    }

    appPath = appsPath[0];

    await sleep(1300);
  });

  const name = await question('What is the name of the app? ');

  await spinner('Cloning in progress...', async () => {
    $.verbose = false;

    await $`cp -r ${appPath} ${name}`;

    cd(name);

    //  change id in meta.json

    // read the meta.json

    const meta = await verifyIfMetaJsonExists(`${currentPath}/${name}`);

    //   // change the id

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

    await sleep(2000);
  });

  console.log(`App ${name} has been cloned`);

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

  const clone = machine.command('clone');
  clone.description('clone an app from the templates');
  clone.argument('[app]', 'app to clone');
  clone.option('-r, --repo <repo>', 'github repo to clone from');
  clone.action(appClone);

  const list = machine.command('list');
  list.description('list all the available apps');
  list.option('-r, --repo <repo>', 'github repo to clone from');
  // add option to list by the most recent
  list.option('-asc, --ascending', 'sort by the most recent');
  list.option('-desc, --descending', 'sort by the oldest');
  // NEED TO BE ABLE TO FILTER BY TAG NAME
  list.option('-t, --tag <tag>', 'filter by tag name');
  list.action(machineList);
}
