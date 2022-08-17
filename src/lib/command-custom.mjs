import { $, cd, fs } from 'zx';
import { createRequire } from 'module';
import { detectScriptsDirectory } from '../utils/divers.mjs';

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
};

////////////////////////////////////////////////////////////////////////////////
// RUN CUSTOM SCRIPT
////////////////////////////////////////////////////////////////////////////////

async function runCustomScript(script, arg) {
  let { type, name, custom_script } = await fs.readJsonSync('meta.json');

  let currentPath = process.cwd();

  const { root } = { ...customConfigDefault, ...custom_script };
  cd(`${currentPath}/${root}`);
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
    await custom_function.default(arg);
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
    .arguments('[arg]', 'arguments for the script')
    .action(runCustomScript);
}
