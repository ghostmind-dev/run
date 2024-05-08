import { $, cd, fs, sleep } from 'npm:zx';
import {
  withMetaMatching,
  verifyIfMetaJsonExists,
  detectScriptsDirectory,
  setSecretsUptoProject,
  recursiveDirectoriesDiscovery,
  getFilesInDirectory,
} from '../utils/divers.ts';
import { nanoid } from 'npm:nanoid';
import jsonfile from 'npm:jsonfile';
import * as inquirer from 'npm:inquirer';
import { join } from 'https://deno.land/std@0.221.0/path/mod.ts';

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
// CURRENT METADATA
////////////////////////////////////////////////////////////////////////////////

let metaConfig = await verifyIfMetaJsonExists(currentPath);

////////////////////////////////////////////////////////////////////////////////
// QUICK COMMIT AMEND
////////////////////////////////////////////////////////////////////////////////

export async function quickAmend() {
  $.verbose = true;

  try {
    await $`git rev-parse --is-inside-work-tree 2>/dev/null`;
    await $`echo "git amend will begin" &&
        git add . &&
        git commit --amend --no-edit &&
        git push origin main -f
    `;
  } catch (e) {
    console.error('git amend failed');
    return;
  }
}

////////////////////////////////////////////////////////////////////////////////
// QUICK COMMIT AND PUSH
////////////////////////////////////////////////////////////////////////////////

export async function quickCommit() {
  $.verbose = true;

  try {
    await $`echo "git commit will begin" &&
        git add . &&
        git commit -m "quick commit" &&
        git push origin main -f
    `;
  } catch (e) {
    console.error('git commit failed');
    return;
  }
}

////////////////////////////////////////////////////////////////////////////////
// DEV INSTALL
////////////////////////////////////////////////////////////////////////////////

export async function devInstallDependencies() {
  const directories = await withMetaMatching({ property: 'development.init' });

  for (const directoryDetails of directories) {
    const { directory, config } = directoryDetails;

    const { init } = config.development;

    $.verbose = true;

    for (let script of init) {
      const scriptArray = script.split(' ');

      cd(directory);

      await $`${scriptArray}`;
    }
  }
}

////////////////////////////////////////////////////////////////////////////////
// CREATE A SHORT UUID
////////////////////////////////////////////////////////////////////////////////

export async function createShortUUID(options = { print: false }) {
  const { print } = options;
  const id = nanoid(12);

  if (print) {
    console.log(id);
    return;
  }

  return id;
}

////////////////////////////////////////////////////////////////////////////////
// CREATE A METADATA FILE
////////////////////////////////////////////////////////////////////////////////

export async function createMetaFile() {
  const id = (await createShortUUID()) || '';

  const prompt = inquirer.createPromptModule();

  const { name } = await prompt({
    type: 'input',
    name: 'name',
    message: 'What is the name of this object?',
  });
  const { type } = await prompt({
    // type needs to allow the choice of 3 types

    type: 'list',
    name: 'type',
    choices: ['project', 'app', 'config'],
    message: 'What is the type of this object?',
  });
  const { global } = await prompt({
    type: 'confirm',
    name: 'global',
    message: 'Is this a environment-based app  d?',
  });

  interface TypeMetaJson {
    id: string;
    name: string;
    type: string;
    [key: string]: string; // Restricts all dynamic properties to be of type string
  }

  let meta: TypeMetaJson = {
    id,
    name,
    type,
  };

  if (global) {
    meta.global = 'true';
  }

  await jsonfile.writeFile('meta.json', meta, { spaces: 2 });

  Deno.exit();
}

////////////////////////////////////////////////////////////////////////////////
// CHANGE ALL IDS IN A META.JSON FILE
////////////////////////////////////////////////////////////////////////////////

export async function changeAllIds(options: any) {
  const startingPath = options.current
    ? currentPath
    : Deno.env.get('SRC') || currentPath;

  // ask the user if they want to change all ids

  const prompt = inquirer.createPromptModule();

  const { changeAllIds } = await prompt({
    type: 'confirm',
    name: 'changeAllIds',
    message: 'Do you want to change all ids?',
  });

  if (!changeAllIds) {
    return;
  }

  const directories = await recursiveDirectoriesDiscovery(startingPath);

  for (const directory of directories) {
    const metaConfig = await verifyIfMetaJsonExists(directory);

    // if directory matches ${SRC}/dev/** continue to next iteration

    if (directory.includes(`${startingPath}/dev`)) {
      continue;
    }

    if (metaConfig) {
      metaConfig.id = nanoid(12);

      await jsonfile.writeFile(join(directory, 'meta.json'), metaConfig, {
        spaces: 2,
      });
    }
  }

  let metaConfig = await verifyIfMetaJsonExists(startingPath);

  metaConfig.id = nanoid(12);

  await jsonfile.writeFile(join(startingPath, 'meta.json'), metaConfig, {
    spaces: 2,
  });

  Deno.exit();
}

