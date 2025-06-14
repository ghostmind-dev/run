/**
 * @fileoverview Utility functions module for @ghostmind/run
 *
 * This module provides common utility functions for project configuration,
 * environment management, file operations, and meta.json handling.
 *
 * @module
 */

import { $, chalk } from 'npm:zx@8.1.0';
import { config } from 'npm:dotenv@16.4.5';
import { expand } from 'npm:dotenv-expand@11.0.6';
import fs from 'npm:fs-extra@11.2.0';
import { nanoid } from 'npm:nanoid@5.0.7';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { parse as parseJsonWithComments } from 'npm:comment-json@4.2.3';

////////////////////////////////////////////////////////////////////////////////
// INTERFACES
////////////////////////////////////////////////////////////////////////////////

/**
 * Base interface for meta.json configuration
 */
export interface MetaJsonBase {
  /** Unique identifier for the project */
  id: string;
  /** Type of the project (e.g., 'application', 'library') */
  type: string;
  /** Name of the project */
  name: string;
}

/**
 * Extended meta.json configuration with additional properties
 */
export interface MetaJson extends MetaJsonBase {
  /** Additional configuration properties */
  [key: string]: any;
}

////////////////////////////////////////////////////////////////////////////////
// CREATE A SHORT UUID
////////////////////////////////////////////////////////////////////////////////

/**
 * Generate a short UUID using nanoid
 *
 * @param length - The length of the UUID to generate (default: 12)
 * @returns A promise that resolves to a random UUID string
 *
 * @example
 * ```typescript
 * const shortId = await createUUID(8);
 * console.log(shortId); // e.g., "V1StGXR8"
 * ```
 */
export async function createUUID(length: number = 12): Promise<string> {
  const id = nanoid(length);

  return id;
}

////////////////////////////////////////////////////////////////////////////////
// GET APP NAME
////////////////////////////////////////////////////////////////////////////////

/**
 * Get the application name from the meta.json configuration
 *
 * @returns A promise that resolves to the application name
 *
 * @example
 * ```typescript
 * const appName = await getAppName();
 * console.log(appName); // e.g., "my-awesome-app"
 * ```
 */
export async function getAppName(): Promise<string> {
  const currentPath = Deno.cwd();
  const { name }: any = await verifyIfMetaJsonExists(
    Deno.env.get(currentPath) || currentPath
  );

  return name;
}

////////////////////////////////////////////////////////////////////////////////
// GET PROJECT NAME
////////////////////////////////////////////////////////////////////////////////

/**
 * Get the project name from the meta.json configuration
 *
 * This function retrieves the project name from the meta.json file located
 * in the SRC environment variable path or current working directory.
 *
 * @returns A promise that resolves to the project name
 *
 * @example
 * ```typescript
 * const projectName = await getProjectName();
 * console.log(projectName); // e.g., "my-awesome-project"
 * ```
 */
export async function getProjectName(): Promise<string> {
  const currentPath = await Deno.cwd();
  const { name }: any = await verifyIfMetaJsonExists(
    Deno.env.get('SRC') || currentPath
  );

  return name;
}

////////////////////////////////////////////////////////////////////////////////
// SET ENVIRONMENT .ENV VARIABLES
////////////////////////////////////////////////////////////////////////////////

/**
 * Load and set environment variables from .env files
 *
 * This function loads environment variables from target-specific .env files,
 * merges them with base configurations, and sets up Terraform variables.
 *
 * @param target - The target environment (e.g., 'local', 'dev', 'prod')
 *
 * @example
 * ```typescript
 * // Load local environment variables
 * await setSecretsOnLocal('local');
 *
 * // Load production environment variables
 * await setSecretsOnLocal('prod');
 * ```
 */
