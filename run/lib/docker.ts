import { $, sleep, cd } from 'npm:zx@8.1.0';
import {
  detectScriptsDirectory,
  verifyIfMetaJsonExists,
} from '../utils/divers.ts';
import _ from 'npm:lodash@4.17.21';
import { parse } from 'npm:yaml@2.4.2';
import { readFileSync } from 'node:fs';
import fs from 'npm:fs-extra@11.2.0';

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

export async function getDockerfileAndImageName(
  component: any
): Promise<{ dockerfile: string; dockerContext: string; image: string }> {
  $.verbose = true;
  const ENV = `${Deno.env.get('ENV')}`;

  const SRC = Deno.env.get('SRC') || '';

  const metaConfig = await verifyIfMetaJsonExists(SRC);

  let docker = metaConfig?.docker;

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

  // need other solution to get the project name
  const { name: PROJECT_NAME } = metaConfig || { name: '' };

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

export async function getDockerImageDigest(
  arch: any,
  component: any
): Promise<string> {
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
    return imageDigestRaw.toString();
  }
}

////////////////////////////////////////////////////////////////////////////////
// DOCKER BUILD UNIT
////////////////////////////////////////////////////////////////////////////////
export async function dockerRegister(
  componentOrOptions?: string | DockerRegisterOptions,
  options?: DockerRegisterOptions
) {
  // verify id componentOrOptions is a string or an object

  if (typeof componentOrOptions === 'string') {
    options = options || {};
    options.component = componentOrOptions;
  } else {
    options = componentOrOptions || {};
  }

  const { amd64, arm64, argument, cache } = options;

  const { dockerfile, dockerContext, image } = await getDockerfileAndImageName(
    options.component
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
      await $`docker manifest create --amend ${image} ${image}-amd64 ${image}-arm64`;
      await $`docker manifest push ${image}`;
    } catch (e) {
      $.verbose = true;
      await $`docker manifest create --amend ${image} ${image}-amd64 --amend`;
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
      await $`docker manifest create --amend ${image} ${image}-amd64 ${image}-arm64`;
      await $`docker manifest push ${image}`;
    } catch (e) {
      await $`docker manifest create --amend ${image} ${image}-arm64 --amend`;
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

export async function dockerComposeUp(
  componentOrOptions?: string | DockerComposeUpOptionsComponent,
  options?: DockerComposeUpOptions
) {
  let component: string;

  if (typeof componentOrOptions === 'string') {
    component = componentOrOptions;
    options = options || {};
  } else {
    if (componentOrOptions === undefined) {
      component = 'default';
    } else {
      component = componentOrOptions.component || 'default';
    }

    options = componentOrOptions;
  }

  let { file, forceRecreate, detach } = options || {};

  if (file === undefined) {
    file = 'compose.yaml';
  }

  let metaConfig = await verifyIfMetaJsonExists(Deno.cwd());

  if (metaConfig === undefined) {
    return;
  }

  let { compose } = metaConfig;
  component = component || 'default';
  await dockerComposeDown(component, { file, forceRecreate });
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

  let metaConfig = await verifyIfMetaJsonExists(Deno.cwd());

  if (metaConfig === undefined) {
    return;
  }

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
  let metaConfig = await verifyIfMetaJsonExists(Deno.cwd());

  if (metaConfig === undefined) {
    return;
  }
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

export async function dockerComposeBuild(
  componentOrOptions: DockerComposeBuildOptionsComponent,
  options: DockerComposeBuildOptions
) {
  let component: string;

  if (typeof componentOrOptions === 'string') {
    component = componentOrOptions;
    options = options || {};
  } else {
    if (componentOrOptions === undefined) {
      component = 'default';
      options = {};
    } else {
      component = componentOrOptions.component || 'default';
      options = componentOrOptions;
    }
  }
  let { file, cache } = options;

  if (file === undefined) {
    file = 'compose.yaml';
  }

  let metaConfig = await verifyIfMetaJsonExists(Deno.cwd());

  if (metaConfig === undefined) {
    return;
  }

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

export default function commandDocker(program: any) {
  const docker = program.command('docker');
  docker.description('docker commands');

  const dockerRegister = docker.command('register');
  dockerRegister.description('build and push docker image');
  dockerRegister.option('-a, --all', 'Build all docker images');
  dockerRegister.option(
    '-arg, --argument <arguments...>',
    'Build docker image with arguments'
  );
  dockerRegister.option('--amd64', 'build amd64 docker image');
  // add a --no-cache option with true as default
  dockerRegister.option('--no-cache', 'build docker image without cache');

  dockerRegister.option('--arm64', 'build arm64 docker image');
  dockerRegister.option('--component', 'component to build');
  dockerRegister.argument(
    '[component]',
    'component to build. It has priority over --component'
  );
  dockerRegister.action(dockerRegister);

  const dockerCompose = docker.command('compose');
  dockerCompose.description('docker compose commands');

  dockerCompose
    .command('up')
    .description('docker compose up')
    .argument('[component]', 'Component to build')
    .option('-f, --file [file]', 'docker compose file')
    .option('--force-recreate', 'force recreate')
    .option('-e, --envfile [file]', 'env filename')
    .option('-d, --detach', 'detach')
    .action(dockerComposeUp);

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
    .option('-f, --file [file]', 'docker compose file')
    .option('--cache', 'enable cache');
}
