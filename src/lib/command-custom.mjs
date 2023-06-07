import * as zx from 'zx';
import { createRequire } from 'module';
import {
  detectScriptsDirectory,
  verifyIfMetaJsonExists,
  setSecretsUptoProject,
} from '../utils/divers.mjs';

////////////////////////////////////////////////////////////////////////////////
//  SETTING UP ZX
////////////////////////////////////////////////////////////////////////////////

const { $, cd, sleep, fs } = zx;

////////////////////////////////////////////////////////////////////////////////
// MUTE BY DEFAULT
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

////////////////////////////////////////////////////////////////////////////////
// EXPOSE NPM MODULE
////////////////////////////////////////////////////////////////////////////////

const require = createRequire(import.meta.url);
const pathZx = require.resolve('zx');

process.env.ZX = pathZx;

////////////////////////////////////////////////////////////////////////////////
// CUSTOM CONFIG DEFAULT
////////////////////////////////////////////////////////////////////////////////

const customConfigDefault = {
  root: 'scripts',
  getSecretsUpToProject: true,
};

////////////////////////////////////////////////////////////////////////////////
// RUN CUSTOM SCRIPT
////////////////////////////////////////////////////////////////////////////////

async function runCustomScript(script, argument, options) {
  let { custom_script } = await fs.readJsonSync('meta.json');

  let currentPath = process.cwd();

  let { test, input, dev } = options;

  ////////////////////////////////////////////////////////////////////////////////
  // CURRENT METADATA
  ////////////////////////////////////////////////////////////////////////////////

  let metaConfig = await verifyIfMetaJsonExists(currentPath);

  let testMode = test === undefined ? {} : { root: 'test' };

  const SRC = process.env.SRC;

  const run =
    dev === true
      ? `${SRC}/dev/src/bin/cmd.mjs`
      : `${SRC}/node_modules/@ghostmind-dev/run/src/bin/cmd.mjs`;

  const utils =
    dev === true
      ? `${SRC}/dev/src/main.mjs`
      : `${SRC}/node_modules/@ghostmind-dev/run/src/main.mjs`;

  const { root, getSecretsUpToProject } = {
    ...customConfigDefault,
    ...custom_script,
    ...testMode,
  };
  cd(`${currentPath}/${root}`);

  if (getSecretsUpToProject === true) {
    await setSecretsUptoProject(currentPath);
  }

  // if there is no custom script
  // return the list of available custom scripts
  if (script === undefined) {
    try {
      const { stdout: scripts } = await $`ls *.mjs`;
      // remove \n from apps
      let scriptsArray = scripts.split('\n');
      // removing empty element from scriptsArray
      scriptsArray.pop();
      console.log('Available scripts:');
      for (let scriptAvailable of scriptsArray) {
        scriptAvailable = scriptAvailable.replace('.mjs', '');
        console.log(`- ${scriptAvailable}`);
      }
    } catch (error) {
      console.log('no custom script found');
    }
    return;
  }
  // if there is a custom script
  // try to run the custom script
  try {
    const custom_function = await import(
      `${currentPath}/${root}/${script}.mjs`
    );

    $.verbose = true;

    await custom_function.default(argument, {
      input: input === undefined ? [] : input,
      metaConfig,
      currentPath,
      zx,
      run,
      utils,
      env: process.env,
    });
  } catch (e) {
    console.log(e);
    console.log('something went wrong');
  }
}
////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function commandCustom(program) {
  const custom = program.command('custom');
  custom
    .description('run custom script')
    .argument('[script]', 'script to perform')
    .argument('[argument]', 'single argument for the script')
    .option('-i, --input <items...>', 'multiple arguments for the script')
    .option('--dev', 'run in dev mode')
    .option('--test', 'run in test mode')
    .action(runCustomScript);
}
