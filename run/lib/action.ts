import { $, sleep, cd, fs } from 'npm:zx';
import core from 'npm:@actions/core';
import {
  detectScriptsDirectory,
  verifyIfMetaJsonExists,
} from '../utils/divers.ts';
import { getAppName, getProjectName } from '../utils/divers.ts';
import { join, extname } from 'https://deno.land/std@0.221.0/path/mod.ts';
import yaml from 'npm:js-yaml';
import { parse } from 'npm:dotenv';
import { expand } from 'npm:dotenv-expand';

////////////////////////////////////////////////////////////////////////////////
// MUTE BY DEFAULT
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

////////////////////////////////////////////////////////////////////////////////
// TYPE
////////////////////////////////////////////////////////////////////////////////

const fsZX: any = fs;

////////////////////////////////////////////////////////////////////////////////
// CONSTANTS
////////////////////////////////////////////////////////////////////////////////

const LOCALHOST_SRC =
  Deno.env.get('CODESPACES') === 'true'
    ? Deno.env.get('SRC')
    : Deno.env.get('LOCALHOST_SRC');

////////////////////////////////////////////////////////////////////////////////
// RUNNING COMMAND LOCATION
////////////////////////////////////////////////////////////////////////////////

let currentPath = await detectScriptsDirectory(Deno.cwd());

cd(currentPath);

////////////////////////////////////////////////////////////////////////////////
// ACT DEFAULT CONFIG
////////////////////////////////////////////////////////////////////////////////

const actArgmentsDefault = [
  {
    name: '--platform',
    value: 'ubuntu-latest=ghcr.io/catthehacker/ubuntu:act-latest',
  },
  { name: '--directory', value: LOCALHOST_SRC },
  { name: '--bind', value: `` },
  { name: '--use-gitignore', value: '' },
  {
    name: '--secret',
    value: `GH_TOKEN=${Deno.env.get('GITHUB_TOKEN')}`,
  },
  {
    name: '--secret',
    value: `GITHUB_TOKEN=${Deno.env.get('GITHUB_TOKEN')}`,
  },
  {
    name: '--secret',
    value: `VAULT_ROOT_TOKEN=${Deno.env.get('VAULT_ROOT_TOKEN')}`,
  },
  { name: '--secret', value: `VAULT_ADDR=${Deno.env.get('VAULT_ADDR')}` },
];

////////////////////////////////////////////////////////////////////////////////
// UTIL: CONVERT ACT ARGUMENTS ARRAY TO STRING
////////////////////////////////////////////////////////////////////////////////

async function actArgmentsToOneDimensionArray(actArgmentsConstants: any) {
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

export async function actionRunRemote(workflow: any, options: any) {
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
    $.verbose = false;

    await sleep(5000);

    const runId =
      await $`gh run list --limit 1 | sed -En '1p' | awk '{ print $(NF - 2) }'`;

    $.verbose = true;

    await $`gh run watch ${runId}`;
  }
}

////////////////////////////////////////////////////////////////////////////////
// RUN ACTION LOCALLY WITH ACT
////////////////////////////////////////////////////////////////////////////////

export async function actionRunLocal(
  target: any,
  actArguments: any,
  event: any,
  custom: any,
  workaround: any
) {
  const actArgmentsCombined = [...actArgmentsDefault, ...actArguments];

  const actArgmentsArray = await actArgmentsToOneDimensionArray(
    actArgmentsCombined
  );

  let workflowsPath = LOCALHOST_SRC + '/.github/workflows';

  if (custom == true) {
    actArgmentsArray[0] = '--platform';
    actArgmentsArray[1] = `ubuntu-latest=ghcr.io/ghostmind-dev/act-base:latest`;

    await $`rm -rf /tmp/.github`;

    await $`cp -r .github/ /tmp/.github`;

    const workflowsDir = '/tmp/.github/workflows';
    const workflowFiles = await fs.readdir(workflowsDir);

    for (const file of workflowFiles) {
      const filePath = join(workflowsDir, file);
      // Check if it's a .yml or .yaml file before processing
      if (extname(file) === '.yml' || extname(file) === '.yaml') {
        const content = await fs.readFile(filePath, 'utf8');
        const parsedYaml = yaml.load(content);

        // Modify each job in the workflow
        for (const jobKey in parsedYaml.jobs) {
          if (parsedYaml.jobs[jobKey].container) {
            delete parsedYaml.jobs[jobKey].container;
          }
        }

        // Write the modified content back to /tmp/.github/workflows/
        const modifiedContent = yaml.dump(parsedYaml);
        await fs.writeFile(filePath, modifiedContent);
      }
    }

    $.verbose = true;

    workflowsPath = '/tmp/.github/workflows';
  }

  $.verbose = true;

  if (workaround !== undefined) {
    actArgmentsArray.push('--workflows');
    actArgmentsArray.push(`${workflowsPath}/${target}.yaml`);
  } else {
    actArgmentsArray.push('--workflows');
    actArgmentsArray.push(workflowsPath);
  }

  if (event === undefined) {
    actArgmentsArray.push('--job');
    actArgmentsArray.push(target);

    await $`act ${actArgmentsArray}`;
  } else {
    actArgmentsArray.push('--workflows');
    actArgmentsArray.push(`${workflowsPath}/${target}.yaml`);

    if (event === 'push') {
      actArgmentsArray.push('--eventpath');
    }

    await $`act ${event} ${actArgmentsArray}`;
  }
}

