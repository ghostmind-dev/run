import { $, cd, sleep } from 'zx';
import {
  withMetaMatching,
  verifyIfMetaJsonExists,
  detectScriptsDirectory,
} from '../utils/divers.mjs';
import { nanoid } from 'nanoid/async';
import jsonfile from 'jsonfile';
import * as inquirer from 'inquirer';

////////////////////////////////////////////////////////////////////////////////
// MUTE BY DEFAULT
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

////////////////////////////////////////////////////////////////////////////////
// RUNNING COMMAND LOCATION
////////////////////////////////////////////////////////////////////////////////

let currentPath = await detectScriptsDirectory(process.cwd());

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
  const directories = await withMetaMatching('development.init');

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

export async function createShortUUID() {
  const id = await nanoid(12);

  return id;
}

////////////////////////////////////////////////////////////////////////////////
// CREATE A METADATA FILE
////////////////////////////////////////////////////////////////////////////////

export async function createMetaFile() {
  const id = await createShortUUID();

  const prompt = inquirer.createPromptModule();

  const { name } = await prompt({
    type: 'input',
    name: 'name',
    message: 'What is the name of this object?',
  });
  const { type } = await prompt({
    type: 'input',
    name: 'type',
    message: 'What is the type of this object?',
  });
  const { scope } = await prompt({
    type: 'input',
    name: 'scope',
    message: 'What is the scope of this object?',
  });
  const meta = {
    name,
    type,
    scope,
    id,
  };

  await jsonfile.writeFile('meta.json', meta, { spaces: 2 });
}

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function utils(program) {
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
  id.action(createShortUUID);

  const metaCreate = meta.command('create');
  metaCreate.description('create a meta.json file');
  metaCreate.action(createMetaFile);
}
