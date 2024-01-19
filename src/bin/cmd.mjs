#!/usr/bin/env node

import { $ } from 'zx';
import { config } from 'dotenv';
import _ from 'lodash';
import { Command, Option } from 'commander';
import commandTerraform from '../lib/command-terraform.mjs';
import commandCustom from '../lib/command-custom.mjs';
import commandVault from '../lib/command-vault.mjs';
import commandAction from '../lib/command-action.mjs';
import commandGithub from '../lib/command-github.mjs';
import commandSkaffold from '../lib/command-skaffold.mjs';
import commandHasura from '../lib/command-hasura.mjs';
import commandCluster from '../lib/command-cluster.mjs';
import commandUtils from '../lib/command-utils.mjs';
import commandDocker from '../lib/command-docker.mjs';
import commandLib from '../lib/command-lib.mjs';
import commandMachine from '../lib/command-machine.mjs';
import commandGhost from '../lib/command-ghost.mjs';
import commandNpm from '../lib/command-npm.mjs';

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

program.addOption(
  new Option('--env-filename <filename>', 'env filename to load')
);

////////////////////////////////////////////////////////////////////////////////
// DOTENV
////////////////////////////////////////////////////////////////////////////////

config({ path: `${SRC}/.env` });

let initPath = currentPath;

let paths = [];

if (SRC !== undefined) {
  while (initPath !== SRC) {
    paths.push(initPath);
    const pathParts = initPath.split('/');
    pathParts.pop(); // Remove the last element
    initPath = pathParts.join('/');
  }

  -_.reverse(paths).map((path) => config({ path: `${path}/.env` }));
} else {
  config({ path: `${currentPath}/.env` });
}

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
await commandGithub(program);
await commandSkaffold(program);
await commandHasura(program);
await commandCluster(program);
await commandUtils(program);
await commandDocker(program);
await commandLib(program);
await commandGhost(program);
await commandNpm(program);

////////////////////////////////////////////////////////////////////////////////
// PARSING ARGUMENTS
////////////////////////////////////////////////////////////////////////////////

try {
  program.parse(process.argv);
} catch (err) {
  const { exitCode, name, code, message } = err;

  if (!message.includes('outputHelp')) {
    console.error('something went wrong');
  }
}

////////////////////////////////////////////////////////////////////////////////
// ENV FILENAME
////////////////////////////////////////////////////////////////////////////////

const { envFilename } = program.opts();

if (envFilename) {
  config({ path: `${currentPath}/${envFilename}`, override: true });
}

////////////////////////////////////////////////////////////////////////////////
// THE END
////////////////////////////////////////////////////////////////////////////////
