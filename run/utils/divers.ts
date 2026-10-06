/**
 * @fileoverview Utility functions module for @ghostmind/run
 *
 * This module provides common utility functions for project configuration,
 * environment management, file operations, and meta.json handling.
 *
 * @module
 */

import { $, chalk } from 'npm:zx@8.1.0';
import { config, parse } from 'npm:dotenv@16.4.5';
import { expand } from 'npm:dotenv-expand@11.0.6';
import fs from 'npm:fs-extra@11.2.0';
import { readFileSync } from 'node:fs';
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
// SET SRC
////////////////////////////////////////////////////////////////////////////////

export async function getSrc(): Promise<string> {
  const cwd = Deno.cwd();
  const projectDir = await findProjectDirectory(cwd);
  if (projectDir) {
    return projectDir;
  }

  return cwd;
}

////////////////////////////////////////////////////////////////////////////////
// SET ENVIRONMENT .ENV VARIABLES
////////////////////////////////////////////////////////////////////////////////

/**
 * Load and set environment variables from .env files
 *
 * This function loads environment variables from target-specific .env files,
 * merges them with base configurations, and sets up TF_VAR_ variables.
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
export async function setSecretsOnLocal(
  target: string,
  envPath?: string,
): Promise<void> {
  $.verbose = false;

  const currentPath = Deno.cwd();

  const metaConfig = await verifyIfMetaJsonExists(currentPath);

  if (metaConfig === undefined) {
    return;
  }

  const SRC = await getSrc();
  Deno.env.set('SRC', SRC);

  if (Deno.env.get('LOCALHOST_SRC') === undefined) {
    Deno.env.set('LOCALHOST_SRC', SRC);
  }

  const { secrets = { base: 'base' }, port } = metaConfig;
  const secretsBase = secrets.base ?? 'base';

  const basePath = envPath || currentPath;
  const base_file = `${basePath}/.env.${secretsBase}`;
  const target_file = `${basePath}/.env.${target}`;

  try {
    await fs.access(target_file, fs.constants.R_OK);
  } catch (err) {
    return;
  }

  try {
    await fs.access(base_file, fs.constants.R_OK);
  } catch (err) {
    console.log(
      chalk.red(
        `The file .env.${secretsBase} does not exist. A base env file is required.`,
      ),
    );
    Deno.exit(1);
  }

  const baseContent = readFileSync(base_file, 'utf-8');
  const targetContent = readFileSync(target_file, 'utf-8');
  const content = `${baseContent}\n${targetContent}`;

  const nonTfVarNames: any = content.match(/^(?!TF_VAR_)[A-Z_]+(?==)/gm);

  let prefixedVars = nonTfVarNames
    .map((varName: any) => {
      const value = content.match(new RegExp(`^${varName}=(.*)$`, 'm'))?.[1] ?? '';
      return `TF_VAR_${varName}=${value}`;
    })
    .join('\n');

  const projectHasBeenDefined = prefixedVars.match(/^TF_VAR_PROJECT=(.*)$/m);
  const appNameHasBeenDefined = prefixedVars.match(/^TF_VAR_APP=(.*)$/m);
  const portHasBeenDefined = prefixedVars.match(/^TF_VAR_PORT=(.*)$/m);
  const gcpProjectIdhAsBeenDefined = prefixedVars.match(
    /^TF_VAR_GCP_PROJECT_ID=(.*)$/m,
  );

  if (!projectHasBeenDefined) {
    const srcMetaConfig = await verifyIfMetaJsonExists(SRC);
    let name = '';
    if (srcMetaConfig) {
      name = srcMetaConfig.name;
    }
    const { name: PROJECT }: any = await verifyIfMetaJsonExists(
      await getSrc()
    );
    Deno.env.set('PROJECT', PROJECT);
    prefixedVars += `\nTF_VAR_PROJECT=${name}`;
  }
  if (!appNameHasBeenDefined) {
    const appMetaConfig = await verifyIfMetaJsonExists(currentPath);
    let name = '';
    if (appMetaConfig) {
      name = appMetaConfig.name;
    }
    const { name: APP }: any = await verifyIfMetaJsonExists(currentPath);
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

  const mergedContent = `${content}\n${prefixedVars}`;
  const parsed = parse(mergedContent);

  // Set raw parsed values first to override any inherited env vars (e.g. from
  // a parent routine process). This replicates the old config({override:true})
  // behaviour so that expand() resolves ${VAR} references from the file values,
  // not from stale inherited environment.
  for (const key in parsed) {
    Deno.env.set(key, parsed[key]);
  }

  const expanded = expand({ parsed, processEnv: Deno.env.toObject() });

  for (const key in expanded.parsed) {
    Deno.env.set(key, expanded.parsed[key]);
  }

  return;
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
  path: string,
): Promise<string[]> {
  const directories = await getDirectories(path);

  let directoriesPath: string[] = [];

  for (let directory of directories) {
    directoriesPath.push(`${path}/${directory}`);
    directoriesPath = directoriesPath.concat(
      await recursiveDirectoriesDiscovery(`${path}/${directory}`),
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
  path: string,
): Promise<string | undefined> {
  let currentPath = path;

  while (currentPath && currentPath !== '/') {
    const metaConfig = await verifyIfMetaJsonExists(currentPath);
    if (metaConfig && metaConfig.type === 'project') {
      return currentPath;
    }
    const parent = currentPath.substring(0, currentPath.lastIndexOf('/'));
    currentPath = parent || '/';
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
  path: string,
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
                  Deno.env.get(envVariable),
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
          object,
        );
    };

    const updatedMetaConfigAction = (obj: MetaJson): MetaJson => {
      const resolveTemplateString = (
        value: string,
        context: AnyObject,
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
// THE END
////////////////////////////////////////////////////////////////////////////////
