import { $, which, sleep, cd, fs } from 'zx';
import { detectScriptsDirectory } from '../utils/divers.mjs';

////////////////////////////////////////////////////////////////////////////////
// MUTE BY DEFAULT
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

////////////////////////////////////////////////////////////////////////////////
// TERRAFORM DEFAULT CONFIG
////////////////////////////////////////////////////////////////////////////////

const vaultConfigDefault = {};

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
// CONSTANTS
////////////////////////////////////////////////////////////////////////////////

const ENV = process.env.ENV;
const GCP_PROJECT_NAME = process.env.GCP_PROJECT_NAME;

////////////////////////////////////////////////////////////////////////////////
// UTILS
////////////////////////////////////////////////////////////////////////////////

async function defineSecretNamespace() {
  let { type, name } = metaConfig;

  let secretNamespace;

  switch (type) {
    case 'project': {
      secretNamespace = `${GCP_PROJECT_NAME}/admin/secrets`;
      break;
    }
    case 'app': {
      let { vault } = metaConfig;

      secretNamespace = `${GCP_PROJECT_NAME}/${ENV}/app/${name}/secrets`;

      break;
    }
    case 'cluster': {
      let { cluster } = metaConfig;
      let { app } = cluster;
      secretNamespace = `${GCP_PROJECT_NAME}/${ENV}/app/${app}/global/secrets`;
      break;
    }
    case 'cluster_app': {
      let { cluster } = metaConfig;
      let { app } = cluster;
      secretNamespace = `${GCP_PROJECT_NAME}/${ENV}/app/${app}/app/${name}/secrets`;
      break;
    }
    case 'group': {
      let { group } = metaConfig;
      let { app } = group;
      secretNamespace = `${GCP_PROJECT_NAME}/${ENV}/app/${app}/global/secrets`;
      break;
    }
    case 'group_app': {
      let { group } = metaConfig;
      let { app } = group;
      secretNamespace = `${GCP_PROJECT_NAME}/${ENV}/app/${app}/app/${name}/secrets`;
      break;
    }
    case 'db': {
      secretNamespace = `${GCP_PROJECT_NAME}/${ENV}/db/${name}/secrets`;
      break;
    }
    case 'rds': {
      secretNamespace = `${GCP_PROJECT_NAME}/${ENV}/rds/secrets`;
      break;
    }
    case 'vault': {
      secretNamespace = `${GCP_PROJECT_NAME}/${ENV}/vault/secrets`;
      break;
    }
    default: {
      console.log('No secret namespace defined');
      throw new Error('No secret namespace defined');
    }
  }

  $.verbose = true;

  return secretNamespace;
}

////////////////////////////////////////////////////////////////////////////////
// Import json file
////////////////////////////////////////////////////////////////////////////////

export async function vaultKvCertsToVault(data) {
  let { name, cluster } = metaConfig;
  let { app } = cluster;

  const secretPath = `${GCP_PROJECT_NAME}/${ENV}/app/${app}/app/${name}/certificats`;

  await $`vault kv put kv/${secretPath} CREDS=${data}`;
}

////////////////////////////////////////////////////////////////////////////////
// Import json file
////////////////////////////////////////////////////////////////////////////////

export async function vaultKvCertsToLocal(data) {
  let { name, cluster } = metaConfig;
  let { app } = cluster;

  const secretPath = `${GCP_PROJECT_NAME}/${ENV}/app/${app}/app/${name}/certificats`;

  const randomFilename = Math.floor(Math.random() * 1000000);

  await $`vault kv get -format=json kv/${secretPath}  > /tmp/env.${randomFilename}.json`;

  $.verbose = true;

  const credsValue = fs.readJSONSync(`/tmp/env.${randomFilename}.json`);

  const { CREDS } = credsValue.data;

  return CREDS;
}

////////////////////////////////////////////////////////////////////////////////
// Import .env FILE to remote vault
////////////////////////////////////////////////////////////////////////////////

export async function vaultKvLocalToVault() {
  const envFileRaw = await fs.readFileSync('.env', 'utf8');
  const secretPath = await defineSecretNamespace();

  $.verbose = true;
  await $`vault kv put kv/${secretPath} CREDS=${envFileRaw}`;
}

////////////////////////////////////////////////////////////////////////////////
// Export remote vault credentials to gke secret credentials
////////////////////////////////////////////////////////////////////////////////

export async function vaultKvVaultToGkeCredentials() {
  const secretPath = await defineSecretNamespace();

  const randomFilename = Math.floor(Math.random() * 1000000);

  await $`vault kv get -format=json kv/${secretPath}  > /tmp/env.${randomFilename}.json`;

  $.verbose = true;

  const credsValue = fs.readJSONSync(`/tmp/env.${randomFilename}.json`);

  const { CREDS } = credsValue.data;

  return CREDS;
}

////////////////////////////////////////////////////////////////////////////////
// Export remote vault credentials to .env file
////////////////////////////////////////////////////////////////////////////////

export async function vaultKvVaultToLocal() {
  const secretPath = await defineSecretNamespace();

  // generate a random integer number

  const randomFilename = Math.floor(Math.random() * 1000000);

  await $`vault kv get -format=json kv/${secretPath}  > /tmp/env.${randomFilename}.json`;

  const credsValue = await fs.readJSONSync(`/tmp/env.${randomFilename}.json`);

  const { CREDS } = credsValue.data;

  // if .env file exists, create a backup
  if (await fs.existsSync('.env')) {
    await fs.copyFileSync('.env', '.env.backup');
  }

  await fs.writeFileSync('.env', CREDS, 'utf8');
}

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

// commands
// create/update a vault secret
// actions

export default async function vault(program) {
  const vault = program.command('vault');
  vault.description('manage project secrets');
  const vaultKv = vault.command('kv');
  vaultKv.description('manage key-value pairs');

  const vaultKvImport = vaultKv.command('import');
  const vaultKvExport = vaultKv.command('export');

  vaultKvImport
    .description('from .env to remote vault')
    .action(vaultKvLocalToVault);

  vaultKvExport
    .description('from remote vault to .env')
    .action(vaultKvVaultToLocal);
}
