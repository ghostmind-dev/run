#!/usr/bin/env -S deno run --allow-all

import { $, fs } from 'npm:zx';
import { config } from 'npm:dotenv';
import { expand } from 'npm:dotenv-expand';
import _ from 'npm:lodash';
import { Command } from 'npm:commander';
import { verifyIfMetaJsonExists } from '../utils/divers.ts';
import { getAppName } from '../lib/utils.ts';

////////////////////////////////////////////////////////////////////////////////
// SRC
////////////////////////////////////////////////////////////////////////////////

const SRC = Deno.env.get('SRC');

////////////////////////////////////////////////////////////////////////////////
// CONST
////////////////////////////////////////////////////////////////////////////////

const currentPath = Deno.cwd();

////////////////////////////////////////////////////////////////////////////////
// STARTING PROGRAM
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

const program = new Command();

////////////////////////////////////////////////////////////////////////////////
// COMMAND
////////////////////////////////////////////////////////////////////////////////

import commandAction from '../lib/action.ts';
import commandCustom from '../lib/custom.ts';
import commandDocker from '../lib/docker.ts';
import commandHasura from '../lib/hasura.ts';
import commandMachine from '../lib/machine.ts';
import commandNpm from '../lib/npm.ts';
import commandTerraform from '../lib/terraform.ts';
import commandTunnel from '../lib/tunnel.ts';
import commandUtils from '../lib/utils.ts';
import commmandVault from '../lib/vault.ts';

////////////////////////////////////////////////////////////////////////////////
// SET ENVIRONMENT .ENV VARIABLES
////////////////////////////////////////////////////////////////////////////////

async function setSecretsOnLocal(target: string) {
  if (!Deno.env.get('GITHUB_ACTIONS')) {
    const APP_NAME = await getAppName();

    const fsZX: any = fs;

    // let baseUrl = null;

    const { secrets } = await verifyIfMetaJsonExists(currentPath);

    let env_file = `/tmp/.env.${APP_NAME}`;

    if (secrets?.base) {
      let base_file = `${currentPath}/${secrets.base}`;
      let target_file = `${currentPath}/.env.${target}`;

      try {
        await fs.access(target_file, fsZX.constants.R_OK);
        await fs.access(base_file, fsZX.constants.R_OK);
      } catch (err) {
        return;
      }

      // merge base and target files in /tmp/.env.APP_NAME

      await $`rm -rf /tmp/.env.${APP_NAME}`;

      await $`cat ${base_file} ${target_file} > /tmp/.env.${APP_NAME}`;
    } else {
      let target_file = `${currentPath}/.env.${target}`;
      await $`rm -rf /tmp/.env.${APP_NAME}`;

      try {
        await fs.access(target_file, fsZX.constants.R_OK);
      } catch (err) {
        return;
      }

      // Read the .env file

      await $`cp ${target_file} /tmp/.env.${APP_NAME}`;
    }

    //

    // // Read the .env file
    const content: any = fsZX.readFileSync(env_file, 'utf-8');

    const nonTfVarNames: any = content.match(/^(?!TF_VAR_)[A-Z_]+(?==)/gm);

    // Extract all variable names that don't start with TF_VAR

    // remove element TF_VAR_PORT

    let prefixedVars = nonTfVarNames
      .map((varName: any) => {
        const value = content.match(new RegExp(`^${varName}=(.*)$`, 'm'))[1];
        return `TF_VAR_${varName}=${value}`;
      })
      .join('\n');

    const projectHasBeenDefined = prefixedVars.match(/^TF_VAR_PROJECT=(.*)$/m);
    const appNameHasBeenDefined = prefixedVars.match(/^TF_VAR_APP=(.*)$/m);
    const gcpProjectIdhAsBeenDefined = prefixedVars.match(
      /^TF_VAR_GCP_PROJECT_ID=(.*)$/m
    );

    if (!projectHasBeenDefined) {
      const SRC = Deno.env.get('SRC') || '';
      const { name } = await verifyIfMetaJsonExists(SRC);
      // add the project name to the .env file
      prefixedVars += `\nTF_VAR_PROJECT=${name}`;
    }

    if (!appNameHasBeenDefined) {
      const { name } = await verifyIfMetaJsonExists(currentPath);
      prefixedVars += `\nTF_VAR_APP=${name}`;
    }

    if (!gcpProjectIdhAsBeenDefined) {
      const GCP_PROJECT_ID = Deno.env.get('GCP_PROJECT_ID') || '';
      prefixedVars += `\nTF_VAR_GCP_PROJECT_ID=${GCP_PROJECT_ID}`;
    }

    await $`rm -rf /tmp/.env.${APP_NAME}`;
    // write content to /tmp/.env.APP_NAME and addd prefixedVars at the end

    await fsZX.writeFile(
      `/tmp/.env.${APP_NAME}`,
      `${content}\n${prefixedVars}`
    );

    expand(config({ path: `/tmp/.env.${APP_NAME}`, override: true }));

    expand(
      config({ path: `${Deno.env.get('HOME')}/.zprofile`, override: false })
    );
  }
}

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

program.option('--cible <env context>', 'target environment context');
program.name('run');

////////////////////////////////////////////////////////////////////////////////
// GIT COMMAND
////////////////////////////////////////////////////////////////////////////////

await commandAction(program);
await commandCustom(program);
await commandDocker(program);
await commandHasura(program);
await commandMachine(program);
await commandNpm(program);
await commandTerraform(program);
await commandTunnel(program);
await commandUtils(program);
await commmandVault(program);

////////////////////////////////////////////////////////////////////////////////
// PARSING ARGUMENTS
////////////////////////////////////////////////////////////////////////////////

try {
  program.parse();

  const { cible } = program.opts();

  await setSecretsOnLocal(cible || 'local');
} catch (err) {
  const { exitCode, name, code, message } = err;

  if (!message.includes('outputHelp')) {
    console.log(message);
    console.error('something went wrong');
  }
}

////////////////////////////////////////////////////////////////////////////////
// THE END
////////////////////////////////////////////////////////////////////////////////
