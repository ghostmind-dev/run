import { $, which, sleep, cd, fs } from 'zx';
import {
  detectScriptsDirectory,
  recursiveDirectoriesDiscovery,
  verifyIfMetaJsonExists,
  environmentSafeguard,
} from '../utils/divers.mjs';

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
// CURRENT METADATA
////////////////////////////////////////////////////////////////////////////////

let metaConfig = await verifyIfMetaJsonExists(currentPath);

////////////////////////////////////////////////////////////////////////////////
// UTILS
////////////////////////////////////////////////////////////////////////////////

async function defineSecretNamespace() {
  const ENV = process.env.ENV;
  let currentPath = await detectScriptsDirectory(process.cwd());
  cd(currentPath);
  let metaConfig = await fs.readJsonSync('meta.json');
  let { id, scope } = metaConfig;
  let secretNamespace;
  if (scope === 'global') {
    secretNamespace = `${id}/global`;
  } else {
    let environment;
    if (ENV === 'main') {
      environment = 'prod';
    } else if (ENV === 'preview') {
      environment = 'preview';
    } else {
      environment = 'dev';
    }

    secretNamespace = `${id}/${environment}`;
  }
  $.verbose = true;
  return secretNamespace;
}

////////////////////////////////////////////////////////////////////////////////
// Import json file
////////////////////////////////////////////////////////////////////////////////

export async function vaultKvCertsToVault(data, directoryPath) {
  if (directoryPath !== undefined) {
    metaConfig = await verifyIfMetaJsonExists(directoryPath);
  }

  let secretPath = await defineSecretNamespace();

  secretPath = `${secretPath}/certificats`;

  await $`vault kv put kv/${secretPath} CREDS=${data}`;
}

////////////////////////////////////////////////////////////////////////////////
// Import json file
////////////////////////////////////////////////////////////////////////////////

export async function vaultKvCertsToLocal(data) {
  let secretPath = await defineSecretNamespace();

  secretPath = `${secretPath}/certificats`;

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
  let secretPath = await defineSecretNamespace();

  secretPath = `${secretPath}/secrets`;

  $.verbose = true;
  await $`vault kv put kv/${secretPath} CREDS=${envFileRaw}`;
}

////////////////////////////////////////////////////////////////////////////////
// Export remote vault credentials to gke secret credentials
////////////////////////////////////////////////////////////////////////////////

export async function vaultKvVaultToGkeCredentials() {
  let secretPath = await defineSecretNamespace();

  secretPath = `${secretPath}/secrets`;

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

export async function vaultKvVaultToLocalEntry(options) {
  const { all } = options;

  if (all) {
    await vaultKvVaultToLocalAll();
  } else {
    await vaultKvVaultToLocalUnit();
  }
}

////////////////////////////////////////////////////////////////////////////////
// Export all proeject vault secrets to .env file
////////////////////////////////////////////////////////////////////////////////

export async function vaultKvVaultToLocalAll() {
  let metaConfig = await fs.readJsonSync('meta.json');
  let allDirectories = await recursiveDirectoriesDiscovery(
    `${process.env.SRC}`
  );

  allDirectories.push(`${process.env.SRC}`);

  for (let directory of allDirectories) {
    const meta = await verifyIfMetaJsonExists(directory);

    if (meta.secrets) {
      metaConfig = meta;
      currentPath = directory;
      sleep(2000);
      await vaultKvVaultToLocalUnit(currentPath);
    }
  }
}

////////////////////////////////////////////////////////////////////////////////
// Export remote vault credentials to .env file
////////////////////////////////////////////////////////////////////////////////

export async function vaultKvVaultToLocalUnit(currentPathNew) {
  let currentPath = await detectScriptsDirectory(process.cwd());

  if (currentPathNew !== undefined) {
    currentPath = currentPathNew;
  }

  cd(currentPath);

  let metaConfig = await fs.readJsonSync('meta.json');

  let { vault } = metaConfig;

  if (vault !== undefined) {
    let { ignoreEnv } = vault;
    if (ignoreEnv) {
      const environment = process.env.ENV;

      // verify if environment is included in ignoreEnv array
      if (ignoreEnv.includes(environment)) {
        return;
      }
    }
  }

  let secretPath = await defineSecretNamespace();

  secretPath = `${secretPath}/secrets`;

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
    .option('--all', 'export all project secrets')
    .action(vaultKvVaultToLocalEntry);
}
