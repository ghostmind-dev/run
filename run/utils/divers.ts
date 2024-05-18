import { fs, $, cd } from 'npm:zx';
import { config } from 'npm:dotenv';
import { expand } from 'npm:dotenv-expand';
import { nanoid } from 'npm:nanoid';
import { exists } from 'https://deno.land/std/fs/mod.ts';

////////////////////////////////////////////////////////////////////////////////
// CREATE A SHORT UUID
////////////////////////////////////////////////////////////////////////////////

export async function createUUID(length: number = 12) {
  const id = nanoid(length);

  return id;
}

////////////////////////////////////////////////////////////////////////////////
// GET APP NAME
////////////////////////////////////////////////////////////////////////////////

export async function getAppName() {
  const currentPath = await detectScriptsDirectory(Deno.cwd());
  const { name }: any = await verifyIfMetaJsonExists(
    Deno.env.get(currentPath) || currentPath
  );

  return name;
}

////////////////////////////////////////////////////////////////////////////////
// GET PROJECT NAME
////////////////////////////////////////////////////////////////////////////////

export async function getProjectName() {
  const currentPath = await detectScriptsDirectory(Deno.cwd());
  const { name }: any = await verifyIfMetaJsonExists(
    Deno.env.get('SRC') || currentPath
  );

  return name;
}

////////////////////////////////////////////////////////////////////////////////
// SET ENV ON LOCAL
////////////////////////////////////////////////////////////////////////////////

export async function setEnvOnLocal() {
  const gitDirExists = await exists('.git');

  if (!gitDirExists) {
    return;
  }

  try {
    // Get the current branch
    const currentBranchRaw = await $`git branch --show-current`;
    let environment = currentBranchRaw.stdout.trim();

    // Map 'main' branch to 'prod'
    if (environment === 'main') {
      environment = 'prod';
    }

    // Set the environment variable
    Deno.env.set('ENV', environment);
  } catch (err) {
    // Log the error for debugging purposes
    console.error(
      "Failed to determine Git branch. Ensure you're in a Git repository.",
      err.message
    );

    // Optionally, you can set a default environment or handle the error as needed
    Deno.env.set('ENV', 'default');
  }
}

////////////////////////////////////////////////////////////////////////////////
// SET ENVIRONMENT .ENV VARIABLES
////////////////////////////////////////////////////////////////////////////////

export async function setSecretsOnLocal(target: string) {
  const currentPath = await detectScriptsDirectory(Deno.cwd());
  const APP_NAME = await getAppName();
  const fsZX: any = fs;
  // let baseUrl = null;
  const { secrets, port }: any = await verifyIfMetaJsonExists(currentPath);

  // create a random file nunber

  const randomFileNumber = await createUUID(12);

  let env_file = `/tmp/.env.${randomFileNumber}.${APP_NAME}`;
  if (secrets?.base) {
    let base_file = `${currentPath}/${secrets.base}`;
    let target_file = `${currentPath}/.env.${target}`;
    try {
      await fs.access(target_file, fsZX.constants.R_OK);
      await fs.access(base_file, fsZX.constants.R_OK);
    } catch (err) {
      return;
    }
    // merge base and target files in /tmp/.env.APP_NAME
    await $`rm -rf /tmp/.env.${randomFileNumber}.${APP_NAME}`;
    await $`cat ${base_file} ${target_file} > /tmp/.env.${randomFileNumber}.${APP_NAME}`;
  } else {
    let target_file = `${currentPath}/.env.${target}`;
    await $`rm -rf /tmp/.env.${randomFileNumber}.${APP_NAME}`;
    try {
      await fs.access(target_file, fsZX.constants.R_OK);
    } catch (err) {
      expand(
        config({ path: `${Deno.env.get('HOME')}/.zprofile`, override: false })
      );
      return;
    }
    // Read the .env file
    await $`cp ${target_file} /tmp/.env.${randomFileNumber}.${APP_NAME}`;
  }
  //
  // // Read the .env file
  const content: any = fsZX.readFileSync(env_file, 'utf-8');
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
    const { name } = await verifyIfMetaJsonExists(SRC);
    // add the project name to the .env file
    const PROJECT = await getProjectName();
    Deno.env.set('PROJECT', PROJECT);
    prefixedVars += `\nTF_VAR_PROJECT=${name}`;
  }
  if (!appNameHasBeenDefined) {
    const { name } = await verifyIfMetaJsonExists(currentPath);
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
  // write content to /tmp/.env.APP_NAME and addd prefixedVars at the end
  await fsZX.writeFile(
    `/tmp/.env.${randomFileNumber}.${APP_NAME}`,
    `${content}\n${prefixedVars}`
  );
  expand(
    config({
      path: `/tmp/.env.${randomFileNumber}.${APP_NAME}`,
      override: true,
    })
  );
  expand(
    config({ path: `${Deno.env.get('HOME')}/.zprofile`, override: false })
  );
  return;
}

////////////////////////////////////////////////////////////////////////////////
// DETECT SCRIPS DIRECTORY
////////////////////////////////////////////////////////////////////////////////

export async function detectScriptsDirectory(currentPath: string) {
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

export async function getFilesInDirectory(path: string) {
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

export async function getDirectories(path: string) {
  const directoriesWithFiles = await fs.readdir(`${path}`, {
    withFileTypes: true,
  });

  const directories = directoriesWithFiles
    .filter((dirent: any) => dirent.isDirectory())
    .filter((dirent: any) => dirent.name !== 'node_modules')
    .filter((dirent: any) => dirent.name !== '.git')
    .filter((dirent: any) => dirent.name !== '.terraform')
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
  path: string,
  existsDetecty: boolean = false
) {
  if (existsDetecty) {
    try {
      await fs.access(`${path}/meta.json`);
      return true;
    } catch (error) {
      return false;
    }
  }

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

    const updatedMetaConfigAction = (obj: AnyObject): AnyObject => {
      const resolveTemplateString = (
        value: string,
        context: AnyObject
      ): string => {
        return value.replace(/\${this\.(.*?)}/g, (_: any, path: any): any => {
          const resolvedValue = getProperty(context, path);
          return resolvedValue !== undefined ? resolvedValue : '';
        });
      };

      const updateProperties = (object: AnyObject, context: AnyObject) => {
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
    return false;
  }
}

////////////////////////////////////////////////////////////////////////////////
// RETURN ALL FOLDER PATH THAT MATCHES THE META.JSON FILE CONDITION
// document this function
// @param {string} property - the property to match
// @param {string} value - the value to match (optional)
// return {array} - an array of path that matches the condition
////////////////////////////////////////////////////////////////////////////////

export async function withMetaMatching({ property, value, path }: any) {
  let directoryEntryPath = path || Deno.env.get('SRC');

  const allDirectories = await recursiveDirectoriesDiscovery(
    directoryEntryPath
  );

  let directories = [];

  for (let directory of allDirectories) {
    const metaConfigExists: any = await verifyIfMetaJsonExists(directory, true);

    if (metaConfigExists) {
      let metaConfigProperty;

      const metaConfig: any = await verifyIfMetaJsonExists(directory);

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
// THE END
////////////////////////////////////////////////////////////////////////////////