export async function setSecretsOnLocal(target: string): Promise<void> {
  $.verbose = false;

  const currentPath = Deno.cwd();

  const metaConfig = await verifyIfMetaJsonExists(currentPath);

  expand(
    config({ path: `${Deno.env.get('HOME')}/.zprofile`, override: false })
  );

  if (metaConfig === undefined) {
    return;
  }

  const APP_NAME = await getAppName();

  const { secrets, port } = metaConfig;
  // create a random file nunber
  const randomFileNumber = await createUUID(12);
  let env_file = `/tmp/.env.${randomFileNumber}.${APP_NAME}`;
  if (secrets?.base) {
    let base_file = `${currentPath}/.env.${secrets.base}`;
    let target_file = `${currentPath}/.env.${target}`;
    try {
      await fs.access(target_file, fs.constants.R_OK);
    } catch (err) {
      return;
    }

    try {
      await fs.access(base_file, fs.constants.R_OK);
    } catch (err) {
      console.log(chalk.red(`The file .env.${base_file} does not exist`));
      return;
    }

    // merge base and target files in /tmp/.env.APP_NAME

    await $`rm -rf /tmp/.env.${randomFileNumber}.${APP_NAME}`;
    await $`cat ${base_file} ${target_file} > /tmp/.env.${randomFileNumber}.${APP_NAME}`;
  } else {
    let target_file = `${currentPath}/.env.${target}`;

    await $`rm -rf /tmp/.env.${randomFileNumber}.${APP_NAME}`;
    try {
      await fs.access(target_file, fs.constants.R_OK);
    } catch (err) {
      return;
    }
    // Read the .env file
    await $`cp ${target_file} /tmp/.env.${randomFileNumber}.${APP_NAME}`;
  }
  //
  // // Read the .env file
  const content: any = readFileSync(env_file, 'utf-8');
  const nonTfVarNames: any = content.match(/^(?!TF_VAR_)[A-Z_]+(?==)/gm);
  // Extract all variable names that don't start with TF_VAR
  // remove element TF_VAR_PORT
  // verify if PORT is in the nonTfVarNames array
  let prefixedVars = nonTfVarNames
    .map((varName: any) => {
      const value = content.match(new RegExp(`^${varName}=(.*)$`, 'm'))[1];
      return `TF_VAR_${varName}=${value}`;
    })
    .join('\n');
  const projectHasBeenDefined = prefixedVars.match(/^TF_VAR_PROJECT=(.*)$/m);
  const appNameHasBeenDefined = prefixedVars.match(/^TF_VAR_APP=(.*)$/m);
  const portHasBeenDefined = prefixedVars.match(/^TF_VAR_PORT=(.*)$/m);
  const gcpProjectIdhAsBeenDefined = prefixedVars.match(
    /^TF_VAR_GCP_PROJECT_ID=(.*)$/m
  );
  if (!projectHasBeenDefined) {
    const SRC = Deno.env.get('SRC') || '';
    const metaConfig = await verifyIfMetaJsonExists(SRC);
    let name = '';
    if (metaConfig) {
      name = metaConfig.name;
    }
    // add the project name to the .env file
    const PROJECT = await getProjectName();
    Deno.env.set('PROJECT', PROJECT);
    prefixedVars += `\nTF_VAR_PROJECT=${name}`;
  }
  if (!appNameHasBeenDefined) {
    const metaConfig = await verifyIfMetaJsonExists(currentPath);
    let name = '';
    if (metaConfig) {
      name = metaConfig.name;
    }
    const APP = await getAppName();
    Deno.env.set('APP', APP);
    prefixedVars += `\nTF_VAR_APP=${name}`;
  }
  if (!gcpProjectIdhAsBeenDefined) {
    const GCP_PROJECT_ID = Deno.env.get('GCP_PROJECT_ID') || '';
    prefixedVars += `\nTF_VAR_GCP_PROJECT_ID=${GCP_PROJECT_ID}`;
  }
  if (!portHasBeenDefined) {
    if (port) {
      const PORT = port;
      Deno.env.set('PORT', `${PORT}`);
      prefixedVars += `\nTF_VAR_PORT=${PORT}`;
    }
  }
  await $`rm -rf /tmp/.env.${randomFileNumber}.${APP_NAME}`;
  await $`rm -rf /tmp/.env.${target}.${APP_NAME}`;
  await $`rm -rf /tmp/.env.current.${APP_NAME}`;

  // write content to /tmp/.env.APP_NAME and addd prefixedVars at the end
  await fs.writeFile(
    `/tmp/.env.${target}.${APP_NAME}`,
    `${content}\n${prefixedVars}`
  );
  const newExpandedEnvVar = expand(
    config({
      path: `/tmp/.env.${target}.${APP_NAME}`,
      override: true,
    })
  );

  // wrtie the new expanded env var to the /tmp/.env.${target}.${APP} file
  // newExpandedEnvVar is an object so we need to convert it to a string

  let envVarString = '';

  for (let key in newExpandedEnvVar.parsed) {
    envVarString += `${key}=${newExpandedEnvVar.parsed[key]}\n`;
  }

  await fs.writeFile(`/tmp/.env.${target}.${APP_NAME}`, envVarString);
  await $`cp /tmp/.env.${target}.${APP_NAME} /tmp/.env.current.${APP_NAME}`;

  expand(
    config({ path: `${Deno.env.get('HOME')}/.zprofile`, override: false })
  );
  return;
}

