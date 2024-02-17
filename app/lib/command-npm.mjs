import { $, which, sleep, cd, fs } from 'zx';
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
// CURRENT METADATA
////////////////////////////////////////////////////////////////////////////////

let metaConfig = await verifyIfMetaJsonExists(currentPath);

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function npm(program) {
  const npm = program.command('npm');
  npm
    .description('run npm scxripts')
    .argument('<script>', 'script to run')
    .action(async (script) => {
      $.verbose = true;

      if (!fs.existsSync('package.json')) {
        const { npm_scripts } = metaConfig;
        if (npm_scripts && npm_scripts[script]) {
          // create a tmp package.json with the scripts
          const packageJson = {
            name: 'tmp',
            version: '1.0.0',
            scripts: { ...npm_scripts },
          };

          fs.writeFileSync(
            '/tmp/package.json',
            JSON.stringify(packageJson, null, 2)
          );

          await $`cd /tmp && npm run ${script}`;
        }

        return;
      }

      await $`npm run ${script}`;
    });
}
