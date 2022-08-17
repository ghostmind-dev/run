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
    .map((dirent) => dirent.name);

  return directories;
}
