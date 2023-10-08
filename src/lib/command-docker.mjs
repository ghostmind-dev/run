import { $, which, sleep, cd, fs } from 'zx';
import {
  detectScriptsDirectory,
  verifyIfMetaJsonExists,
  withMetaMatching,
  recursiveDirectoriesDiscovery,
} from '../utils/divers.mjs';
import _ from 'lodash';

////////////////////////////////////////////////////////////////////////////////
// MUTE BY DEFAULT
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

////////////////////////////////////////////////////////////////////////////////
// RUNNING COMMAND LOCATION
////////////////////////////////////////////////////////////////////////////////

let currentPath = await detectScriptsDirectory(process.cwd());

cd(currentPath);

////////////////////////////////////////////////////////////////////////////////
// GET DOCKERFILE NAME AND IMAGE NAME
////////////////////////////////////////////////////////////////////////////////

export async function getDockerfileAndImageName() {
  const ENV = `${process.env.ENV}`;
  let currentPath = await detectScriptsDirectory(process.cwd());
  let metaConfig = await verifyIfMetaJsonExists(currentPath);

  let { type, scope, docker } = await verifyIfMetaJsonExists(currentPath);
  let { root } = docker;

  let dockerFileName;
  let dockerfile;
  let dockerContext;

  if (type === 'container') {
    let { context_dockerfile } = docker;

    if (scope === 'global') {
      dockerFileName = `Dockerfile`;
    } else if (context_dockerfile === false) {
      dockerFileName = `Dockerfile`;
    } else if (ENV === 'prod' || ENV === 'preview') {
      dockerFileName = `Dockerfile.prod`;
    } else {
      dockerFileName = `Dockerfile.dev`;
    }

    dockerfile = `${currentPath}/${dockerFileName}`;
    dockerContext = `${currentPath}`;
  } else if (root !== undefined) {
    dockerContext = `${currentPath}/${root}`;

    metaConfig = await verifyIfMetaJsonExists(dockerContext);

    let { context_dockerfile } = metaConfig.docker;

    if (scope === 'global') {
      dockerFileName = `Dockerfile`;
    } else if (context_dockerfile === false) {
      dockerFileName = `Dockerfile`;
    } else if (ENV === 'prod' || ENV === 'preview') {
      dockerFileName = `Dockerfile.prod`;
    } else {
      dockerFileName = `Dockerfile.dev`;
    }
    dockerfile = `${currentPath}/${root}/${dockerFileName}`;
    cd(dockerContext);
  }

  $.verbose = true;
  let { image } = metaConfig.docker;
  if (scope !== 'global') {
    image = `${image}:${ENV}`;
  }
  return { dockerfile, dockerContext, image };
}

////////////////////////////////////////////////////////////////////////////////
// GET LATEST IMAGE DIGEST
////////////////////////////////////////////////////////////////////////////////

export async function getDockerImageDigest() {
  let { image } = await getDockerfileAndImageName();

  const imageDigestRaw =
    await $`docker inspect --format='{{index .RepoDigests 0}}' ${image}`;

  //  remove /n from the end of the string
  const imageDigest = imageDigestRaw.stdout.slice(0, -1);
  return imageDigest;
}

////////////////////////////////////////////////////////////////////////////////
// DOCKER PUSH ENTRYPOINT
////////////////////////////////////////////////////////////////////////////////

export async function dockerPushActionEntry(options) {
  const { all } = options;

  if (all) {
    await dockerPushAll();
  } else {
    await dockerPushUnit();
  }
}

////////////////////////////////////////////////////////////////////////////////
// DOCKER PUSH ALL
////////////////////////////////////////////////////////////////////////////////

export async function dockerPushAll() {
  let metaConfig = await fs.readJsonSync('meta.json');

  let { docker } = metaConfig;

  if (docker !== undefined) {
    if (docker.root !== undefined) {
      let allDirectories = await recursiveDirectoriesDiscovery(
        `${currentPath}/${docker.root}`
      );

      // remove first element of the array

      for (let directory of allDirectories) {
        let metaConfig = await verifyIfMetaJsonExists(directory);

        if (metaConfig && metaConfig.type === 'container') {
          $.verbose = true;

          cd(directory);

          await dockerPushUnit();
        }
      }
    }
  } else {
    console.log('No docker configuration found');
  }

  cd(currentPath);
}

////////////////////////////////////////////////////////////////////////////////
// DOCKER PUSH UNIT
////////////////////////////////////////////////////////////////////////////////

export async function dockerPushUnit() {
  const { image } = await getDockerfileAndImageName();

  await $`docker push ${image}`;
}

////////////////////////////////////////////////////////////////////////////////
// DOCKER BUILD
////////////////////////////////////////////////////////////////////////////////

export async function dockerBuildActionEntry(options) {
  const { all, amd64 } = options;

  if (all) {
    await dockerBuildAll(options);
  } else {
    await dockerBuildUnit(options);
  }
}

////////////////////////////////////////////////////////////////////////////////
// DOCKER BUILD ALL
////////////////////////////////////////////////////////////////////////////////

export async function dockerBuildAll(options) {
  let metaConfig = await fs.readJsonSync('meta.json');
  let { docker } = metaConfig;
  if (docker !== undefined) {
    if (docker.root !== undefined) {
      let allDirectories = await recursiveDirectoriesDiscovery(
        `${currentPath}/${docker.root}`
      );
      // remove first element of the array
      for (let directory of allDirectories) {
        let metaConfig = await verifyIfMetaJsonExists(directory);
        if (metaConfig && metaConfig.type === 'container') {
          $.verbose = true;
          cd(directory);
          await dockerBuildUnit(options);
        }
      }
    }
  } else {
    console.log('No docker configuration found');
  }
  cd(currentPath);
}

////////////////////////////////////////////////////////////////////////////////
// DOCKER BUILD UNIT
////////////////////////////////////////////////////////////////////////////////
export async function dockerBuildUnit(options) {
  const { dockerfile, dockerContext, image } =
    await getDockerfileAndImageName();

  // Determine the machine architecture
  const ARCHITECTURE = process.arch;

  if (ARCHITECTURE === 'arm64') {
    // Ensure a buildx builder instance exists and is bootstrapped
    try {
      await $`docker buildx use mybuilder`;
    } catch {
      // If 'mybuilder' doesn't exist, create and bootstrap it
      await $`docker buildx create --name mybuilder --use`;
      await $`docker buildx inspect mybuilder --bootstrap`;
    }

    // Use buildx for building amd64 image or if the host machine is ARM64
    await $`docker buildx build --load --platform linux/amd64 -t ${image} -f ${dockerfile} ${dockerContext}`;
  } else {
    await $`docker build -t ${image} -f ${dockerfile} ${dockerContext}`;
  }
}

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function commandDocker(program) {
  const docker = program.command('docker');
  docker.description('docker commands');

  const dockerBuild = docker.command('build');
  dockerBuild.description('Build docker image');
  dockerBuild.option('-a, --all', 'Build all docker images');
  dockerBuild.option('--amd64', 'Build amd64 docker image');
  dockerBuild.action(dockerBuildActionEntry);

  const dockerPush = docker.command('push');
  dockerPush.description('Push docker image');
  dockerPush.option('-a, --all', 'Push all docker images');
  dockerPush.action(dockerPushActionEntry);
}
