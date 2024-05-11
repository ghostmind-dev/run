import { $, cd, fs } from 'npm:zx';
import { detectScriptsDirectory } from '../utils/divers.ts';

////////////////////////////////////////////////////////////////////////////////
// MUTE BY DEFAULT
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

////////////////////////////////////////////////////////////////////////////////
// STATE TYPE
////////////////////////////////////////////////////////////////////////////////

type State = {
  state: string;
};

////////////////////////////////////////////////////////////////////////////////
// ACTION DEFAULT CONFIG
////////////////////////////////////////////////////////////////////////////////

const hasuraConfigDefault: State = {
  state: 'container/state',
};

////////////////////////////////////////////////////////////////////////////////
// RUNNING COMMAND LOCATION
////////////////////////////////////////////////////////////////////////////////

let currentPath = await detectScriptsDirectory(Deno.cwd());

cd(currentPath);

////////////////////////////////////////////////////////////////////////////////
// RUN ACTION LOCALLY WITH ACT
////////////////////////////////////////////////////////////////////////////////

export async function hasuraOpenConsole(options: any) {
  const metaConfig = await fs.readJsonSync('meta.json');

  const { hasura: hasuraConfig } = metaConfig;

  const { local, wait } = options;

  const { state }: State = { ...hasuraConfigDefault, ...hasuraConfig };

  cd(`${currentPath}/${state}`);

  async function isHasuraReady() {
    try {
      let HASURA_GRAPHQL_ENDPOINT =
        Deno.env.get('HASURA_GRAPHQL_ENDPOINT') ||
        'http://host.docker.internal:8081';

      const response = await fetch(`${HASURA_GRAPHQL_ENDPOINT}/healthz`);
      return response.ok; // Returns true if the status code is 2xx
    } catch (error) {
      console.error('Hasura health check failed:', error.message);
      return false;
    }
  }

  // Polling function to wait for Hasura to be ready
  async function waitForHasura() {
    let ready = await isHasuraReady();
    while (!ready) {
      console.log('Waiting for Hasura to be ready...');
      await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait for 5 seconds before retrying
      ready = await isHasuraReady();
    }
  }

  $.verbose = true;

  if (local) {
    let HASURA_GRAPHQL_CONSOLE_PORT =
      Deno.env.get('HASURA_GRAPHQL_CONSOLE_PORT') || 8085;
    let HASURA_GRAPHQL_HGE_ENDPOINT =
      Deno.env.get('HASURA_GRAPHQL_HGE_ENDPOINT') || 'http://0.0.0.0:8081';
    let HASURA_GRAPHQL_ENDPOINT =
      Deno.env.get('HASURA_GRAPHQL_ENDPOINT') ||
      'http://host.docker.internal:8081';

    if (wait) {
      await waitForHasura();
      console.log('Hasura is ready');
    }

    await $`hasura console --endpoint ${HASURA_GRAPHQL_ENDPOINT} --no-browser --address 0.0.0.0 --console-port ${HASURA_GRAPHQL_CONSOLE_PORT} --console-hge-endpoint ${HASURA_GRAPHQL_HGE_ENDPOINT} --skip-update-check`;
  } else {
    let HASURA_GRAPHQL_ENDPOINT = Deno.env.get('HASURA_GRAPHQL_ENDPOINT');
    let HASURA_GRAPHQL_CONSOLE_PORT =
      Deno.env.get('HASURA_GRAPHQL_CONSOLE_PORT') || 9695;
    if (wait) {
      await waitForHasura();
      console.log('Hasura is ready');
    }
    await $`hasura console --endpoint ${HASURA_GRAPHQL_ENDPOINT} --no-browser --console-port ${HASURA_GRAPHQL_CONSOLE_PORT} --skip-update-check`;
  }
}

////////////////////////////////////////////////////////////////////////////////
// SQUASH MIGRATIONS
////////////////////////////////////////////////////////////////////////////////

