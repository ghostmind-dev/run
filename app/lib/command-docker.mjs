import { $, which, sleep, cd, fs } from 'zx';
import {
  detectScriptsDirectory,
  verifyIfMetaJsonExists,
  withMetaMatching,
  recursiveDirectoriesDiscovery,
} from '../utils/divers.mjs';
import _ from 'lodash';
import path from 'path';

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
  let { image, tag } = metaConfig.docker;
  if (scope === 'global') {
    image = `${image}:${tag || 'latest'}`;
  } else {
    image = `${image}:${tag || ENV}`;
  }

  return { dockerfile, dockerContext, image };
}

////////////////////////////////////////////////////////////////////////////////
// GET LATEST IMAGE DIGEST
////////////////////////////////////////////////////////////////////////////////

export async function getDockerImageDigest(arch) {
  let { image } = await getDockerfileAndImageName();

  // rempcve the tag from the image name

  if (arch === 'amd64') {
    $.verbose = false;

    const imageDigestRaw = await $`docker manifest inspect ${image}`;

    const jsonManifest = JSON.parse(`${imageDigestRaw}`);

    // find manifest with platform amd64

    const digest = jsonManifest.manifests.map((manifest) => {
      if (manifest.platform.architecture === 'amd64') {
        return manifest.digest;
      }
    });

    image = image.split(':')[0];
    return `${image}@${digest[0]}`;
    // remove undefined from the array
  } else if (arch === 'arm64') {
    $.verbose = false;

    const imageDigestRaw = await $`docker manifest inspect ${image}`;

    const jsonManifest = JSON.parse(`${imageDigestRaw}`);

    // find manifest with platform amd64

    const digest = jsonManifest.manifests.map((manifest) => {
      if (manifest.platform.architecture === 'arm64') {
        return manifest.digest;
      }
    });

    image = image.split(':')[0];
    return `${image}@${digest[0]}`;
    // remove undefined from the array
  } else {
    const imageDigestRaw =
      await $`docker inspect --format='{{index .RepoDigests 0}}' ${image}`;
  }
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
// DOCKER BUILDX
////////////////////////////////////////////////////////////////////////////////

export async function dockerBuildxActionEntry(options) {
  const { all, mutli } = options;

  if (all) {
    await dockerBuildxAll(options);
  } else {
    await dockerBuildxUnit(options);
  }
}

////////////////////////////////////////////////////////////////////////////////
// DOCKER BUILD UNIT
////////////////////////////////////////////////////////////////////////////////

export async function dockerBuildxUnit(options) {
  const { amd64, multi } = options;

  const { dockerfile, dockerContext, image } =
    await getDockerfileAndImageName();

  // Determine the machine architecture
  const ARCHITECTURE = process.arch;

  if (multi) {
    // Ensure a buildx builder instance exists and is bootstrapped
    try {
      await $`docker buildx use mybuilder`;
    } catch {
      // If 'mybuilder' doesn't exist, create and bootstrap it
      await $`docker buildx create --name mybuilder --use`;
      await $`docker buildx inspect mybuilder --bootstrap`;
    }

    const instructions = `docker buildx build --platform linux/amd64,linux/arm64 -t ${image} --file ${dockerfile} --push ${dockerContext}`;

    // transfor the instructions into an array

    const instructionsArray = instructions.split(' ');
    await $`docker buildx create --use`;
    await $`${instructionsArray}`;
  } else {
    console.log('Should move from docker build to docker buildx');
  }
}

////////////////////////////////////////////////////////////////////////////////
// DOCKER BUILD ALL
////////////////////////////////////////////////////////////////////////////////

export async function dockerBuildxAll(options) {
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
          await dockerBuildxUnit(options);
        }
      }
    }
  } else {
    console.log('No docker configuration found');
  }
  cd(currentPath);
}

////////////////////////////////////////////////////////////////////////////////
// DOCKER BUILD
////////////////////////////////////////////////////////////////////////////////

