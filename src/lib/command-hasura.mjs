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
// SQUASH MIGRATIONS
////////////////////////////////////////////////////////////////////////////////

export async function hasuraMigrateSquash(version) {
  const { hasura: hasuraConfig } = metaConfig;

  const { state } = { ...hasuraConfigDefault, ...hasuraConfig };

  cd(`${currentPath}/${state}`);

  $.verbose = true;
  await $`hasura migrate squash --from ${version} --database-name default`;
}

////////////////////////////////////////////////////////////////////////////////
// CREATE MIGRATIONS
////////////////////////////////////////////////////////////////////////////////

export async function hasuraMigrateCreate(name) {
  const { hasura: hasuraConfig } = metaConfig;

  const { state } = { ...hasuraConfigDefault, ...hasuraConfig };

  cd(`${currentPath}/${state}`);

  $.verbose = true;

  await $`hasura migrate create "${name}" --from-server --database-name default`;
}

////////////////////////////////////////////////////////////////////////////////
// APPLY MIGRATIONS
////////////////////////////////////////////////////////////////////////////////

export async function hasuraMigrateApply(version) {
  const { hasura: hasuraConfig } = metaConfig;

  const { state } = { ...hasuraConfigDefault, ...hasuraConfig };

  cd(`${currentPath}/${state}`);

  $.verbose = true;
  await $`hasura migrate apply --version ${version} --skip-execution --database-name default`;
}

////////////////////////////////////////////////////////////////////////////////
//  HASURA GLOBAL
////////////////////////////////////////////////////////////////////////////////

export async function hasuraGlobalCmd(commands, options) {
  const { hasura: hasuraConfig } = metaConfig;

  const { databaseName } = options;

  const { state } = { ...hasuraConfigDefault, ...hasuraConfig };

  cd(`${currentPath}/${state}`);

  $.verbose = true;

  if (databaseName !== undefined) {
    commands.push(`--database-name`);
    commands.push(`${databaseName}`);
  }

  await $`hasura ${commands}`;
}

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function hasura(program) {
  const hasura = program.command('hasura');
  hasura.description('perform hasura maintenances');

  const hasuraCommand = hasura.command('cmd');
  hasuraCommand
    .argument('[commands...]', 'command to run')
    .option('--database-name <database-name>', 'database name')
    .action(hasuraGlobalCmd);

  const hasuraConsole = hasura.command('console');
  const hasuraMigrate = hasura.command('migrate');

  hasuraConsole
    .description('open hasura console locally ')
    .action(hasuraOpenConsole);

  const migrateSquash = hasuraMigrate.command('squash');
  migrateSquash
    .description('squash all migrations')
    .argument('<version>', 'version to squash to')
    .action(hasuraMigrateSquash);

  const migrateApply = hasuraMigrate.command('apply');
  migrateApply
    .description('apply all migrations')
    .argument('<version>', 'version to apply')
    .action(hasuraMigrateApply);

  const migrateCreate = hasuraMigrate.command('create');
  migrateCreate
    .description('create a new migration from current schema')
    .argument('<name>', 'name of the migration')
    .action(hasuraMigrateCreate);
}
