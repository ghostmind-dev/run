import { $, cd, fs } from 'npm:zx';
import {
  detectScriptsDirectory,
  verifyIfMetaJsonExists,
} from '../utils/divers.ts';

////////////////////////////////////////////////////////////////////////////////
// MUTE BY DEFAULT
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

////////////////////////////////////////////////////////////////////////////////
// RUNNING COMMAND LOCATION
////////////////////////////////////////////////////////////////////////////////

let currentPath = await detectScriptsDirectory(Deno.cwd());

cd(currentPath);

////////////////////////////////////////////////////////////////////////////////
// CURRENT METADATA
////////////////////////////////////////////////////////////////////////////////

let metaConfig = await verifyIfMetaJsonExists(currentPath);

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function npm(program: any) {
  $.verbose = false;
  const routine = program.command('routine');
  routine
    .description('run npm scxripts')
    .argument('<script>', 'script to run')
    .action(async (script: any) => {
      $.verbose = false;

      if (!fs.existsSync('package.json')) {
        const { routines } = metaConfig;

        if (routines) {
          if (routines && routines[script]) {
            // create a tmp package.json with the scripts
            const packageJson = {
              scripts: { ...routines },
            };

            const randomFolder = Math.random().toString(36).substring(7);

            await $`rm -rf /tmp/${randomFolder}`;

            await $`mkdir -p /tmp/${randomFolder}`;

            fs.writeFileSync(
              `/tmp/${randomFolder}/package.json`,
              JSON.stringify(packageJson, null, 2)
            );

            cd(`/tmp/${randomFolder}`);

            $.verbose = true;

            await $`npm run ${script}`;

            $.verbose = false;

            await $`rm -rf /tmp/${randomFolder}`;
          }

          return;
        }
      }
    });
}