////////////////////////////////////////////////////////////////////////////////
// GET FILES IN A DIRECTORY
////////////////////////////////////////////////////////////////////////////////

/**
 * Get all files in a directory with filtering
 *
 * This function returns a list of files in the specified directory,
 * excluding common files like .DS_Store, .env files, and directories.
 *
 * @param path - The directory path to scan
 * @returns A promise that resolves to an array of file names
 *
 * @example
 * ```typescript
 * const files = await getFilesInDirectory('./src');
 * console.log(files); // ['index.ts', 'utils.ts', 'config.json']
 * ```
 */
export async function getFilesInDirectory(path: string): Promise<string[]> {
  const filesInFolder: any = await fs.readdir(path, {
    withFileTypes: true,
  });

  let files = [];

  const defaultFilesToIgnore = [
    '.DS_Store',
    '.terraform.lock.hcl',
    '.env',
    '.env.local',
    '.env.development',
    '.env.test',
    '.env.production',
    '.env.backup',
    '.git',
    '.terraform',
  ];

  const defaultExtensionsToIgnore = ['DS_Store'];

  for (const file of filesInFolder) {
    if (file.isDirectory()) {
      continue;
    }

    if (defaultFilesToIgnore.includes(file.name)) {
      continue;
    }

    if (defaultExtensionsToIgnore.includes(file.name.split('.').pop())) {
      continue;
    }

    files.push(file.name);
  }

  return files;
}

////////////////////////////////////////////////////////////////////////////////
// RETURN ALL THE DIRECTORIES IN A PATH
////////////////////////////////////////////////////////////////////////////////

/**
 * Get all directories in a path with filtering
 *
 * This function returns a list of directories in the specified path,
 * excluding common directories like node_modules, .git, .terraform, and hidden folders.
 *
 * @param path - The directory path to scan
 * @returns A promise that resolves to an array of directory names
 *
 * @example
 * ```typescript
 * const dirs = await getDirectories('./project');
 * console.log(dirs); // ['src', 'lib', 'tests']
 * ```
 */
export async function getDirectories(path: string): Promise<string[]> {
  const directoriesWithFiles = await fs.readdir(`${path}`, {
    withFileTypes: true,
  });

  const directories = directoriesWithFiles
    .filter((dirent: any) => dirent.isDirectory())
    .filter((dirent: any) => dirent.name !== 'node_modules')
    .filter((dirent: any) => dirent.name !== '.next')
    .filter((dirent: any) => dirent.name !== '.git')
    .filter((dirent: any) => dirent.name !== '.terraform')
    // filter any folder that starts with a dot
    .filter((dirent: any) => !dirent.name.startsWith('.'))
    .map((dirent: any) => dirent.name);

  return directories;
}

////////////////////////////////////////////////////////////////////////////////
// DISCOVER ALL THE DIRECTORIES PATH  IN THE PROJECT (RECURSIVE)
////////////////////////////////////////////////////////////////////////////////

/**
 * Recursively discover all directory paths in a project
 *
 * This function performs a recursive search to find all directories
 * within the specified path, returning their full paths.
 *
 * @param path - The root path to start the recursive search
 * @returns A promise that resolves to an array of directory paths
 *
 * @example
 * ```typescript
 * const allDirs = await recursiveDirectoriesDiscovery('./project');
 * console.log(allDirs); // ['./project/src', './project/src/utils', './project/lib']
 * ```
 */
export async function recursiveDirectoriesDiscovery(
  path: string
): Promise<string[]> {
  const directories = await getDirectories(path);

  let directoriesPath: string[] = [];

  for (let directory of directories) {
    directoriesPath.push(`${path}/${directory}`);
    directoriesPath = directoriesPath.concat(
      await recursiveDirectoriesDiscovery(`${path}/${directory}`)
    );
  }

  return directoriesPath;
}

////////////////////////////////////////////////////////////////////////////////
// FIND PROJECT DIRECTORY
////////////////////////////////////////////////////////////////////////////////

/**
 * Find the project directory by traversing up the directory tree
 *
 * This function searches for a meta.json file with type 'project' by
 * traversing up the directory tree from the given path.
 *
 * @param path - The starting path to search from
 * @returns A promise that resolves to the project directory path or undefined
 *
 * @example
 * ```typescript
 * const projectDir = await findProjectDirectory('./src/components');
 * if (projectDir) {
 *   console.log(`Found project at: ${projectDir}`);
 * }
 * ```
 */
