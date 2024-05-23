#!/usr/bin/env -S deno run --allow-all

import { $ } from 'npm:zx@8.1.0';
import { Command } from 'npm:commander@12.1.0';
import { setSecretsOnLocal, setEnvOnLocal } from '../utils/divers.ts';

////////////////////////////////////////////////////////////////////////////////
// VERBOSE BY DEFAULT
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

////////////////////////////////////////////////////////////////////////////////
// STARTING PROGRAM
////////////////////////////////////////////////////////////////////////////////

const program = new Command();

////////////////////////////////////////////////////////////////////////////////
// COMMAND
////////////////////////////////////////////////////////////////////////////////

import commandAction from '../lib/action.ts';
import commandCustom from '../lib/custom.ts';
import commandDocker from '../lib/docker.ts';
import commandHasura from '../lib/hasura.ts';
import commandMachine from '../lib/machine.ts';
import commandMeta from '../lib/meta.ts';
import commandMisc from '../lib/misc.ts';
import commandRoutine from '../lib/routine.ts';
import commandTerraform from '../lib/terraform.ts';
import commandTunnel from '../lib/tunnel.ts';
import commmandVault from '../lib/vault.ts';

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

const run = program.name('run');

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

program
  .option('--cible <env context>', 'target environment context')
  .hook('preAction', async (thisCommand: any) => {
    if (!Deno.env.get('GITHUB_ACTIONS')) {
      const { cible } = thisCommand.opts();
      await setSecretsOnLocal(cible || 'local');
      await setEnvOnLocal();
    }
  });

////////////////////////////////////////////////////////////////////////////////
// GIT COMMAND
////////////////////////////////////////////////////////////////////////////////

await commandAction(program);
await commandCustom(program);
await commandDocker(program);
await commandHasura(program);
await commandMachine(program);
await commandMeta(program);
await commandMisc(program);
await commandRoutine(program);
await commandTerraform(program);
await commandTunnel(program);
await commmandVault(program);

////////////////////////////////////////////////////////////////////////////////
// PROGRAM EXIT
////////////////////////////////////////////////////////////////////////////////

program.exitOverride();

////////////////////////////////////////////////////////////////////////////////
// PARSING ARGUMENTS
////////////////////////////////////////////////////////////////////////////////

try {
  await program.parseAsync();
} catch (err) {
  const { message } = err;

  if (!message.includes('outputHelp')) {
    console.log(message);
    console.error('something went wrong');
  }
}

////////////////////////////////////////////////////////////////////////////////
// THE END
////////////////////////////////////////////////////////////////////////////////
