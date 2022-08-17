import { $, which, sleep, cd, fs } from 'zx';
import { detectScriptsDirectory } from '../utils/divers.mjs';

////////////////////////////////////////////////////////////////////////////////
// MUTE BY DEFAULT
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

////////////////////////////////////////////////////////////////////////////////
// ACTION DEFAULT CONFIG
////////////////////////////////////////////////////////////////////////////////

const hasuraConfigDefault = {
  state: 'app/state',
};

////////////////////////////////////////////////////////////////////////////////
// RUNNING COMMAND LOCATION
////////////////////////////////////////////////////////////////////////////////

let currentPath = await detectScriptsDirectory(process.cwd());

cd(currentPath);

////////////////////////////////////////////////////////////////////////////////
// RUNNING COMMAND LOCATION
////////////////////////////////////////////////////////////////////////////////

const metaConfig = await fs.readJsonSync('meta.json');

////////////////////////////////////////////////////////////////////////////////
// RUN ACTION LOCALLY WITH ACT
////////////////////////////////////////////////////////////////////////////////

export async function hasuraOpenConsole() {
  const { hasura: hasuraConfig } = metaConfig;

  const { state } = { ...hasuraConfigDefault, ...hasuraConfig };

  cd(`${currentPath}/${state}`);

  $.verbose = true;
  await $`hasura console --no-browser `;
}

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function hasura(program) {
  const hasura = program.command('hasura');
  hasura.description('perform hasura maintenances');

  const hasruaConsole = hasura.command('console');

  hasruaConsole
    .description('open hasura console locally ')
    .action(hasuraOpenConsole);
}
