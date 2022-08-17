import { $, which } from 'zx';
import { detectScriptsDirectory } from '../utils/divers.mjs';

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
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function utils(program) {
  const utils = program.command('utils');
  utils.description('collection of utils');
  const git = utils.command('git');
  git.description('git utils');

  const gitAmend = git.command('amend');
  gitAmend.description('amend the last commit');
  gitAmend.action(quickAmend);

  const gitCommit = git.command('commit');
  gitCommit.description('quick commit');
  gitCommit.action(quickCommit);
}
