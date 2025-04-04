import { $, cd } from 'npm:zx@8.1.0';
import { verifyIfMetaJsonExists } from '../utils/divers.ts';
import fs from 'npm:fs-extra@11.2.0';

////////////////////////////////////////////////////////////////////////////////
// MUTE BY DEFAULT
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

////////////////////////////////////////////////////////////////////////////////
// RUNNING COMMAND LOCATION
////////////////////////////////////////////////////////////////////////////////

let currentPath = Deno.cwd();

cd(currentPath);

////////////////////////////////////////////////////////////////////////////////
// UTILS
////////////////////////////////////////////////////////////////////////////////

async function checkVaultInstalled() {
  try {
    $.verbose = false;
    await $`vault -v`;
    return true;
  } catch (e) {
    console.error(
      'Error: Vault CLI is not installed. Please install HashiCorp Vault first.'
    );
    return false;
  }
}

async function defineSecretNamespace(target?: string) {
  let currentPath = Deno.cwd();
  cd(currentPath);
  let metaConfig = await verifyIfMetaJsonExists(currentPath);

  if (metaConfig === undefined) {
    return;
  }
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
  if (!(await checkVaultInstalled())) {
    return;
  }

  const { target, envfile } = options;

  let envfilePath = '';

  const targetSet = target !== undefined ? target : 'local';

  if (envfile) {
    envfilePath = envfile;
  } else {
    envfilePath = `.env.${targetSet}`;
  }

  // try to read the file

  $.verbose = false;

  try {
    await fs.access(envfilePath);
  } catch (e) {
    console.error(`File ${envfilePath} not found`);
    return;
  }

  const envFileRaw = await fs.readFileSync(envfilePath, 'utf8');

  let secretPath = await defineSecretNamespace(targetSet);

  secretPath = `${secretPath}/secrets`;

  $.verbose = true;

  await $`vault kv put kv/${secretPath} CREDS=${envFileRaw}`;
}

////////////////////////////////////////////////////////////////////////////////
// Export remote vault credentials to .env file
////////////////////////////////////////////////////////////////////////////////

export async function vaultKvVaultToLocal(options: any) {
  if (!(await checkVaultInstalled())) {
    return;
  }

  let currentPath = Deno.cwd();

  cd(currentPath);

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
    .action(vaultKvVaultToLocal);
}