export async function findProjectDirectory(
  path: string
): Promise<string | undefined> {
  let currentPath = path;

  while (currentPath !== '/') {
    const metaConfig = await verifyIfMetaJsonExists(currentPath);
    if (metaConfig && metaConfig.type === 'project') {
      return currentPath;
    }
    currentPath = currentPath.substring(0, currentPath.lastIndexOf('/'));
  }

  return undefined;
}

////////////////////////////////////////////////////////////////////////////////
// GET META.JSON UPDATED
////////////////////////////////////////////////////////////////////////////////

/**
 * Verify if meta.json exists and load its configuration
 *
 * This function checks for the existence of a meta.json file in the specified path
 * and loads its configuration with environment variable substitution.
 *
 * @param path - The path to search for meta.json
 * @returns A promise that resolves to the meta.json configuration or undefined
 *
 * @example
 * ```typescript
 * const config = await verifyIfMetaJsonExists('/path/to/project');
 * if (config) {
 *   console.log(`Project: ${config.name}`);
 * }
 * ```
 */
export async function verifyIfMetaJsonExists(
  path: string
): Promise<MetaJson | undefined> {
  try {
    await fs.access(`${path}/meta.json`);
    const fileContent = readFileSync(`${path}/meta.json`, 'utf8');
    let metaconfig = parseJsonWithComments(fileContent);

    // replace the field that containers ${} with the value of the field

    // {
    //   id: "ic9ETB7juz3g",
    //   type: "project",
    //   name: "run",
    //   schema: { structure: "${VARIABLE}" }
    // }

    // iterate overt the json
    // if the property value is a string and it includes ${ANYTHING} pattern
    // replace the value with Deno.env.get('ANYTHING')
    // if the property value is an object, iterate over the object and do the same

    const replaceEnvVariables = (obj: any) => {
      let updatedMetaConfig = obj;

      for (let key in obj) {
        if (typeof updatedMetaConfig[key] === 'string') {
          const matches = updatedMetaConfig[key].match(/\${(.*?)}/g);

          if (matches) {
            for (let match of matches) {
              const envVariable = match.replace('${', '').replace('}', '');

              // ignore if if match ${this.whatver}

              if (!envVariable.includes('this.')) {
                updatedMetaConfig[key] = updatedMetaConfig[key].replace(
                  match,
                  Deno.env.get(envVariable)
                );
              }
            }
          }
        } else if (typeof obj[key] === 'object') {
          replaceEnvVariables(obj[key]);
        }
      }

      return updatedMetaConfig;
    };

    const envReplacedUpdatedConfig = replaceEnvVariables(metaconfig);

    // replace the field that containers ${this.} with the value of the field

    type AnyObject = { [key: string]: any };

    const getProperty = (object: AnyObject, path: string) => {
      return path
        .split('.')
        .reduce(
          (acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined),
          object
        );
    };

    const updatedMetaConfigAction = (obj: MetaJson): MetaJson => {
      const resolveTemplateString = (
        value: string,
        context: AnyObject
      ): string => {
        return value.replace(/\${this\.(.*?)}/g, (_: any, path: any): any => {
          const resolvedValue = getProperty(context, path);
          return resolvedValue !== undefined ? resolvedValue : '';
        });
      };

      const updateProperties = (object: MetaJson, context: AnyObject) => {
        for (let key in object) {
          if (typeof object[key] === 'string') {
            const matches = object[key].match(/\${this\.(.*?)}/g);
            if (matches) {
              object[key] = resolveTemplateString(object[key], context);
            }
          } else if (typeof object[key] === 'object') {
            updateProperties(object[key], context);
          }
        }
      };

      let updatedMetaConfig = { ...obj };
      updateProperties(updatedMetaConfig, updatedMetaConfig);
      return updatedMetaConfig;
    };

    return updatedMetaConfigAction(envReplacedUpdatedConfig);
  } catch (error) {
    return undefined;
  }
}

////////////////////////////////////////////////////////////////////////////////
// RETURN ALL FOLDER PATH THAT MATCHES THE META.JSON FILE CONDITION
// document this function
// @param {string} property - the property to match
// @param {string} value - the value to match (optional)
// return {array} - an array of path that matches the condition
////////////////////////////////////////////////////////////////////////////////

