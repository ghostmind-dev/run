import { $, which, sleep, cd, fs } from 'zx';
import * as inquirer from 'inquirer';
import { constants } from 'perf_hooks';
import { connectToCluster } from './command-cluster.mjs';
import { execFileSync } from 'child_process';
import { detectScriptsDirectory } from '../utils/divers.mjs';

////////////////////////////////////////////////////////////////////////////////
// MUTE BY DEFAULT
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

////////////////////////////////////////////////////////////////////////////////
// ACTION DEFAULT CONFIG
////////////////////////////////////////////////////////////////////////////////

const actionConfigDefault = {};

////////////////////////////////////////////////////////////////////////////////
// RUNNING COMMAND LOCATION
////////////////////////////////////////////////////////////////////////////////

let currentPath = await detectScriptsDirectory(process.cwd());

cd(currentPath);

////////////////////////////////////////////////////////////////////////////////
// RUNNING COMMAND LOCATION
////////////////////////////////////////////////////////////////////////////////

const metaConfig = await fs.readJsonSync('meta.json');

////////////////////////////////////////////////////////////////////////////////
// RUN ACTION LOCALLY WITH ACT
////////////////////////////////////////////////////////////////////////////////

export async function skaffoldGroupRun(jobName, options) {
  const { statusCheck, force = false, cacheArtifacts } = options;
  process.env.FORCE_COLOR = 1;
  await connectToCluster();
  const app_directory = `${currentPath}/app`;
  const groupe = [];
  const filesName = await fs.readdir(app_directory, { withFileTypes: true });
  const foldersName = filesName
    .filter((fileOrDirectory) => fileOrDirectory.isDirectory())
    .map((directory) => directory.name);
  for (let folder of foldersName) {
    const { skaffold, name } = await fs.readJsonSync(
      `${currentPath}/app/${folder}/meta.json`
    );
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
          members: [...groupe[matchIndex].members, name],
        };
        continue;
      }
      groupe.push({
        name: groupInMeta,
        members: [name],
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
    profiles = `${profiles},${value}`;
  });
  $.verbose = true;
  try {
    const options = [
      'dev',
      '--cleanup=false',
      `--profile=${profiles.substring(1)}`,
      `--status-check=${statusCheck}`,
      `--force=${force}`,
      `--cache-artifacts=${cacheArtifacts}`,
    ];

    execFileSync('skaffold', options, {
      stdio: 'inherit',
      cwd: currentPath,
    });
  } catch (e) {}
}

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function skaffold(program) {
  const skaffold = program.command('skaffold');
  skaffold.description('local cluster development');

  const group = skaffold.command('group');
  group
    .description('run a group of applications')
    .argument('[group]', 'group name to run')
    .option('--no-status-check', 'disable status check')
    .option('--force', 'rebuild images')
    .option('--no-cache-artifacts', 'disable cache artifacts')
    .action(skaffoldGroupRun);
}
