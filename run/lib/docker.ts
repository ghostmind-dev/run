import { $, which, sleep, cd, fs } from 'npm:zx';
import {
  detectScriptsDirectory,
  verifyIfMetaJsonExists,
} from '../utils/divers.ts';
import _ from 'npm:lodash';
import { parse } from 'npm:yaml';
import { readFileSync } from 'https://deno.land/std@0.112.0/node/fs.ts';

////////////////////////////////////////////////////////////////////////////////
// MUTE BY DEFAULT
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

////////////////////////////////////////////////////////////////////////////////
// RUNNING COMMAND LOCATION
////////////////////////////////////////////////////////////////////////////////

let currentPath = await detectScriptsDirectory(Deno.cwd());

cd(currentPath);

////////////////////////////////////////////////////////////////////////////////
// GET DOCKERFILE NAME AND IMAGE NAME
////////////////////////////////////////////////////////////////////////////////

export async function getDockerfileAndImageName(component: any) {
  $.verbose = true;
  const ENV = `${Deno.env.get('ENV')}`;

  const SRC = Deno.env.get('SRC') || '';

  let currentPath = await detectScriptsDirectory(Deno.cwd());

  let { docker } = await verifyIfMetaJsonExists(currentPath);

  component = component || 'default';

  let { root, image, context_dockerfile } = docker[component];

  let dockerFileName;
  let dockerfile;
  let dockerContext;

  if (context_dockerfile === false) {
    dockerFileName = `Dockerfile`;
  } else {
    dockerFileName = `Dockerfile.${ENV}`;
  }

  dockerfile = `${currentPath}/${root}/${dockerFileName}`;
  dockerContext = `${currentPath}/${root}`;

  // $.verbose = true;

  const { name: PROJECT_NAME } = await verifyIfMetaJsonExists(SRC);

  if (image.includes('gcr.io') || image.includes('ghcr.io')) {
    image = `${image}:${ENV}`;
    return { dockerfile, dockerContext, image };
  } else {
    const PROJECT = Deno.env.get('PROJECT') || PROJECT_NAME;
    const DOCKER_GCR_BASE = Deno.env.get('DOCKER_GCR_BASE');
    image = `${DOCKER_GCR_BASE}/${PROJECT}-${image}:${ENV}`;
    return { dockerfile, dockerContext, image };
  }
}

////////////////////////////////////////////////////////////////////////////////
// GET LATEST IMAGE DIGEST
////////////////////////////////////////////////////////////////////////////////

