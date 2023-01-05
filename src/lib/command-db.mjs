import { $, which, sleep, cd, fs } from 'zx';
import core from '@actions/core';
import { Storage } from '@google-cloud/storage';
import {
  detectScriptsDirectory,
  verifyIfMetaJsonExists,
} from '../utils/divers.mjs';

////////////////////////////////////////////////////////////////////////////////
// MUTE BY DEFAULT
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

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
// CONSTANTS
////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////
// postgresql
////////////////////////////////////////////////////////////////////////////////

export async function exportPostgresql(options) {
  let ENV = process.env.ENV;

  $.verbose = true;

  const PGDATABASE = process.env.PGDATABASE;
  const RUN_RUN_SERVICE_ACCOUNT_PATH = process.env.RUN_RUN_SERVICE_ACCOUNT_PATH;
  const GCP_PROJECT_NAME = process.env.GCP_PROJECT_NAME;

  const storage = new Storage({ keyFilename: RUN_RUN_SERVICE_ACCOUNT_PATH });

  const modifiers = {
    prefix: `db/${ENV}/${PGDATABASE}`,
  };

  const [files] = await storage
    .bucket(`bucket-${GCP_PROJECT_NAME}`)
    .getFiles(modifiers);

  // verify if array has an element with the same name

  const fileExists = files.some((file) =>
    file.metadata.name.includes('db.sql')
  );

  const { local } = options;

  await $`pg_dump ${PGDATABASE} > /tmp/db.sql`;

  if (local) return true;

  $.verbose = false;

  const CURRENT_TIME_IN_MS = await $`date +%s%N | cut -b1-13`;

  // remove /n from the end of the string
  const CURRENT_TIME_IN_MS_STR = CURRENT_TIME_IN_MS.stdout.replace(
    /(\r)/gm,
    ''
  );

  $.verbose = true;

  const dbAddress = `gs://bucket-${GCP_PROJECT_NAME}/db/${ENV}/${PGDATABASE}/db.sql`;
  const dbAddressBackup = `gs://bucket-${GCP_PROJECT_NAME}/db/${ENV}/${PGDATABASE}/backup/db.${CURRENT_TIME_IN_MS_STR}.sql`;

  // verify if dbAddress exists

  if (fileExists) {
    await $`gsutil cp -r ${dbAddress} ${dbAddressBackup}`;
  }

  await $`gsutil cp -J /tmp/db.sql gs://bucket-${GCP_PROJECT_NAME}/db/${ENV}/${PGDATABASE}/`;

  await $`rm /tmp/db.sql`;
}

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function db(program) {
  const db = program.command('db');
  db.description('database management');

  const dbPostgresql = db
    .command('postgres')
    .description('manage postgresql db');

  const dbHasura = db
    .command('hasura')
    .description('manage hasura metadata and migrations');

  dbHasura
    .command('console')
    .description('open hasura console')
    .action(`run hasura console`);

  const dbPostgresqlExport = dbPostgresql
    .command('backup')
    .option('--local', 'export to local')
    .description('export postgresql db')
    .action(exportPostgresql);
}