/**
 * Find directories with meta.json files matching specific criteria
 *
 * This function searches for directories containing meta.json files that
 * match the specified property and optional value criteria.
 *
 * @param options - Search criteria options
 * @param options.property - The property to match (supports dot notation)
 * @param options.value - The value to match (optional, matches existence if undefined)
 * @param options.path - The root path to search (defaults to SRC environment variable)
 * @returns A promise that resolves to an array of matching directory paths
 *
 * @example
 * ```typescript
 * // Find all directories with docker configuration
 * const dockerDirs = await withMetaMatching({ property: 'docker' });
 *
 * // Find directories with specific type
 * const appDirs = await withMetaMatching({
 *   property: 'type',
 *   value: 'application'
 * });
 *
 * // Find directories with nested property
 * const tunnelDirs = await withMetaMatching({
 *   property: 'tunnel.default.hostname'
 * });
 * ```
 */
export async function withMetaMatching({
  property,
  value,
  path,
}: any): Promise<any[]> {
  let directoryEntryPath = path || Deno.env.get('SRC');

  const allDirectories = await recursiveDirectoriesDiscovery(
    directoryEntryPath
  );

  let directories = [];

  allDirectories.push(directoryEntryPath);

  for (let directory of allDirectories) {
    const metaConfig = await verifyIfMetaJsonExists(directory);

    if (metaConfig) {
      let metaConfigProperty;

      if (property.includes('.')) {
        const propertyArray = property.split('.');
        metaConfigProperty = metaConfig;
        for (let propertyComponent of propertyArray) {
          metaConfigProperty = metaConfigProperty[propertyComponent];
          if (metaConfigProperty === undefined) {
            break;
          }
        }
      } else {
        metaConfigProperty = metaConfig[property];
      }

      if (value === undefined && metaConfigProperty) {
        directories.push(directory);
      } else if (metaConfigProperty === value && metaConfigProperty) {
        directories.push(directory);
      }
    }
  }

  return directories;
}

////////////////////////////////////////////////////////////////////////////////
// ENCRYPT A STRING
////////////////////////////////////////////////////////////////////////////////

/**
 * Encrypt a string using AES encryption
 *
 * This function encrypts a text string using AES-256-CBC encryption
 * with a provided crypto key and returns the encrypted result.
 *
 * @param text - The text to encrypt
 * @param cryptoKey - The encryption key
 * @param algorithm - The encryption algorithm (defaults to 'aes-256-cbc')
 * @returns The encrypted string in hex format with IV prepended
 *
 * @example
 * ```typescript
 * const encrypted = encrypt('sensitive data', 'my-secret-key');
 * console.log(encrypted); // 'a1b2c3d4...:e5f6g7h8...'
 * ```
 */
export function encrypt(
  text: string,
  cryptoKey: string,
  algorithm?: string
): string {
  const ALGORITHM = algorithm || 'aes-256-cbc';
  const IV_LENGTH = 16;
  const iv = crypto.randomBytes(IV_LENGTH);

  // Generate a 32-byte key from the cryptoKey
  const key = crypto.createHash('sha256').update(cryptoKey).digest();

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

// /////////////////////////////////////////////////////////////////////////////
// DECRYPT A STRING
// /////////////////////////////////////////////////////////////////////////////

/**
 * Decrypt an encrypted string using AES decryption
 *
 * This function decrypts a previously encrypted string using AES-256-CBC
 * decryption with the provided crypto key.
 *
 * @param encryptedKey - The encrypted string to decrypt (IV:encrypted format)
 * @param cryptoKey - The decryption key (must match encryption key)
 * @param algorithm - The decryption algorithm (defaults to 'aes-256-cbc')
 * @returns The decrypted plain text string
 * @throws Error if the input format is invalid or decryption fails
 *
 * @example
 * ```typescript
 * const decrypted = decrypt('a1b2c3d4...:e5f6g7h8...', 'my-secret-key');
 * console.log(decrypted); // 'sensitive data'
 * ```
 */
export function decrypt(
  encryptedKey: string,
  cryptoKey: string,
  algorithm?: string
): string {
  const ALGORITHM = algorithm || 'aes-256-cbc';
  const textParts = encryptedKey.split(':');
  const ivHex = textParts.shift();

  if (!ivHex) {
    throw new Error('Invalid input: Initialization vector (IV) is missing.');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');

  // Generate the same 32-byte key from the cryptoKey
  const key = crypto.createHash('sha256').update(cryptoKey).digest();

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString('utf8');
}

////////////////////////////////////////////////////////////////////////////////
// THE END
////////////////////////////////////////////////////////////////////////////////
