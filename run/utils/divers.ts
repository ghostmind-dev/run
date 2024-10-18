import { $, chalk } from 'npm:zx@8.1.0';
import { config } from 'npm:dotenv@16.4.5';
import { expand } from 'npm:dotenv-expand@11.0.6';
import fs from 'npm:fs-extra@11.2.0';
import { nanoid } from 'npm:nanoid@5.0.7';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';

////////////////////////////////////////////////////////////////////////////////
// iNTRODUCE
////////////////////////////////////////////////////////////////////////////////

export interface MetaJsonBase {
  id: string;
  type: string;
  name: string;
}

export interface MetaJson extends MetaJsonBase {
  [key: string]: any;
}

////////////////////////////////////////////////////////////////////////////////
// CREATE A SHORT UUID
////////////////////////////////////////////////////////////////////////////////

export async function createUUID(length: number = 12): Promise<string> {
  const id = nanoid(length);

  return id;
}

////////////////////////////////////////////////////////////////////////////////
// GET APP NAME
////////////////////////////////////////////////////////////////////////////////

export async function getAppName(): Promise<string> {
  const currentPath = await detectScriptsDirectory(Deno.cwd());
  const { name }: any = await verifyIfMetaJsonExists(
    Deno.env.get(currentPath) || currentPath
  );

  return name;
}

////////////////////////////////////////////////////////////////////////////////
// GET PROJECT NAME
////////////////////////////////////////////////////////////////////////////////

export async function getProjectName(): Promise<string> {
  const currentPath = await detectScriptsDirectory(Deno.cwd());
  const { name }: any = await verifyIfMetaJsonExists(
    Deno.env.get('SRC') || currentPath
  );

  return name;
}

////////////////////////////////////////////////////////////////////////////////
// SET ENV ON LOCAL
////////////////////////////////////////////////////////////////////////////////

export async function setEnvOnLocal(target: string): Promise<void> {
  try {
    // Check if we are in a Git repository

    if (target === 'local') {
      Deno.env.set('ENV', 'local');
      return;
    }

    const isInRepoRaw =
      await $`git rev-parse --is-inside-work-tree 2>/dev/null`;
    const isInRepo = isInRepoRaw.stdout.trim() === 'true';

    if (!isInRepo) {
      Deno.env.set('ENV', 'default');
      return;
    }

    // Get the current branch
    const currentBranchRaw = await $`git branch --show-current`;
    let environment = currentBranchRaw.stdout.trim();

    // Map 'main' branch to 'prod'
    if (environment === 'main') {
      environment = 'prod';
    }

    // Set the environment variable
    Deno.env.set('ENV', environment);
  } catch {
    // Quietly set the default environment variable if any error occurs
    Deno.env.set('ENV', 'default');
  }
}

////////////////////////////////////////////////////////////////////////////////
// SET ENVIRONMENT .ENV VARIABLES
////////////////////////////////////////////////////////////////////////////////

export async function setSecretsOnLocal(target: string): Promise<void> {
  $.verbose = false;

  const currentPath = await detectScriptsDirectory(Deno.cwd());

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
// DETECT SCRIPS DIRECTORY
////////////////////////////////////////////////////////////////////////////////

export async function detectScriptsDirectory(
  currentPath: string
): Promise<string> {
  // verify if the current path ends with scripts

  if (currentPath.includes('scripts')) {
    // remove /scripts from the path
    currentPath = currentPath.replace('/scripts', '');
    return currentPath;
  }

  return currentPath;
}

////////////////////////////////////////////////////////////////////////////////
// GET FILES IN A DIRECTORY
////////////////////////////////////////////////////////////////////////////////

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
// GET META.JSON UPDATED
////////////////////////////////////////////////////////////////////////////////

export async function verifyIfMetaJsonExists(
  path: string
): Promise<MetaJson | undefined> {
  try {
    await fs.access(`${path}/meta.json`);
    let metaconfig = fs.readJsonSync(`${path}/meta.json`);

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
