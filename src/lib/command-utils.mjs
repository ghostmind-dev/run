import { $, which, cd, sleep } from 'zx';
import { detectScriptsDirectory, withMetaMatching } from '../utils/divers.mjs';
import { nanoid } from 'nanoid/async';

////////////////////////////////////////////////////////////////////////////////
// MUTE BY DEFAULT
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

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

  console.log(id);

  return id;
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
}
