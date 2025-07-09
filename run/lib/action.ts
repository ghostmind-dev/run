/**
 * @fileoverview GitHub Actions operations module for @ghostmind/run
 *
 * This module provides GitHub Actions integration for running workflows
 * locally with act and triggering remote workflows via GitHub CLI.
 *
 * @module
 */

import { $, sleep, cd } from 'npm:zx@8.1.0';
import fs from 'npm:fs-extra@11.2.0';
import { join, extname } from 'jsr:@std/path@0.225.1';
import yaml from 'npm:js-yaml@4.1.0';
import { readFileSync } from 'node:fs';

////////////////////////////////////////////////////////////////////////////////
// MUTE BY DEFAULT
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

////////////////////////////////////////////////////////////////////////////////
// CONSTANTS
////////////////////////////////////////////////////////////////////////////////

const LOCALHOST_SRC = Deno.env.get('LOCALHOST_SRC');

////////////////////////////////////////////////////////////////////////////////
// ACT DEFAULT CONFIG
////////////////////////////////////////////////////////////////////////////////

const actArgmentsDefault: string[] = [
  '--platform=ubuntu-latest=ghcr.io/catthehacker/ubuntu:act-latest',
  `--directory=${LOCALHOST_SRC}`,
  '--bind',
  '--use-gitignore',
  `--secret=GH_TOKEN=${Deno.env.get('GITHUB_TOKEN')}`,
  `--secret=GITHUB_TOKEN=${Deno.env.get('GITHUB_TOKEN')}`,
  `--secret=VAULT_TOKEN=${Deno.env.get('VAULT_TOKEN')}`,
  `--secret=VAULT_ADDR=${Deno.env.get('VAULT_ADDR')}`,
];

/**
 * Options for running remote GitHub Actions
 */
export interface ActionRunRemoteOptions {
  /** Whether to watch the workflow execution */
  watch?: boolean;
  /** Input parameters to pass to the workflow */
  input?: string[];
  /** Git branch to run the workflow on */
  branch?: string;
}

/**
 * Run a remote GitHub Action workflow
 *
 * This function triggers a GitHub Action workflow on the remote repository
 * and optionally watches its execution progress.
 *
 * @param workflow - The name of the workflow to run
 * @param options - Configuration options for the workflow execution
 *
 * @example
 * ```typescript
 * // Run a workflow and watch its progress
 * await actionRunRemote("deploy", {
 *   watch: true,
 *   branch: "main",
 *   input: ["environment=production"]
 * });
 * ```
 */
export async function actionRunRemote(
  workflow: string,
  options: ActionRunRemoteOptions
): Promise<void> {
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
    console.log(error);
    Deno.exit(1);
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

/**
 * Run a GitHub Action workflow locally using act
 *
 * This function executes GitHub Action workflows locally using the `act` tool,
 * allowing for testing and debugging workflows without pushing to GitHub.
 *
 * @param target - The workflow target or job name to run
 * @param actArguments - Additional arguments to pass to the act command
 * @param event - The GitHub event type to simulate (e.g., 'push', 'pull_request')
 * @param custom - Whether to use custom container configuration
 * @param workaround - Whether to apply specific workarounds for act compatibility
 *
 * @example
 * ```typescript
 * // Run a specific job locally
 * await actionRunLocal("test", [], "push", false, false);
 *
 * // Run with custom container
 * await actionRunLocal("build", ["--reuse"], "push", true, false);
 * ```
 */
export async function actionRunLocal(
  target: any,
  actArguments: any,
  event: any,
  custom: any,
  workaround: any
): Promise<void> {
  const actArgmentsArray = [...actArgmentsDefault, ...actArguments];

  let workflowsPath = LOCALHOST_SRC + '/.github/workflows';

  if (custom == true) {
    actArgmentsArray[0] =
      '--platform=ubuntu-latest=ghcr.io/ghostmind-dev/act-base:latest';

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
    actArgmentsArray.push(`--workflows=${workflowsPath}/${target}.yaml`);
  } else {
    actArgmentsArray.push(`--workflows=${workflowsPath}`);
  }

  if (event === undefined) {
    actArgmentsArray.push(`--job=${target}`);

    await $`act ${actArgmentsArray}`;
  } else {
    actArgmentsArray.push(`--workflows=${workflowsPath}/${target}.yaml`);

    if (event === 'push') {
      actArgmentsArray.push('--eventpath');
    }

    await $`act ${event} ${actArgmentsArray}`;
  }
}

/**
 * Entry point for running GitHub Actions locally with enhanced options
 *
 * This function processes command-line options and prepares the environment
 * for running GitHub Actions locally using act, with support for inputs,
 * environment variables, and event simulation.
 *
 * @param target - The workflow target or job name to run
 * @param options - Configuration options for the local action execution
 * @param options.live - Whether to run in live mode
 * @param options.input - Input parameters for the action
 * @param options.reuse - Whether to reuse container state
 * @param options.secure - Whether to hide secrets in logs
 * @param options.event - The GitHub event type to simulate
 * @param options.push - Whether to simulate a push event
 * @param options.custom - Whether to use custom container configuration
 * @param options.workaround - Whether to apply act compatibility workarounds
 * @param options.env - Environment name to set
 *
 * @example
 * ```typescript
 * // Run action with live mode and inputs
 * await actionRunLocalEntry('test', {
 *   live: true,
 *   input: ['environment=staging', 'debug=true'],
 *   reuse: true
 * });
 * ```
 */
export async function actionRunLocalEntry(target: any, options: any) {
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
  let actArgments = ['--eventpath=/tmp/inputs.json'];

  if (reuse === true) {
    actArgments.push('--reuse');
  }

  if (env) {
    actArgments.push(`--env=SET_ENV=${env}`);
  }

  if (event === 'push') {
    const eventFile = await fs.readFile(
      `${LOCALHOST_SRC}/.github/mocking/push.json`,
      'utf8'
    );

    // this push has 3 properties: ref, before, after
    // add these properties to the /tmp/inputs.json file

    const currentInputs = JSON.parse(readFileSync('/tmp/inputs.json', 'utf8'));
    const eventFileJson = JSON.parse(eventFile);

    fs.writeJsonSync('/tmp/inputs.json', {
      ...eventFileJson,
      ...currentInputs,
    });
  }
  if (!secure) {
    actArgments.push('--insecure-secrets');
  }

  await actionRunLocal(target, actArgments, event, custom, workaround);
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
    .argument('<target>', 'workflow or job name')
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
    .argument('<workflow>', 'workflow name')
    .option('--watch', 'watch for changes')
    .option('-i, --input [inputs...]', 'action inputs')
    .option('--branch <ref>', 'branch to run workflow on')
    .action(actionRunRemote);
}