export async function actionRunLocalEntry(target: any, options: any) {
  const ENV = Deno.env.get('ENV');
  const { live, input, reuse, secure, event, push, custom, workaround, env } =
    options;

  let inputsArguments: any = {};

  if (input !== undefined) {
    for (let inputArg in input) {
      // split input argument into array with = as separator
      let inputArgArray: string[] = input[inputArg].split('=');
      // add input argument to inputsArguments object
      inputsArguments[inputArgArray[0]] = inputArgArray[1];
    }
  }

  fs.writeJsonSync('/tmp/inputs.json', {
    inputs: {
      LIVE: live ? 'true' : 'false',
      LOCAL: 'true',
      ...inputsArguments,
    },
  });
  let actArgments = [
    // { name: '--env', value: `ENV=${ENV}` },
    { name: '--eventpath', value: '/tmp/inputs.json' },
  ];

  if (reuse === true) {
    actArgments.push({ name: '--reuse', value: '' });
  }

  if (env) {
    actArgments.push({ name: '--env', value: `SET_ENV=${env}` });
  }

  if (event === 'push') {
    const eventFile = await fs.readFile(
      `${LOCALHOST_SRC}/.github/mocking/push.json`,
      'utf8'
    );

    // this push has 3 properties: ref, before, after
    // add these properties to the /tmp/inputs.json file

    const currentInputs = JSON.parse(
      fsZX.readFileSync('/tmp/inputs.json', 'utf8')
    );
    const eventFileJson = JSON.parse(eventFile);

    fs.writeJsonSync('/tmp/inputs.json', {
      ...eventFileJson,
      ...currentInputs,
    });
  }
  if (!secure) {
    actArgments.push({ name: '--insecure-secrets', value: '' });
  }

  await actionRunLocal(target, actArgments, event, custom, workaround);
}

////////////////////////////////////////////////////////////////////////////////
// SET SECRETS IN ACTION STEPS
////////////////////////////////////////////////////////////////////////////////

interface ActionSecretsSetOptions {
  global: boolean;
}