export async function hasuraMigrateSquash(version: any, options: any) {
  const metaConfig = await fs.readJsonSync('meta.json');

  const { hasura: hasuraConfig } = metaConfig;

  const { state }: State = { ...hasuraConfigDefault, ...hasuraConfig };

  cd(`${currentPath}/${state}`);

  const HASURA_GRAPHQL_ENDPOINT = Deno.env.get('HASURA_GRAPHQL_ENDPOINT');

  $.verbose = true;
  await $`hasura migrate squash --endpoint ${HASURA_GRAPHQL_ENDPOINT} --from ${version} --database-name default`;
}

////////////////////////////////////////////////////////////////////////////////
// APPLY MIGRATIONS
////////////////////////////////////////////////////////////////////////////////

export async function hasuraMigrateApply(options: any) {
  const metaConfig = await fs.readJsonSync('meta.json');

  const { hasura: hasuraConfig } = metaConfig;

  const { state }: State = { ...hasuraConfigDefault, ...hasuraConfig };

  cd(`${currentPath}/${state}`);

  $.verbose = true;

  const { local } = options;
  const HASURA_GRAPHQL_ENDPOINT = Deno.env.get('HASURA_GRAPHQL_ENDPOINT');

  await $`hasura migrate apply --endpoint ${HASURA_GRAPHQL_ENDPOINT} --database-name default`;
}

////////////////////////////////////////////////////////////////////////////////
//  EXPORT SCHEMA
////////////////////////////////////////////////////////////////////////////////

export async function hasuraSchemaExportToLocal() {
  const HASURA_GRAPHQL_API_ENDPOINT = Deno.env.get(
    'HASURA_GRAPHQL_API_ENDPOINT'
  );
  const HASURA_GRAPHQL_ADMIN_SECRET = Deno.env.get(
    'HASURA_GRAPHQL_ADMIN_SECRET'
  );
  const SRC = Deno.env.get('SRC');

  await $`gq ${HASURA_GRAPHQL_API_ENDPOINT} -H "X-Hasura-Admin-Secret: ${HASURA_GRAPHQL_ADMIN_SECRET}" --introspect > ${SRC}/schema.graphql`;
}

////////////////////////////////////////////////////////////////////////////////
// METADATA APPLY
////////////////////////////////////////////////////////////////////////////////

export async function metaDataApply(component: any, options: any) {
  const metaConfig = await fs.readJsonSync('meta.json');

  const { hasura: hasuraConfig } = metaConfig;

  const { state }: State = { ...hasuraConfigDefault, ...hasuraConfig };

  cd(`${currentPath}/${state}`);

  $.verbose = true;

  const { local } = options;
  const HASURA_GRAPHQL_ENDPOINT = Deno.env.get('HASURA_GRAPHQL_ENDPOINT');

  await $`hasura metadata apply --endpoint ${HASURA_GRAPHQL_ENDPOINT}`;
}

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function hasura(program: any) {
  // config({ path: `${currentPath}/${envFilename}`, override: true });

  const hasura = program.command('hasura');
  hasura.description('perform hasura maintenances');

  const hasuraConsole = hasura.command('console');
  const hasuraMigrate = hasura.command('migrate');
  const hasuraMetadata = hasura.command('metadata');

  hasuraConsole
    .description('open hasura console locally ')
    .option('--local', 'use local hasura')
    .option('--wait', 'wait for the hasura to be ready')
    .action(hasuraOpenConsole);

  const migrateSquash = hasuraMigrate.command('squash');
  migrateSquash
    .description('squash all migrations')
    .argument('<version>', 'version to squash to')
    .option('--local', 'use local hasura')
    .action(hasuraMigrateSquash);

  const migrateApply = hasuraMigrate.command('apply');
  migrateApply
    .description('apply all migrations')
    .option('--local', 'use local hasura')
    .action(hasuraMigrateApply);

  const hasuraMetadataApply = hasuraMetadata.command('apply');
  hasuraMetadataApply
    .description('apply metadata')
    .option('--local', 'use local hasura')
    .action(metaDataApply);
}