export async function getDockerImageDigest(arch: any, component: any) {
  let { image } = await getDockerfileAndImageName(component);

  // rempcve the tag from the image name

  if (arch === 'amd64') {
    $.verbose = true;

    const imageDigestRaw = await $`docker manifest inspect ${image}`;

    const jsonManifest = JSON.parse(`${imageDigestRaw}`);

    // find manifest with platform amd64

    const digest = jsonManifest.manifests.map((manifest: any) => {
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

    const digest = jsonManifest.manifests.map((manifest: any) => {
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
// DOCKER BUILD UNIT
////////////////////////////////////////////////////////////////////////////////
export async function dockerBuildUnit(component: any, options: any) {
  const { amd64, arm64, argument, cache } = options;

  const { dockerfile, dockerContext, image } = await getDockerfileAndImageName(
    component
  );

  Deno.env.set('BUILDX_NO_DEFAULT_ATTESTATIONS', '1');

  // Determine the machine architecture

  if (amd64) {
    // Ensure a buildx builder instance exists and is bootstrapped
    try {
      $.verbose = false;
      await $`docker buildx use mybuilder`;
    } catch {
      $.verbose = true;
      // If 'mybuilder' doesn't exist, create and bootstrap it
      await $`docker buildx create --name mybuilder --use`;
      await $`docker buildx inspect mybuilder --bootstrap`;
    }

    let baseCommand = [
      'docker',
      'buildx',
      'build',
      '--pull=false',
      '--platform=linux/amd64',
      `--tag=${image}`,
      `--tag=${image}-amd64`,
      `--file=${dockerfile}`,
      '--push',
    ];

    if (cache === undefined) {
      baseCommand.push('--no-cache');
    }

    if (argument) {
      argument.map((arg: any) => {
        baseCommand.push(`--build-arg=${arg}`);
      });
    }

    baseCommand.push(dockerContext);

    await $`${baseCommand}`;

    $.verbose = false;

    // verify if image-arm64 exists

    try {
      await $`docker manifest inspect ${image}-arm64`;
      await $`docker manifest create ${image} ${image}-amd64 ${image}-arm64`;
    } catch (e) {
      $.verbose = true;
      await $`docker manifest create ${image} ${image}-amd64 --amend`;
      await $`docker manifest push ${image}`;
    }
  }

  if (arm64) {
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
      '--platform=linux/arm64',
      `--tag=${image}`,
      `--tag=${image}-arm64`,
      `--file=${dockerfile}`,
      '--push',
    ];

    if (cache === undefined) {
      baseCommand.push('--no-cache');
    }

    if (argument) {
      argument.map((arg: any) => {
        baseCommand.push(`--build-arg=${arg}`);
      });
    }

    baseCommand.push(dockerContext);

    await $`${baseCommand}`;

    try {
      $.verbose = false;
      const arm64Exists = await $`docker manifest inspect ${image}-amd64`;
      await $`docker manifest create ${image} ${image}-amd64 ${image}-arm64`;
    } catch (e) {
      await $`docker manifest create ${image} ${image}-arm64 --amend`;
      await $`docker manifest push ${image}`;
    }
  }

  if (amd64 === undefined && arm64 === undefined) {
    let baseCommand = [
      'docker',
      'build',
      `--tag=${image}`,
      `--file=${dockerfile}`,
      '--push',
    ];

    if (argument) {
      argument.map((arg: any) => {
        baseCommand.push('--build-arg');
        baseCommand.push(arg);
      });
    }

    if (cache === undefined) {
      baseCommand.push('--no-cache');
    }

    baseCommand.push(dockerContext);

    await $`${baseCommand}`;
  }
}

////////////////////////////////////////////////////////////////////////////////
// DOCKER COMPOSE UP
////////////////////////////////////////////////////////////////////////////////

export async function dockerComposeUp(component: any, options: any) {
  let { file, forceRecreate, detach } = options;

  if (file === undefined) {
    file = 'compose.yaml';
  }

  let metaConfig = await fs.readJsonSync('meta.json');

  let { compose } = metaConfig;

  component = component || 'default';

  let { root } = compose[component];

  const baseCommand = ['docker', 'compose', '-f', `${root}/${file}`, 'up'];
  if (forceRecreate) {
    baseCommand.push('--force-recreate');
  }

  if (detach) {
    baseCommand.push('--detach');
  }

  $.verbose = true;

  await $`${baseCommand}`;
}

////////////////////////////////////////////////////////////////////////////////
// DOCKER COMPOSE DOWN
////////////////////////////////////////////////////////////////////////////////

export async function dockerComposeDown(component: any, options: any) {
  let { file, forceRecreate } = options;

  if (file === undefined) {
    file = 'compose.yaml';
  }

  let metaConfig = await fs.readJsonSync('meta.json');

  let { compose } = metaConfig;

  component = component || 'default';

  let { root } = compose[component];

  const baseCommand = [
    'docker',
    'compose',
    '-f',
    `${root}/${file}`,
    'down',
    '--remove-orphans',
  ];
  if (forceRecreate) {
    baseCommand.push('--force-recreate');
  }

  $.verbose = true;

  await $`${baseCommand}`;
}

////////////////////////////////////////////////////////////////////////////////
// DOCKER COMPOSE EXEC
////////////////////////////////////////////////////////////////////////////////

export async function dockerComposeExec(
  instructions: any,
  container: any,
  component: any,
  options: any
) {
  let { file, forceRecreate } = options;
  if (file === undefined) {
    file = 'compose.yaml';
  }
  let metaConfig = await fs.readJsonSync('meta.json');
  let { compose } = metaConfig;

  component = component || 'default';

  let { root } = compose[component];

  let notReady = true;

  if (container === undefined) {
    const yamlText = readFileSync(`${root}/${file}`, 'utf8');
    const yamlObject = parse(yamlText);

    // Get the first service name
    const firstServiceName = Object.keys(yamlObject.services)[0];

    container = firstServiceName;
  }

  while (notReady) {
    try {
      let state = await $`docker ps --format=json`;
      // Split the output into lines
      let lines = `${state}`.split('\n');
      // Filter out any empty lines
      lines = lines.filter((line) => line.trim() !== '');
      // Parse each line as a separate JSON object
      let jsonState = lines.map((line) => JSON.parse(line));
      let containerDetected = jsonState.find((box) =>
        box.Names.includes(container)
      );
      if (containerDetected) {
        console.log('Container found:', container);
        notReady = false;
      } else {
        console.log('Container not found. Retrying...');
      }
      await sleep(5000);
    } catch (e) {
      console.log(e);
      await sleep(5000);
    }
  }
  const baseCommand = [
    'docker',
    'compose',
    '-f',
    `${root}/${file}`,
    'exec',
    container,
    '/bin/bash',
    '-c',
    instructions,
  ];
  if (forceRecreate) {
    baseCommand.push('--force-recreate');
  }
  $.verbose = true;
  await $`${baseCommand}`;
}

////////////////////////////////////////////////////////////////////////////////
// DOCKER COMPOSE BUILD
////////////////////////////////////////////////////////////////////////////////

export async function dockerComposeBuild(component: any, options: any) {
  let { file, cache } = options;

  if (file === undefined) {
    file = 'compose.yaml';
  }

  let metaConfig = await fs.readJsonSync('meta.json');

  let { compose } = metaConfig;

  component = component || 'default';

  let { root } = compose[component];

  const baseCommand = ['docker', 'compose', '-f', `${root}/${file}`, 'build'];

  if (cache === undefined) {
    baseCommand.push('--no-cache');
  }

  $.verbose = true;

  await $`${baseCommand}`;
}

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function commandDocker(program: any) {
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
  // add a --no-cache option with true as default
  dockerBuild.option('--no-cache', 'Build docker image without cache');

  dockerBuild.option('--arm64', 'Build arm64 docker image');
  dockerBuild.argument('[component]', 'Component to build');
  dockerBuild.action(dockerBuildUnit);

  const dockerCompose = docker.command('compose');
  dockerCompose.description('docker compose commands');

  dockerCompose
    .command('up')
    .description('docker compose up')
    .action(dockerComposeUp)
    .argument('[component]', 'Component to build')
    .option('-f, --file <file>', 'docker compose file')
    .option('--force-recreate', 'force recreate')
    .option('-e, --envfile <file>', 'env filename')
    .option('-d, --detach', 'detach');

  dockerCompose
    .command('down')
    .description('docker compose down')
    .action(dockerComposeDown)
    .argument('[component]', 'Component to build')
    .option('-f, --file <file>', 'docker compose file')
    .option('--force-recreate', 'force recreate')
    .option('-e, --envfile <file>', 'env filename');

  dockerCompose
    .command('exec')
    .description('docker compose exec')
    .action(dockerComposeExec)
    .argument('[instructions]', 'Commands to run')
    .argument('[container]', 'Container to exec into)')
    .argument('[component]', 'Component to exec into)')
    .option('-f, --file <file>', 'docker compose file')
    .option('--force-recreate', 'force recreate')
    .option('-e, --envfile <file>', 'env filename');

  dockerCompose
    .command('build')
    .description('docker compose build')
    .argument('[component]', 'Component to build')
    .action(dockerComposeBuild)
    .option('-f, --file <file>', 'docker compose file')
    .option('--cache', 'enable cache');
}