////////////////////////////////////////////////////////////////////////////////
// INSTALL DEPENDENCIES
////////////////////////////////////////////////////////////////////////////////

export async function installDependencies() {
  $.verbose = true;
  await $`brew install vault`;

  const VAULT_TOKEN = Deno.env.get('VAULT_TOKEN');

  await $`vault login ${VAULT_TOKEN}`;
}

////////////////////////////////////////////////////////////////////////////////
// TEMPLATE EXPORT
////////////////////////////////////////////////////////////////////////////////

export async function templateExport(arg: any) {
  //
  // return the content of this url (raw .tf)
  // create a file in the current directory with the content of the url

  cd(currentPath);

  $.verbose = true;

  if (arg === 'main.tf') {
    await $`curl -o ${currentPath}/main.tf https://gist.githubusercontent.com/komondor/8c8d892393a233aeb80ede067f6ddd50/raw/7bf0025923fb9964c25333ad887de6da71b54fdd/main.tf`;
    return;
  }

  if (arg === 'variables.tf') {
    await $`curl -o ${currentPath}/variables.tf https://gist.githubusercontent.com/komondor/fc5f8340c7a4f05d14f6b3b715c7a6b6/raw/6e91993eb7cb6c50800f7ee8c77e5ea35ff72333/variables.tf`;
    return;
  }

  if (arg === '.env.example') {
    await $`curl -o ${currentPath}/.env.example https://gist.githubusercontent.com/komondor/24b631dc1d18b6b20cb9ca2d8b31bfce/raw/bb99c34141c27bb0d93e0bcd9ce837e6547fb843/.env.example`;
    return;
  }

  if (arg === 'oas.json') {
    await $`curl -o ${currentPath}/oas.json https://gist.githubusercontent.com/komondor/e4e16ad2a2046afe4aaa613a5b0a6748/raw/2c3383a4ae8c343c7def376a198811d2319bab5c/oas.json`;
    return;
  }

  console.error('template not found');
}
////////////////////////////////////////////////////////////////////////////////
// GET APP NAME
////////////////////////////////////////////////////////////////////////////////

export async function getAppName() {
  const { name }: any = await verifyIfMetaJsonExists(
    Deno.env.get(currentPath) || currentPath
  );

  return name;
}

////////////////////////////////////////////////////////////////////////////////
// GET PROJECT NAME
////////////////////////////////////////////////////////////////////////////////

export async function getProjectName() {
  const { name }: any = await verifyIfMetaJsonExists(
    Deno.env.get('SRC') || currentPath
  );

  return name;
}

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function utils(program: any) {
  const utils = program.command('utils');
  utils.description('collection of utils');
  const git = utils.command('git');
  git.description('git utils');
  const dev = utils.command('dev');
  dev.description('devcontainer utils');
  const nanoid = utils.command('nanoid');
  dev.description('devcontainer utils');
  const meta = utils.command('meta');
  meta.description('meta utils');
  const commit = utils.command('commit');
  const dependencies = utils.command('dependencies');
  dependencies.description('dependencies install');

  const template = utils.command('template');
  template.description('template utils');
  template.argument('[template]', 'template to export');
  template.action(templateExport);

  const repo = utils.command('repo');

  const gitAmend = git.command('amend');
  gitAmend.description('amend the last commit');
  gitAmend.action(quickAmend);

  const gitCommit = git.command('commit');
  gitCommit.description('quick commit');
  gitCommit.action(quickCommit);

  const devInstall = dev.command('install');
  devInstall.description('install app dependencies');
  devInstall.action(devInstallDependencies);

  const id = nanoid.command('id');
  id.description('generate a nanoid');
  id.option('p, --print', 'print the id');
  id.action(createShortUUID);

  const metaCreate = meta.command('create');
  metaCreate.description('create a meta.json file');
  metaCreate.action(createMetaFile);

  const devMetaChangeId = meta.command('ids');
  devMetaChangeId.description('change all ids in a meta.json file');
  devMetaChangeId.option('--current', 'start from currentPath');
  devMetaChangeId.action(changeAllIds);

  const dependenciesInstall = dependencies.command('install');
  dependenciesInstall.description('install dependencies');
  dependenciesInstall.action(installDependencies);
}
