import { $, which, sleep, cd } from 'zx';
import core from '@actions/core';
import {
  detectScriptsDirectory,
  verifyIfMetaJsonExists,
} from '../utils/divers.mjs';

////////////////////////////////////////////////////////////////////////////////
// MUTE BY DEFAULT
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

////////////////////////////////////////////////////////////////////////////////
// CONSTANTS
////////////////////////////////////////////////////////////////////////////////

const LOCALHOST_SRC =
  process.env.CODESPACES === 'true'
    ? process.env.SRC
    : process.env.LOCALHOST_SRC;

////////////////////////////////////////////////////////////////////////////////
// RUNNING COMMAND LOCATION
////////////////////////////////////////////////////////////////////////////////

let currentPath = await detectScriptsDirectory(process.cwd());

cd(currentPath);

////////////////////////////////////////////////////////////////////////////////
// RUNNING LIB
////////////////////////////////////////////////////////////////////////////////

export async function runLib(cmd) {
  // convert .arugment --argumaent

  $.verbose = true;

  const clean = cmd.map((arg) => {
    if (arg.startsWith('.')) {
      return arg.replace('.', '--');
    }
    return arg;
  });

  await $`${clean}`;
}

////////////////////////////////////////////////////////////////////////////////
// CURRENT METADATA
////////////////////////////////////////////////////////////////////////////////

let metaConfig = await verifyIfMetaJsonExists(currentPath);

export default async function lib(program) {
  const lib = program.command('lib');
  lib.argument('<cmd> [env...]', 'command to run');
  lib.description('run utils with context');
  lib.action(runLib);
}