export async function actionSecretsSet(options: ActionSecretsSetOptions) {
  let { global } = options;

  $.verbose = true;

  if (global) {
    await $`rm -rf /tmp/env.global.json`;

    await $`vault kv get -format=json kv/GLOBAL/global/secrets  > /tmp/env.global.json`;

    const credsValue = await fs.readJSONSync(`/tmp/env.global.json`);

    const { CREDS } = credsValue.data.data;

    await $`rm -rf /tmp/.env.global`;

    fsZX.writeFileSync('/tmp/.env.global', CREDS, 'utf8');

    const originalEnvContent = fs.readFileSync(`/tmp/.env.global`, 'utf8');

    const envConfig = parse(originalEnvContent);

    // Use dotenv-expand to expand the variables
    const expandedConfig: any = expand({
      parsed: envConfig,
    });

    const gitEnvPathRaw = await $`echo $GITHUB_ENV`;

    const gitEnvPath = `${gitEnvPathRaw}`.replace(/(\r\n|\n|\r)/gm, '');

    for (let keyValue in expandedConfig.parsed) {
      await $`echo ${keyValue}=${expandedConfig.parsed[keyValue]} >> ${gitEnvPath}`;
    }
  } else {
    const APP = await getAppName();
    const target = Deno.env.get('ENV');

    const gitEnvPathRaw = await $`echo $GITHUB_ENV`;

    const gitEnvPath = `${gitEnvPathRaw}`.replace(/(\r\n|\n|\r)/gm, '');

    await $`rm -rf /tmp/.env.${APP}`;

    const { secrets } = await verifyIfMetaJsonExists(currentPath);

    let env_file = `/tmp/.env.${APP}`;

    if (secrets?.base) {
      let base_file = `/tmp/.env.base.${APP}`;
      let target_file = `/tmp/.env.target${APP}`;

      await $`rm -rf /tmp/.env.base.${APP}`;
      await $`rm -rf /tmp/.env.target.${APP}`;

      await $`run vault kv export --target=base --envfile=/tmp/.env.base.${APP}`;
      await $`run vault kv export --target=${target} --envfile=/tmp/.env.target.${APP}`;

      // merge base and target files in /tmp/.env.APP_NAME

      await $`rm -rf /tmp/.env.${APP}`;

      await $`cat ${base_file} ${target_file} > /tmp/.env.${APP}`;
    } else {
      await $`rm -rf /tmp/.env.${APP}`;

      await $`run vault kv export --target=${target} --envfile=/tmp/.env.${APP}`;

      // Read the .env file
    }

    // Read the .env file
    const content: any = fsZX.readFileSync(env_file, 'utf-8');
    // Extract all variable names that don't start with TF_VAR

    const nonTfVarNames: any = content.match(/^(?!TF_VAR_)[A-Z_]+(?==)/gm);

    // Generate the prefixed variable declarations for non-TF_VAR variables

    // remove element TF_VAR_PORT

    let prefixedVars = nonTfVarNames
      .map((varName: any) => {
        const value = content.match(new RegExp(`^${varName}=(.*)$`, 'm'))[1];
        return `TF_VAR_${varName}=${value}`;
      })
      .join('\n');

    const projectHasBeenDefined = prefixedVars.match(/^TF_VAR_PROJECT=(.*)$/m);
    const appNameHasBeenDefined = prefixedVars.match(/^TF_VAR_APP=(.*)$/m);
    const portHasBeenDefined = prefixedVars.match(/^TF_VAR_PORT=(.*)$/m);
    const gcpProjectIdhAsBeenDefined = prefixedVars.match(
      /^TF_VAR_GCP_PROJECT_ID=(.*)$/m
    );

    if (!projectHasBeenDefined) {
      const SRC = Deno.env.get('SRC') || '';
      const { name } = await verifyIfMetaJsonExists(SRC);
      await $`echo PROJECT=${name} >> ${gitEnvPath}`;
      // add the project name to the .env file
      prefixedVars += `\nTF_VAR_PROJECT=${name}`;
    }

    if (!appNameHasBeenDefined) {
      const { name } = await verifyIfMetaJsonExists(currentPath);
      await $`echo APP=${name} >> ${gitEnvPath}`;
      prefixedVars += `\nTF_VAR_APP=${name}`;
    }

    if (!gcpProjectIdhAsBeenDefined) {
      const GCP_PROJECT_ID = Deno.env.get('GCP_PROJECT_ID') || '';
      await $`echo GCP_PROJECT_ID=${GCP_PROJECT_ID} >> ${gitEnvPath}`;
      prefixedVars += `\nTF_VAR_GCP_PROJECT_ID=${GCP_PROJECT_ID}`;
    }

    if (!portHasBeenDefined) {
      const { port } = await verifyIfMetaJsonExists(currentPath);
      await $`echo PORT=${port} >> ${gitEnvPath}`;
      prefixedVars += `\nTF_VAR_PORT=${port}`;
    }

    await $`rm -rf /tmp/.env.${APP}`;
    // write content to /tmp/.env.APP_NAME and add prefixedVars at the end

    await fsZX.writeFile(`/tmp/.env.${APP}`, `${content}\n${prefixedVars}`);

    const originalEnvContent = fs.readFileSync(`/tmp/.env.${APP}`, 'utf8');

    const envConfig = parse(originalEnvContent);

    // Use dotenv-expand to expand the variables
    const expandedConfig: any = expand({
      parsed: envConfig,
    });

    for (let keyValue in expandedConfig.parsed) {
      console.log(expandedConfig.parsed[keyValue]);
      await $`echo ${keyValue}=${expandedConfig.parsed[keyValue]} >> ${gitEnvPath}`;
    }
  }
}

////////////////////////////////////////////////////////////////////////////////
// SET ENVIRONMENT NAME IN ACTION STEPS
////////////////////////////////////////////////////////////////////////////////

export async function actionEnvSet() {
  let environement = '';

  if (Deno.env.get('SET_ENV')) {
    environement = Deno.env.get('SET_ENV') || '';
  } else {
    const currentBranchRaw = await $`git branch --show-current`;
    // trim the trailing newline
    const currentBranch = currentBranchRaw.stdout.trim();

    if (currentBranch === 'main') {
      environement = 'prod';
    } else {
      environement = currentBranch;
    }

    Deno.env.set('ENV', environement);
  }

  const gitEnvPathRaw = await $`echo $GITHUB_ENV`;

  const gitEnvPath = `${gitEnvPathRaw}`.replace(/(\r\n|\n|\r)/gm, '');

  core.setSecret(environement);
  core.setOutput('ENV', environement);
  await $`echo ENV=${environement} >> ${gitEnvPath}`;
}

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function act(program: any) {
  const act = program.command('action');
  act.description('run a github action');

  const actLocal = act.command('local');
  const actRemote = act.command('remote');
  const actSecrets = act.command('secrets');
  const actEnv = act.command('env');

  actLocal
    .description('run local action with at')
    .argument('[target]', 'workflow or job name')
    .option('--live', 'run live version on run')
    .option('--push', 'simulate push event')
    .option('--env <string>', "set environment name (ex: 'dev'")
    .option('--no-reuse', 'do not reuse container state')
    .option('--no-secure', "show secrets in logs (don't use in production)")
    .option('--custom', 'custom act container')
    .option(
      '-W, --workaround',
      'set file path to .github/workflows/workflow_name (workaround for a bug)'
    )
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
    .option('--global', 'set organization secrets')
    .description('set secrets for all the next action steps');

  actEnv
    .command('set')
    .action(actionEnvSet)
    .description('set environment variables for all the next action steps');
}