export async function dockerBuildActionEntry(options) {
  const { all } = options;

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
  const { amd64, arm64, argument } = options;

  const { dockerfile, dockerContext, image } =
    await getDockerfileAndImageName();

  // Determine the machine architecture
  const ARCHITECTURE = process.arch;

  if (amd64) {
    // Ensure a buildx builder instance exists and is bootstrapped
    try {
      await $`docker buildx use mybuilder`;
    } catch {
      // If 'mybuilder' doesn't exist, create and bootstrap it
      await $`docker buildx create --name mybuilder --use`;
      await $`docker buildx inspect mybuilder --bootstrap`;
    }

    let baseCommand = [
      'docker',
      'buildx',
      'build',
      '--platform=linux/amd64',
      '-t',
      `${image}-amd64`,
      '--file',
      dockerfile,
      '--push',
      dockerContext,
    ];

    if (argument) {
      argument.map((arg) => {
        baseCommand.push('--build-arg');
        baseCommand.push(arg);
      });
    }

    await $`${baseCommand}`;

    $.verbose = false;

    // verify if image-arm64 exists

    try {
      const arm64Exists = await $`docker manifest inspect ${image}-arm64`;
      await $`docker manifest create ${image} ${image}-amd64 ${image}-arm64`;
    } catch (e) {
      $.verbose = true;
      await $`docker manifest create ${image} ${image}-amd64 --amend`;
      await $`docker manifest push ${image}`;
    }
  } else if (arm64) {
    try {
      await $`docker buildx use mybuilder`;
    } catch {
      // If 'mybuilder' doesn't exist, create and bootstrap it
      await $`docker buildx create --name mybuilder --use`;
      await $`docker buildx inspect mybuilder --bootstrap`;
    }

    let baseCommand = [
      'docker',
      'buildx',
      'build',
      '--platform',
      'linux/arm64',
      '-t',
      image,
      '-t',
      `${image}-arm64`,
      '--file',
      dockerfile,
      '--push',
      dockerContext,
    ];

    if (argument) {
      argument.map((arg) => {
        baseCommand.push('--build-arg');
        baseCommand.push(arg);
      });
    }

    await $`${baseCommand}`;

    try {
      $.verbose = false;
      const arm64Exists = await $`docker manifest inspect ${image}-amd64`;
      await $`docker manifest create ${image} ${image}-amd64 ${image}-arm64`;
    } catch (e) {
      await $`docker manifest create ${image} ${image}-arm64 --amend`;
      await $`docker manifest push ${image}`;
    }
  } else {
    let baseCommand = [
      'docker',
      'build',
      '-t',
      image,
      '--file',
      dockerfile,
      '--push',
      dockerContext,
    ];

    if (argument) {
      argument.map((arg) => {
        baseCommand.push('--build-arg');
        baseCommand.push(arg);
      });
    }

    await $`${baseCommand}`;
  }
}

////////////////////////////////////////////////////////////////////////////////
// DOCKER COMPOSE UP
////////////////////////////////////////////////////////////////////////////////

export async function dockerComposeUp(options) {
  console.log(options);
  let { file, forceRecreate, envfile } = options;

  if (file === undefined) {
    file = 'compose.yaml';
  }
  const baseCommand = ['docker', 'compose', '-f', file, 'up'];
  if (forceRecreate) {
    baseCommand.push('--force-recreate');
  }

  if (envfile === undefined) {
    // write .env file tp /tmp/.env.${name}
    await fs.writeFile(
      `../.env.compose`,
      await fs.readFile(`../.env.local`, 'utf8')
    );
  } else {
    const pathToEnv = path.resolve(currentPath, envfile);

    await fs.writeFile(`../.env.compose`, await fs.readFile(pathToEnv, 'utf8'));
  }

  $.verbose = true;

  await $`${baseCommand}`;
}

////////////////////////////////////////////////////////////////////////////////
// DOCKER COMPOSE BUILD
////////////////////////////////////////////////////////////////////////////////

export async function dockerComposeBuild(options) {
  let { file, cache } = options;

  if (file === undefined) {
    file = 'compose.yaml';
  }

  const baseCommand = ['docker', 'compose', '-f', file, 'build'];

  if (cache === undefined) {
    baseCommand.push('--no-cache');
  }

  $.verbose = true;

  await $`${baseCommand}`;
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
  dockerBuild.option(
    '-arg, --argument <arguments...>',
    'Build docker image with arguments'
  );
  dockerBuild.option('--amd64', 'Build amd64 docker image');
  dockerBuild.option('--arm64', 'Build arm64 docker image');
  dockerBuild.action(dockerBuildActionEntry);

  const dockerBuildx = docker.command('buildx');
  dockerBuildx.description('Build multiplaform docker image');
  dockerBuildx.option('-a, --all', 'Build all docker images');
  dockerBuildx.option('--multi', 'Build multiplaform docker image');
  dockerBuildx.action(dockerBuildxActionEntry);

  const dockerPush = docker.command('push');
  dockerPush.description('Push docker image');
  dockerPush.option('-a, --all', 'Push all docker images');
  dockerPush.action(dockerPushActionEntry);

  const dockerCompose = docker.command('compose');
  dockerCompose.description('docker compose commands');

  dockerCompose
    .command('up')
    .description('docker compose up')
    .action(dockerComposeUp)
    .option('-f, --file <file>', 'docker compose file')
    .option('--force-recreate', 'force recreate')
    .option('-e, --envfile <file>', 'env filename');

  dockerCompose
    .command('build')
    .description('docker compose build')
    .action(dockerComposeBuild)
    .option('-f, --file <file>', 'docker compose file')
    .option('--cache', 'enable cache');
}
