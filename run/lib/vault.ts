import { $, which, sleep, cd, fs } from 'npm:zx';
import {
  detectScriptsDirectory,
  recursiveDirectoriesDiscovery,
  verifyIfMetaJsonExists,
} from '../utils/divers.ts';

import { setEnvOnLocal } from '../utils/divers.ts';

////////////////////////////////////////////////////////////////////////////////
// MUTE BY DEFAULT
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

////////////////////////////////////////////////////////////////////////////////
// TYPE
////////////////////////////////////////////////////////////////////////////////

const fsZX: any = fs;

////////////////////////////////////////////////////////////////////////////////
// TERRAFORM DEFAULT CONFIG
////////////////////////////////////////////////////////////////////////////////

const vaultConfigDefault = {};

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
// UTILS
////////////////////////////////////////////////////////////////////////////////

async function defineSecretNamespace(target?: string) {
  let currentPath = await detectScriptsDirectory(Deno.cwd());
  cd(currentPath);
  let metaConfig = await fs.readJsonSync('meta.json');
  let { id, global } = metaConfig;
  let secretNamespace;
  if (target) {
    secretNamespace = `${id}/${target}`;
  } else if (global === 'true') {
    secretNamespace = `${id}/global`;
  } else {
    const ENV = Deno.env.get('ENV');
    secretNamespace = `${id}/${ENV}`;
  }
  $.verbose = true;
  return secretNamespace;
}

////////////////////////////////////////////////////////////////////////////////
// Import .env FILE to remote vault
////////////////////////////////////////////////////////////////////////////////

export async function vaultKvLocalToVault(options: any) {
  const { target, envfile } = options;

  let envfilePath = '';

  const targetSet = target !== undefined ? target : 'local';

  if (envfile) {
    envfilePath = envfile;
  } else {
    envfilePath = `.env.${targetSet}`;
  }

  const envFileRaw = await fsZX.readFileSync(envfilePath, 'utf8');

  let secretPath = await defineSecretNamespace();

  secretPath = `${secretPath}/secrets`;

  $.verbose = true;

  await $`vault kv put kv/${secretPath} CREDS=${envFileRaw}`;
}

////////////////////////////////////////////////////////////////////////////////
// Export remote vault credentials to .env file
////////////////////////////////////////////////////////////////////////////////

export async function vaultKvVaultToLocalUnit({
  currentPathNew,
  options = {},
}: any) {
  let currentPath = await detectScriptsDirectory(Deno.cwd());

  if (currentPathNew !== undefined) {
    currentPath = currentPathNew;
  }

  cd(currentPath);

  let metaConfig = await fs.readJsonSync('meta.json');

  const { target, envfile } = options;

  let secretPath;

  if (target === undefined) {
    secretPath = await defineSecretNamespace();
  } else {
    secretPath = await defineSecretNamespace(target);
  }

  // generate a random integer number

  const randomFilename = Math.floor(Math.random() * 1000000);

  secretPath = `${secretPath}/secrets`;

  await $`vault kv get -format=json kv/${secretPath}  > /tmp/env.${randomFilename}.json`;

  const credsValue = await fs.readJSONSync(`/tmp/env.${randomFilename}.json`);

  const { CREDS } = credsValue.data.data;

  // if .env file exists, create a backup

  if (envfile) {
    fs.writeFileSync(envfile, CREDS, 'utf8');
  } else {
    fs.writeFileSync('.env', CREDS, 'utf8');
    if (fs.existsSync('.env.backup')) {
      fs.unlinkSync('.env.backup');
    }
  }
}

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

// commands
// create/update a vault secret
// actions

export default async function vault(program: any) {
  const vault = program.command('vault');

  vault.description('manage project secrets');
  const vaultKv = vault.command('kv');
  vaultKv.description('manage key-value pairs');

  const vaultKvImport = vaultKv.command('import');
  const vaultKvExport = vaultKv.command('export');

  vaultKvImport
    .description('from .env to remote vault')
    .action(vaultKvLocalToVault)
    .option('--envfile <path>', 'path to .env file')
    .option('--target <environment>', 'environment target');

  vaultKvExport
    .description('from remote vault to .env')
    .option('--envfile <path>', 'path to .env file')
    .option('--target <environment>', 'environment target')
    .action(vaultKvVaultToLocalUnit);
}
