import { cd, fs } from 'zx';
import { config } from 'dotenv';

////////////////////////////////////////////////////////////////////////////////
// CONSTANTS
////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////
// DETECT SCRIPS DIRECTORY
////////////////////////////////////////////////////////////////////////////////

export async function detectScriptsDirectory(currentPath) {
  // verify if the current path ends with scripts

  if (currentPath.includes('scripts')) {
    // remove /scripts from the path
    currentPath = currentPath.replace('/scripts', '');
    return currentPath;
  }

  return currentPath;
}

////////////////////////////////////////////////////////////////////////////////
// GET PROJECT TYPE
////////////////////////////////////////////////////////////////////////////////

export async function verifyIfProjectCore() {
  cd(process.env.SRC);

  const metaConfig = await fs.readJsonSync('meta.json');
  const { type, name } = metaConfig;

  if (type === 'project') {
    if (name === 'core') {
      return true;
    }
  }
  return false;
}

////////////////////////////////////////////////////////////////////////////////
// GET FILES IN A DIRECTORY
////////////////////////////////////////////////////////////////////////////////

export async function getFilesInDirectory(
  path,
  igbore_files,
  ignore_extensions
) {
  const filesInFolder = await fs.readdir(path, {
    withFileTypes: true,
  });

  igbore_files = igbore_files || [];
  ignore_extensions = ignore_extensions || [];

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

    if (igbore_files.includes(file.name)) {
      continue;
    }

    if (defaultFilesToIgnore.includes(file.name)) {
      continue;
    }

    if (ignore_extensions.includes(file.name.split('.').pop())) {
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

export async function getDirectories(path, ignore_folders) {
  const directoriesWithFiles = await fs.readdir(`${path}`, {
    withFileTypes: true,
  });

  ignore_folders = ignore_folders || [];

  const directories = directoriesWithFiles
    .filter((dirent) => dirent.isDirectory())
    .filter((dirent) => dirent.name !== 'node_modules')
    .filter((dirent) => dirent.name !== '.git')
    // ignore_folders is an array of folders to ignore
    .filter((dirent) => !ignore_folders.includes(dirent.name))
    .map((dirent) => dirent.name);

  return directories;
}

////////////////////////////////////////////////////////////////////////////////
// DISCOVER ALL THE DIRECTORIES PATH  IN THE PROJECT (RECURSIVE)
////////////////////////////////////////////////////////////////////////////////

export async function recursiveDirectoriesDiscovery(path, ignore_folders) {
  const directories = await getDirectories(path, ignore_folders);

  let directoriesPath = [];

  for (let directory of directories) {
    directoriesPath.push(`${path}/${directory}`);
    directoriesPath = directoriesPath.concat(
      await recursiveDirectoriesDiscovery(
        `${path}/${directory}`,
        ignore_folders
      )
    );
  }

  return directoriesPath;
}

////////////////////////////////////////////////////////////////////////////////
// VERIFY IF THERE IS A META.JSON FILE IN THE CURRENT PATH
////////////////////////////////////////////////////////////////////////////////

export async function verifyIfMetaJsonExists(path) {
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

export async function withMetaMatching({ property, value, path }) {
  let directoryEntryPath = path || process.env.SRC;

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
// setSecretsUptoProject
////////////////////////////////////////////////////////////////////////////////

export async function setSecretsUptoProject(path) {
  // print all the parent directories
  // example: if path == /home/ghostmind/dev/src/projects/ghostmind
  // print: /home/ghostmind/dev/src/projects/ghostmind
  // print: /home/ghostmind/dev/src/projects
  // print: /home/ghostmind/dev/src
  // print: /home/ghostmind/dev
  // print: /home/ghostmind
  // print: /home
  // print: /

  const directories = path.split('/');
  let directoriesPath = [];

  for (let i = directories.length; i > 0; i--) {
    directoriesPath.push(directories.slice(0, i).join('/'));
  }

  for (let directory of directoriesPath) {
    let metaConfig = await verifyIfMetaJsonExists(directory);

    if (metaConfig) {
      if (metaConfig.secrets) {
        config({ path: `${directory}/.env` });
      }
      if (metaConfig.type === 'project') {
        return;
      }
    }
  }
}

////////////////////////////////////////////////////////////////////////////////
// ENVIRONMENT SAFEGUARD
////////////////////////////////////////////////////////////////////////////////

export async function environmentSafeguard(currentPath) {
  const metaConfig = await verifyIfMetaJsonExists(currentPath);

  let directoryNoMatchEnv = [];

  for (const directoryObject of directoriesBindToEnv) {
    const { directory } = directoryObject;
    config({ path: `${directory}/.env`, override: true });

    if (process.env.ENV !== process.env.ENVIRONMENT) {
      directoryNoMatchEnv.push(directory);
    }
  }

  if (directoryNoMatchEnv.length > 0) {
    const prompt = inquirer.createPromptModule();

    const answer = await prompt({
      type: 'confirm',
      name: 'answer',
      message:
        '\n' +
        `Some directories are bind to a different environment than ${process.env.ENV}` +
        `\n` +
        `\n${directoryNoMatchEnv.join('\n')}` +
        `\n` +
        `\nDo you want to continue?`,
    });

    if (!answer) {
      process.exit(1);
    }
  }
}
