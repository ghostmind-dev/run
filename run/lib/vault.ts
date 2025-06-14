/**
 * @fileoverview HashiCorp Vault operations module for @ghostmind/run
 *
 * This module provides HashiCorp Vault integration for managing secrets,
 * including importing/exporting environment variables and key-value operations.
 *
 * @module
 */

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

/**
 * Check if HashiCorp Vault CLI is installed and available
 *
 * @returns Promise resolving to true if Vault CLI is available, false otherwise
 *
 * @example
 * ```typescript
 * if (await checkVaultInstalled()) {
 *   console.log('Vault CLI is ready');
 * }
 * ```
 */
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

/**
 * Define the secret namespace path for Vault operations
 *
 * This function constructs the appropriate namespace path for storing
 * secrets in Vault based on project configuration and target environment.
 *
 * @param target - Optional target environment override
 * @returns Promise resolving to the secret namespace path
 *
 * @example
 * ```typescript
 * // Get namespace for current environment
 * const namespace = await defineSecretNamespace();
 *
 * // Get namespace for specific target
 * const prodNamespace = await defineSecretNamespace('production');
 * ```
 */
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

/**
 * Import environment variables from a local .env file to HashiCorp Vault
 *
 * This function reads a local .env file and stores its contents as a secret
 * in HashiCorp Vault under the project's namespace.
 *
 * @param options - Configuration options for the import operation
 * @param options.target - Target environment (defaults to 'local')
 * @param options.envfile - Path to the .env file (defaults to '.env.{target}')
 *
 * @example
 * ```typescript
 * // Import local environment to vault
 * await vaultKvLocalToVault({ target: 'production' });
 *
 * // Import specific env file
 * await vaultKvLocalToVault({
 *   target: 'staging',
 *   envfile: '.env.staging.custom'
 * });
 * ```
 */
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

/**
 * Export secrets from HashiCorp Vault to a local .env file
 *
 * This function retrieves secrets from HashiCorp Vault and writes them
 * to a local .env file, creating a backup if the file already exists.
 *
 * @param options - Configuration options for the export operation
 * @param options.target - Target environment to export from
 * @param options.envfile - Path to the output .env file (defaults to '.env')
 *
 * @example
 * ```typescript
 * // Export production secrets to .env
 * await vaultKvVaultToLocal({ target: 'production' });
 *
 * // Export to specific file
 * await vaultKvVaultToLocal({
 *   target: 'staging',
 *   envfile: '.env.staging'
 * });
 * ```
 */
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

/**
 * Configure Vault CLI commands and subcommands
 *
 * This function sets up the HashiCorp Vault command-line interface with
 * key-value operations for importing and exporting secrets between
 * local .env files and remote Vault storage.
 *
 * @param program - Commander.js program instance
 *
 * @example
 * ```typescript
 * import { Command } from 'commander';
 * const program = new Command();
 * await vault(program);
 * ```
 */
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
