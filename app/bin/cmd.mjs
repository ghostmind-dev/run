#!/usr/bin/env node

import { $ } from 'zx';
import { config } from 'dotenv';
import _ from 'lodash';
import path from 'path';
import { Command, Option } from 'commander';
import commandTerraform from '../lib/command-terraform.mjs';
import commandCustom from '../lib/command-custom.mjs';
import commandVault from '../lib/command-vault.mjs';
import commandAction from '../lib/command-action.mjs';
import commandSkaffold from '../lib/command-skaffold.mjs';
import commandHasura from '../lib/command-hasura.mjs';
import commandCluster from '../lib/command-cluster.mjs';
import commandUtils from '../lib/command-utils.mjs';
import commandDocker from '../lib/command-docker.mjs';
import commandMachine from '../lib/command-machine.mjs';
import commandNpm from '../lib/command-npm.mjs';
import commandTunnel from '../lib/command-tunnel.mjs';

////////////////////////////////////////////////////////////////////////////////
// CONST
////////////////////////////////////////////////////////////////////////////////

const SRC = process.env.SRC;

////////////////////////////////////////////////////////////////////////////////
// CONST
////////////////////////////////////////////////////////////////////////////////

const currentPath = process.cwd();

////////////////////////////////////////////////////////////////////////////////
// STARTING PROGRAM
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

const program = new Command();

////////////////////////////////////////////////////////////////////////////////
// DOTENV
////////////////////////////////////////////////////////////////////////////////

config({ path: `${currentPath}/.env.local` });

program
  .option('--envname <env context>', 'name of the env to load')
  .on('option:envname', function (envname) {
    config({ path: `${currentPath}/${envname}`, override: true });
  })
  .option('--envpath <filename>', 'path to envfile to load')
  .on('option:envpath', function (filepath) {
    config({ path: path.resolve(currentPath, filepath), override: true });
  });

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

program.exitOverride();

program.name('run');

////////////////////////////////////////////////////////////////////////////////
// GIT COMMAND
////////////////////////////////////////////////////////////////////////////////

await commandMachine(program);
await commandTerraform(program);
await commandCustom(program);
await commandVault(program);
await commandAction(program);
await commandSkaffold(program);
await commandHasura(program);
await commandCluster(program);
await commandUtils(program);
await commandDocker(program);
await commandNpm(program);
await commandTunnel(program);

////////////////////////////////////////////////////////////////////////////////
// PARSING ARGUMENTS
////////////////////////////////////////////////////////////////////////////////

try {
  program.parse(process.argv);
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
