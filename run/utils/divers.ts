import { fs, $ } from 'npm:zx';
import { config } from 'npm:dotenv';
import { expand } from 'npm:dotenv-expand';
import { nanoid } from 'npm:nanoid';

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
  try {
    const currentBranchRaw = await $`git branch --show-current`;

    const currentBranch = currentBranchRaw.stdout.trim();

    Deno.env.set('ENV', currentBranch);
  } catch (err) {
    return;
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
  const { secrets } = await verifyIfMetaJsonExists(currentPath);
  let env_file = `/tmp/.env.${APP_NAME}`;
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
    await $`rm -rf /tmp/.env.${APP_NAME}`;
    await $`cat ${base_file} ${target_file} > /tmp/.env.${APP_NAME}`;
  } else {
    let target_file = `${currentPath}/.env.${target}`;
    await $`rm -rf /tmp/.env.${APP_NAME}`;
    try {
      await fs.access(target_file, fsZX.constants.R_OK);
    } catch (err) {
      return;
    }
    // Read the .env file
    await $`cp ${target_file} /tmp/.env.${APP_NAME}`;
  }
  //
  // // Read the .env file
  const content: any = fsZX.readFileSync(env_file, 'utf-8');
  const nonTfVarNames: any = content.match(/^(?!TF_VAR_)[A-Z_]+(?==)/gm);
  // Extract all variable names that don't start with TF_VAR
  // remove element TF_VAR_PORT
  let prefixedVars = nonTfVarNames
    .map((varName: any) => {
      const value = content.match(new RegExp(`^${varName}=(.*)$`, 'm'))[1];
      return `TF_VAR_${varName}=${value}`;
    })
    .join('\n');
  const projectHasBeenDefined = prefixedVars.match(/^TF_VAR_PROJECT=(.*)$/m);
  const appNameHasBeenDefined = prefixedVars.match(/^TF_VAR_APP=(.*)$/m);
  const gcpProjectIdhAsBeenDefined = prefixedVars.match(
    /^TF_VAR_GCP_PROJECT_ID=(.*)$/m
  );
  if (!projectHasBeenDefined) {
    const SRC = Deno.env.get('SRC') || '';
    const { name } = await verifyIfMetaJsonExists(SRC);
    // add the project name to the .env file
    prefixedVars += `\nTF_VAR_PROJECT=${name}`;
  }
  if (!appNameHasBeenDefined) {
    const { name } = await verifyIfMetaJsonExists(currentPath);
    prefixedVars += `\nTF_VAR_APP=${name}`;
  }
  if (!gcpProjectIdhAsBeenDefined) {
    const GCP_PROJECT_ID = Deno.env.get('GCP_PROJECT_ID') || '';
    prefixedVars += `\nTF_VAR_GCP_PROJECT_ID=${GCP_PROJECT_ID}`;
  }
  await $`rm -rf /tmp/.env.${APP_NAME}`;
  // write content to /tmp/.env.APP_NAME and addd prefixedVars at the end
  await fsZX.writeFile(`/tmp/.env.${APP_NAME}`, `${content}\n${prefixedVars}`);
  expand(config({ path: `/tmp/.env.${APP_NAME}`, override: true }));
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
    .filter((dirent) => dirent.isDirectory())
    .filter((dirent) => dirent.name !== 'node_modules')
    .filter((dirent) => dirent.name !== '.git')
    .map((dirent) => dirent.name);

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
// VERIFY IF THERE IS A META.JSON FILE IN THE CURRENT PATH
////////////////////////////////////////////////////////////////////////////////

export async function verifyIfMetaJsonExists(path: string) {
  try {
    await fs.access(`${path}/meta.json`);
    return fs.readJsonSync(`${path}/meta.json`);
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
        directories.push({ directory, config: metaConfig });
      } else if (metaConfigProperty === value && metaConfigProperty) {
        directories.push({ directory, config: metaConfig });
      }
    }
  }

  return directories;
}

////////////////////////////////////////////////////////////////////////////////
// THE END
////////////////////////////////////////////////////////////////////////////////
