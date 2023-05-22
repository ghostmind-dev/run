import { $, which, sleep, cd, fs } from 'zx';
import * as inquirer from 'inquirer';
import { connectToCluster } from './command-cluster.mjs';
import { execFileSync } from 'child_process';
import {
  detectScriptsDirectory,
  verifyIfMetaJsonExists,
  getDirectories,
  recursiveDirectoriesDiscovery,
} from '../utils/divers.mjs';

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
// SKAFFOLD DEV ENTRY
////////////////////////////////////////////////////////////////////////////////

export async function skaffoldDevEntry(profile, options) {
  const { group } = options;

  if (group) {
    await skaffoldGroup(options, 'dev');
    return;
  }
  await skaffoldUnit(profile, options, 'dev');
}

////////////////////////////////////////////////////////////////////////////////
// SKAFFOLD DEV ENTRY
////////////////////////////////////////////////////////////////////////////////

export async function skaffoldRunEntry(profile, options) {
  const { group } = options;

  if (group) {
    await skaffoldGroup(options, 'run');
    return;
  }
  await skaffoldUnit(profile, options, 'run');
}

////////////////////////////////////////////////////////////////////////////////
// SKAFFOLD UNIT
////////////////////////////////////////////////////////////////////////////////

export async function skaffoldUnit(profile, options, action) {
  const { statusCheck, force = false, cacheArtifacts } = options;
  process.env.FORCE_COLOR = 1;
  const { status, message } = await connectToCluster();

  if (status === 'error') {
    console.log(message);
    return;
  }

  $.verbose = true;

  cd(currentPath);

  try {
    const skaffoldOptions = [
      action,
      '--cleanup=false',
      `--profile=${profile}`,
      `--status-check=${statusCheck}`,
      `--force=${force}`,
      `--cache-artifacts=${cacheArtifacts}`,
    ];

    // keep execFileSync instead of zx
    // to maintain script outpu color

    execFileSync('skaffold', skaffoldOptions, {
      stdio: 'inherit',
      cwd: currentPath,
    });
  } catch (e) {
    console.log(e);
  }
}

////////////////////////////////////////////////////////////////////////////////
// RUN ACTION LOCALLY WITH ACT
////////////////////////////////////////////////////////////////////////////////

export async function skaffoldGroup(options, action) {
  const { statusCheck, force = false, cacheArtifacts } = options;
  process.env.FORCE_COLOR = 1;
  const { status, message } = await connectToCluster();

  if (status === 'error') {
    console.log(message);
    return;
  }

  const app_directory = `${currentPath}`;
  const groupe = [];

  let directories = await recursiveDirectoriesDiscovery(app_directory);

  for (let directory of directories) {
    const metaConfig = await verifyIfMetaJsonExists(directory);

    if (metaConfig === false) {
      continue;
    }

    const { skaffold, name } = metaConfig;

    if (skaffold == undefined) {
      continue;
    }

    const { group } = skaffold;
    for (let groupInMeta of group) {
      const matchIndex = groupe.findIndex(
        (value, index) => value.name === groupInMeta
      );
      if (matchIndex > -1) {
        groupe[matchIndex] = {
          ...groupe[matchIndex],
          members: [...groupe[matchIndex].members, { name, directory }],
        };
        continue;
      }
      groupe.push({
        name: groupInMeta,
        members: [{ name, directory }],
      });
    }
  }

  const prompt = inquirer.createPromptModule();
  const result = await prompt({
    type: 'list',
    name: 'answer',
    message: 'Which groupe to initiate ?',
    choices: groupe.map((value) => value.name),
    pageSize: 20,
  });
  const groupInitializationIndex = groupe.findIndex(
    (value) => value.name === result.answer
  );
  let profiles = '';
  groupe[groupInitializationIndex].members.map((value) => {
    profiles = `${profiles},${value.name}`;
  });
  $.verbose = true;
  try {
    const skaffoldOptions = [
      action,
      '--cleanup=false',
      `--profile=${profiles.substring(1)}`,
      `--status-check=${statusCheck}`,
      `--force=${force}`,
      `--cache-artifacts=${cacheArtifacts}`,
    ];

    execFileSync('skaffold', skaffoldOptions, {
      stdio: 'inherit',
      cwd: currentPath,
    });
  } catch (e) {
    console.log(e);
  }
}

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function skaffold(program) {
  const skaffold = program.command('skaffold');
  skaffold.description('local cluster development');

  const dev = skaffold.command('dev');
  const run = skaffold.command('run');
  dev
    .description('launch cluster apps with skaffold in dev mode')
    .argument('[profile]', 'profile to run')
    .option('--group', 'group name to run')
    .option('--no-status-check', 'disable status check')
    .option('--force', 'rebuild images')
    .option('--no-cache-artifacts', 'disable cache artifacts')
    .action(skaffoldDevEntry);

  run
    .description('launch cluster apps with skaffold')
    .argument('[profile]', 'profile to run')
    .option('--group', 'group name to run')
    .option('--no-status-check', 'disable status check')
    .option('--force', 'rebuild images')
    .option('--no-cache-artifacts', 'disable cache artifacts')
    .action(skaffoldRunEntry);
}
