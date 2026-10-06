#!/usr/bin/env -S deno run --allow-all

/**
 * @fileoverview CLI entry point for @ghostmind/run
 *
 * This module provides the command-line interface for the @ghostmind/run toolkit,
 * allowing users to run routines and manage herdr workspaces from the terminal.
 *
 * @example
 * ```bash
 * # Open the herdr workspace defined in meta.json
 * run herdr init
 *
 * # Run a routine from meta.json
 * run routine test
 *
 * # Show version
 * run --version
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
// VERSION FLAG
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

program.version(
  `@ghostmind/run v${await getVersion()}`,
  '-v, --version',
  'show version information'
);

////////////////////////////////////////////////////////////////////////////////
// COMMAND
////////////////////////////////////////////////////////////////////////////////

import commandHerdr from '../lib/herdr.ts';
import commandProjects from '../lib/projects.tsx';
import commandRoutine from '../lib/routine.ts';

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
  .hook('preAction', async (thisCommand: any) => {
    const { path, cible, env: envPath } = thisCommand.opts();

    if (path) {
      Deno.chdir(path);
    }

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

// The .env loading behind -c/--cible and -e/--env is the last legacy piece:
// apps on varlock (.env.schema) never use it. The warning goes to stderr only.
function deprecationWarning(what: string) {
  if (Deno.env.get('RUN_NO_DEPRECATION') === '1') return;
  console.error(`[run] DEPRECATED: ${what} will be removed; see system skill`);
}

////////////////////////////////////////////////////////////////////////////////
// COMMANDS
////////////////////////////////////////////////////////////////////////////////

await commandHerdr(program);
await commandProjects(program);
await commandRoutine(program);

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
} catch (err: any) {
  // commander has already printed its own output (--version, --help, a usage
  // error) and only reports the exit code here
  if (typeof err?.code === 'string' && err.code.startsWith('commander.')) {
    Deno.exit(err.exitCode ?? 1);
  }
  console.error(err);
  Deno.exit(1);
}

////////////////////////////////////////////////////////////////////////////////
// THE END
////////////////////////////////////////////////////////////////////////////////
