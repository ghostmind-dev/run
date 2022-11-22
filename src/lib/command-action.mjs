import { $, which, sleep, cd, fs } from 'zx';
import core from '@actions/core';
import { detectScriptsDirectory } from '../utils/divers.mjs';

////////////////////////////////////////////////////////////////////////////////
// MUTE BY DEFAULT
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

////////////////////////////////////////////////////////////////////////////////
// CONSTANTS
////////////////////////////////////////////////////////////////////////////////

const ENV = process.env.ENV;

const LOCALHOST_SRC =
  process.env.CODESPACES === 'true'
    ? process.env.SRC
    : process.env.LOCALHOST_SRC;

////////////////////////////////////////////////////////////////////////////////
// ACTION DEFAULT CONFIG
////////////////////////////////////////////////////////////////////////////////

const actionConfigDefault = {};

////////////////////////////////////////////////////////////////////////////////
// ACT DEFAULT CONFIG
////////////////////////////////////////////////////////////////////////////////

const actArgmentsDefault = [
  {
    name: '--platform',
    value: `ubuntu-latest=catthehacker/ubuntu:act-latest`,
  },
  { name: '--defaultbranch', value: 'main' },
  { name: '--directory', value: LOCALHOST_SRC },
  { name: '--bind', value: `` },
  { name: '--use-gitignore', value: '' },
  {
    name: '--secret',
    value: `VAULT_ROOT_TOKEN=${process.env.VAULT_ROOT_TOKEN}`,
  },
  { name: '--secret', value: `VAULT_ADDR=${process.env.VAULT_ADDR}` },
  {
    name: '--secret',
    value: `GCP_PROJECT_NAME=${process.env.GCP_PROJECT_NAME}`,
  },
];

////////////////////////////////////////////////////////////////////////////////
// RUNNING COMMAND LOCATION
////////////////////////////////////////////////////////////////////////////////

let currentPath = await detectScriptsDirectory(process.cwd());

cd(currentPath);

////////////////////////////////////////////////////////////////////////////////
// UTIL: CONVERT ACT ARGUMENTS ARRAY TO STRING
////////////////////////////////////////////////////////////////////////////////

async function actArgmentsToOneDimensionArray(actArgmentsConstants) {
  let actArgmentsArray = [];
  for (let i = 0; i < actArgmentsConstants.length; i++) {
    actArgmentsArray.push(actArgmentsConstants[i].name);
    if (actArgmentsConstants[i].value !== '') {
      actArgmentsArray.push(actArgmentsConstants[i].value);
    }
  }
  return actArgmentsArray;
}

////////////////////////////////////////////////////////////////////////////////
// RUN REMOTE ACTIOn
////////////////////////////////////////////////////////////////////////////////

export async function actionRunRemote(workflow, options) {
  $.verbose = true;

  const { watch, input, branch } = options;

  let refBranch = branch ? branch : 'main';

  let inputsArguments = [];

  if (input !== undefined) {
    for (let inputArg in input) {
      inputsArguments.push('-f');
      inputsArguments.push(input[inputArg]);
    }
  }

  try {
    await $`gh workflow run ${workflow} --ref ${refBranch} ${inputsArguments}`;
  } catch (error) {
    console.log(error.stderr);
  }

  if (watch) {
    $.verbose = true;

    const runId =
      await $`gh run list --limit 1 | sed -En '1p' | awk '{ print $(NF - 2) }'`;

    await sleep(5000);
    await $`gh run watch ${runId}`;
  }
}

////////////////////////////////////////////////////////////////////////////////
// RUN ACTION LOCALLY WITH ACT
////////////////////////////////////////////////////////////////////////////////

export async function actionRunLocal(target, actArguments, event) {
  const actArgmentsCombined = [...actArgmentsDefault, ...actArguments];

  const actArgmentsArray = await actArgmentsToOneDimensionArray(
    actArgmentsCombined
  );

  $.verbose = true;

  if (event === undefined) {
    actArgmentsArray.push('--job');
    actArgmentsArray.push(target);
    await $`act ${actArgmentsArray}`;
  } else {
    actArgmentsArray.push('--workflows');
    actArgmentsArray.push(`./.github/workflows/${target}.yaml`);
    await $`act ${event} ${actArgmentsArray}`;
  }
}

export async function actionRunLocalEntry(target, options) {
  const { live, input, reuse, secure, event } = options;

  let inputsArguments = {};

  if (input !== undefined) {
    for (let inputArg in input) {
      // split input argument into array with = as separator
      let inputArgArray = input[inputArg].split('=');
      // add input argument to inputsArguments object
      inputsArguments[inputArgArray[0]] = inputArgArray[1];
    }
  }

  fs.writeJsonSync('/tmp/inputs.json', {
    inputs: {
      LIVE: live ? 'true' : 'false',
      ...inputsArguments,
    },
  });
  let actArgments = [
    { name: '--env', value: `ENV=${ENV}` },
    { name: '--eventpath', value: '/tmp/inputs.json' },
  ];
  if (reuse === true) {
    actArgments.push({ name: '--reuse', value: '' });
  }

  if (!secure) {
    actArgments.push({ name: '--insecure-secrets', value: '' });
  }
  await actionRunLocal(target, actArgments, event);
}

////////////////////////////////////////////////////////////////////////////////
// SET SECRETS IN ACTION STEPS
////////////////////////////////////////////////////////////////////////////////

export async function actionSecretsSet() {
  $.verbose = true;

  cd(currentPath);

  await $`run vault kv export`;

  // const envContents = await $`grep -v '^#' .env | xargs`;
  // const envContentsArray = `${envContents}`.split(' ');

  // const gitEnvPathRaw = await $`echo $GITHUB_ENV`;

  // const gitEnvPath = `${gitEnvPathRaw}`.replace(/(\r\n|\n|\r)/gm, '');

  // for (let secret of envContentsArray) {
  //   const secretArray = secret.split('=');
  //   const secretName = secretArray[0];
  //   const secretValueRaw = secretArray[1];
  //   const secretValue = secretValueRaw.replace(/(\r\n|\n|\r)/gm, '');

  //   core.setSecret(secretValue);
  //   core.setOutput(secretName, secretValue);

  //   await $`echo ${secretName}=${secretValue} >> ${gitEnvPath}`;
  // }
}

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function act(program) {
  const act = program.command('action');
  act.description('run a github action');

  const actLocal = act.command('local');
  const actRemote = act.command('remote');
  const actSecrets = act.command('secrets');

  actLocal
    .description('run local action with at')
    .argument('[target]', 'workflow or job name')
    .option('--live', 'run live version on run')
    .option('--no-reuse', 'do not reuse container state')
    .option('--no-secure', "show secrets in logs (don't use in production)")
    .option('-i, --input [inputs...]', 'action inputs')
    .option('--event <string>", " trigger event (ex: workflow_run')
    .action(actionRunLocalEntry);

  actRemote
    .description('run local action with at')
    .argument('[workflow]', 'workflow name')
    .option('--watch', 'watch for changes')
    .option('-i, --input [inputs...]', 'action inputs')
    .option('--branch <ref>', 'branch to run workflow on')
    .action(actionRunRemote);

  actSecrets
    .command('set')
    .action(actionSecretsSet)
    .description('set secrets for all the next action steps');
}
