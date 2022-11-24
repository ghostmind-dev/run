import { $, sleep, cd, fs, echo } from 'zx';

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
// RETURN ALL THE DIRECTORIES IN A PATH
////////////////////////////////////////////////////////////////////////////////

export async function getDirectories(path) {
  const directoriesWithFiles = await fs.readdir(`${path}`, {
    withFileTypes: true,
  });

  const directories = directoriesWithFiles
    .filter((dirent) => dirent.isDirectory())
    .filter((dirent) => dirent.name !== 'node_modules')
    .filter((dirent) => dirent.name !== '.git')
    .filter((dirent) => dirent.name !== 'migrations')
    .map((dirent) => dirent.name);

  return directories;
}

////////////////////////////////////////////////////////////////////////////////
// DISCOVER ALL THE DIRECTORIES PATH  IN THE PROJECT (RECURSIVE)
////////////////////////////////////////////////////////////////////////////////

export async function recursiveDirectoriesDiscovery(path) {
  const directories = await getDirectories(path);

  let directoriesPath = [];

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

export async function verifyIfMetaJsonExists(path) {
  try {
    await fs.access(`${path}/meta.json`);

    return fs.readJsonSync(`${path}/meta.json`);
  } catch (error) {
    return false;
  }
}

////////////////////////////////////////////////////////////////////////////////
// RETURN ALL FOLDER PATH THAT MAACTHES THE META.JSON FILE CONDITION
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
