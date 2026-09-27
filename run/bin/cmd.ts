#!/usr/bin/env -S deno run --allow-all

/**
 * @fileoverview CLI entry point for @ghostmind/run
 *
 * This module provides the command-line interface for the @ghostmind/run toolkit,
 * allowing users to execute DevOps operations from the terminal.
 *
 * @example
 * ```bash
 * # Build Docker containers
 * run docker build --component my-app
 *
 * # Run Docker Compose services
 * run docker up --component web --build --detach
 *
 * # Execute GitHub Actions locally
 * run action local test-workflow
 *
 * # Show version
 * run version
 * ```
 *
 * @module
 */

import { $ } from 'npm:zx@8.1.0';
import { Command } from 'npm:commander@12.1.0';
import { setSecretsOnLocal } from '../utils/divers.ts';
import { argv } from 'node:process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

////////////////////////////////////////////////////////////////////////////////
// VERBOSE BY DEFAULT
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

////////////////////////////////////////////////////////////////////////////////
// STARTING PROGRAM
////////////////////////////////////////////////////////////////////////////////

const program = new Command();

////////////////////////////////////////////////////////////////////////////////
// VERSION COMMAND
////////////////////////////////////////////////////////////////////////////////

/**
 * Read version from deno.json file
 */
async function getVersion(): Promise<string> {
  try {
    // Get the directory of the current script (cmd.ts is in run/bin/)
    const scriptPath = import.meta.url;
    const scriptDir = dirname(fileURLToPath(scriptPath));

    // Go up two levels from run/bin/ to reach the root where deno.json is located
    const rootDir = dirname(dirname(scriptDir));
    const denoJsonPath = join(rootDir, 'deno.json');

    const denoJsonContent = await Deno.readTextFile(denoJsonPath);
    const denoJson = JSON.parse(denoJsonContent);

    return denoJson.version || 'unknown';
  } catch (error) {
    console.error(
      'Error reading version from deno.json:',
      error instanceof Error ? error.message : String(error),
    );
    return 'unknown';
  }
}

program
  .command('version')
  .description('show version information')
  .action(async () => {
    const version = await getVersion();
    console.log(`@ghostmind/run v${version}`);
  });

////////////////////////////////////////////////////////////////////////////////
// COMMAND
////////////////////////////////////////////////////////////////////////////////

import commandAction from '../lib/action.ts';
import commandCustom from '../lib/custom.ts';
import commandDocker from '../lib/docker.ts';
import commandHerdr from '../lib/herdr.ts';
import commandMeta from '../lib/meta.ts';
import commandMisc from '../lib/misc.ts';
import commandRoutine from '../lib/routine.ts';
import commandTerraform from '../lib/terraform.ts';
import commandTmux from '../lib/tmux.ts';
import commmandVault from '../lib/vault.ts';

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

const run = program.name('run');

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

program
  .option('-c, --cible <env context>', 'target environment context')
  .option('-e, --env <env path>', 'path to load env variables from')
  .option('-p, --path <path>', 'run the script from a specific path')
  .hook('preAction', async (thisCommand: any, actionCommand: any) => {
    const { path, cible, env: envPath } = thisCommand.opts();

    if (path) {
      Deno.chdir(path);
    }

    warnIfDeprecated(actionCommand);

    if (cible || envPath) {
      deprecationWarning("'-c/--cible' and '-e/--env' env injection");
    }

    // A varlock app (.env.schema) resolves its own env; loading .env files here
    // would fail without .env.base, or override its secrets with raw pointers.
    const isVarlockApp = existsSync(join(Deno.cwd(), '.env.schema'));

    if (
      !isVarlockApp &&
      !Deno.env.get('GITHUB_ACTIONS') &&
      Deno.env.get('CUSTOM_STATUS') !== 'in_progress'
    ) {
      await setSecretsOnLocal(cible || 'local', envPath);
      Deno.env.set('ENV', cible || 'local');
    }
  });

////////////////////////////////////////////////////////////////////////////////
// DEPRECATIONS
////////////////////////////////////////////////////////////////////////////////

// Everything but herdr and routine is on its way out. Warnings go to stderr
// only, so stdout and exit codes are unchanged for scripts that parse them.
const KEPT_COMMANDS = ['herdr', 'routine', 'version'];
const KEPT_MISC = ['uuid', 'token', 'wait', 'stop'];

function deprecationWarning(what: string) {
  if (Deno.env.get('RUN_NO_DEPRECATION') === '1') return;
  console.error(`[run] DEPRECATED: ${what} will be removed; see system skill`);
}

function warnIfDeprecated(actionCommand: any) {
  const names: string[] = [];
  for (let cmd = actionCommand; cmd && cmd.parent; cmd = cmd.parent) {
    names.unshift(cmd.name());
  }
  const [top, sub] = names;
  if (!top || KEPT_COMMANDS.includes(top)) return;
  if (top === 'misc' && KEPT_MISC.includes(sub)) return;
  deprecationWarning(`'run ${names.join(' ')}'`);
}

////////////////////////////////////////////////////////////////////////////////
// GIT COMMAND
////////////////////////////////////////////////////////////////////////////////

await commandAction(program);
await commandCustom(program);
await commandDocker(program);
await commandHerdr(program);
await commandMeta(program);
await commandMisc(program);
await commandRoutine(program);
await commandTerraform(program);
await commandTmux(program);
await commmandVault(program);

////////////////////////////////////////////////////////////////////////////////
// PROGRAM EXIT
////////////////////////////////////////////////////////////////////////////////

program.exitOverride();

////////////////////////////////////////////////////////////////////////////////
// PARSING ARGUMENTS
////////////////////////////////////////////////////////////////////////////////

try {
  if (argv.length === 2) {
    console.error('No command provided');
    console.log(program.helpInformation());
    Deno.exit(0);
  }

  if (argv.length === 3 && argv[2] === '--help') {
    console.log(program.helpInformation());
    Deno.exit(0);
  }

  await program.parseAsync(argv);
} catch (err) {
  console.error(err);
  Deno.exit(1);
}

////////////////////////////////////////////////////////////////////////////////
// THE END
////////////////////////////////////////////////////////////////////////////////
