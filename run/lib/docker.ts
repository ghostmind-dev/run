/**
 * @fileoverview Docker operations module for @ghostmind/run
 *
 * This module provides comprehensive Docker and Docker Compose functionality,
 * including building images, managing containers, multi-architecture builds,
 * and registry operations.
 *
 * @module
 */

import { $, sleep, cd } from 'npm:zx@8.1.0';
import {
  verifyIfMetaJsonExists,
  recursiveDirectoriesDiscovery,
  setSecretsOnLocal,
  createUUID,
} from '../utils/divers.ts';
import _ from 'npm:lodash@4.17.21';
import { parse } from 'npm:yaml@2.4.2';
import { readFileSync } from 'node:fs';
import yaml from 'npm:yaml@2.4.2';
import type { CustomFunctionOptions } from './custom.ts';

////////////////////////////////////////////////////////////////////////////////
// MUTE BY DEFAULT
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

////////////////////////////////////////////////////////////////////////////////
// RUNNING COMMAND LOCATION
////////////////////////////////////////////////////////////////////////////////

let currentPath = Deno.cwd();

cd(currentPath);

////////////////////////////////////////////////////////////////////////////////
// INTERFACE
////////////////////////////////////////////////////////////////////////////////

/**
 * Options for Docker Compose build operations
 */
export interface DockerComposeBuildOptions {
  /** The component/service to build */
  component?: string;
  /** Path to the Docker Compose file */
  file?: string;
  /** Whether to use build cache */
  cache?: boolean;
}

/**
 * Docker Compose build options with component specification
 */
export interface DockerComposeBuildOptionsComponent
  extends DockerComposeBuildOptions {
  /** The component to build */
  component?: string;
}

/**
 * Options for Docker Compose up operations
 */
export interface DockerComposeUpOptions {
  /** Whether to build images before starting */
  build?: boolean;
  /** Whether to force recreate containers */
  forceRecreate?: boolean;
  /** Whether to run in detached mode */
  detach?: boolean;
  /** Whether to start all services */
  all?: boolean;
  /** Service group to start */
  group?: string;
  /** Services to exclude from startup */
  exclude?: string[];
  /** Environment file to use */
  envfile?: string;
  /** Environment variables to set (key=value format) */
  env?: string[];
}

/**
 * Docker Compose up options with component specification
 */
export interface DockerComposeUpOptionsComponent
  extends DockerComposeUpOptions {
  /** The component to start */
  component?: string;
}

/**
 * Options for Docker image registration (build and push)
 */
export interface DockerRegisterOptions {
  /** Whether to build for all architectures */
  all?: boolean;
  /** Whether to build for AMD64 architecture */
  amd64?: boolean;
  /** Whether to use build cache */
  cache?: boolean;
  /** Whether to build for ARM64 architecture */
  arm64?: boolean;
  /** Whether to use cloud build */
  cloud?: boolean;
  /** The component to build */
  component?: string;
  /** Machine type for cloud builds */
  machine_type?: string;
  /** Build arguments to pass to Docker */
  build_args?: string[];
  /** Additional tags to apply */
  tags?: string[];
  /** Tag modifier to append */
  modifier?: string;
  /** Whether to skip automatic tag modifiers */
  skip_tag_modifiers?: boolean;
}

////////////////////////////////////////////////////////////////////////////////
// GET DOCKERFILE NAME AND IMAGE NAME
////////////////////////////////////////////////////////////////////////////////

/**
 * Get Docker configuration details for a component
 *
 * This function resolves the Dockerfile path, Docker context, image name,
 * and tags to push based on the component configuration in meta.json.
 *
 * @param component - The component name (defaults to 'default')
 * @param modifier - Optional tag modifier to append to image name
 * @param skip_tag_modifiers - Whether to skip automatic tag modifiers
 * @returns Promise resolving to Docker configuration details
 *
 * @example
 * ```typescript
 * const config = await getDockerfileAndImageName('web');
 * console.log(config.image); // e.g., 'myapp/web:dev'
 * console.log(config.dockerfile); // e.g., '/path/to/Dockerfile.dev'
 * ```
 */
export async function getDockerfileAndImageName(
  component: any,
  modifier?: string,
  skip_tag_modifiers?: boolean
): Promise<{
  dockerfile: string;
  dockerContext: string;
  image: string;
  tagsToPush: string[][];
}> {
  $.verbose = true;
  const ENV = `${Deno.env.get('ENVIRONMENT')}`;

  let currentPath = Deno.cwd();

  const metaConfig = await verifyIfMetaJsonExists(currentPath);

  let docker = metaConfig?.docker;

  component = component || 'default';

  let { root, image, env_based, context_dir, tag_modifiers } =
    docker[component];

  if (!modifier) {
    image = `${image}:${ENV}`;
  } else {
    image = `${image}:${ENV}-${modifier}`;
  }

  let tagsToPush = [];
  tagsToPush.push([`${image}`]);
  if (tag_modifiers && !skip_tag_modifiers) {
    tag_modifiers.map((tag: any) => {
      if (tag === 'undefined' || tag === null || tag === undefined) {
        // go to next tag
        return;
      }

      tagsToPush.push([`${image}-${tag}`]);
    });
  }

  image = tagsToPush[0][0];

  let dockerFileName;
  let dockerfile;
  let dockerContext;

  if (env_based === false) {
    dockerFileName = `Dockerfile`;
  } else {
    dockerFileName = `Dockerfile.${ENV}`;
  }

  dockerfile = `${currentPath}/${root}/${dockerFileName}`;

  if (context_dir === undefined) {
    dockerContext = `${currentPath}/${root}`;
  } else {
    dockerContext = `${currentPath}/${context_dir}`;
  }

  // $.verbose = true;

  // need other solution to get the project name
  const { name: PROJECT_NAME } = metaConfig || { name: '' };

  return { dockerfile, dockerContext, image, tagsToPush };
}

////////////////////////////////////////////////////////////////////////////////
// GET LATEST IMAGE DIGEST
////////////////////////////////////////////////////////////////////////////////

/**
 * Get the digest of a Docker image for a specific architecture
 *
 * This function retrieves the SHA256 digest of a Docker image for the
 * specified architecture, useful for pinning exact image versions.
 *
 * @param arch - Target architecture ('amd64', 'arm64', or other)
 * @param component - The component name
 * @param modifier - Optional tag modifier
 * @returns Promise resolving to the image digest string
 *
 * @example
 * ```typescript
 * const digest = await getDockerImageDigest('amd64', 'web');
 * console.log(digest); // e.g., 'myapp/web@sha256:abc123...'
 * ```
 */
export async function getDockerImageDigest(
  arch: any,
  component: any,
  modifier?: string
): Promise<string> {
  let { image } = await getDockerfileAndImageName(component, modifier);

  // rempcve the tag from the image name

  if (arch === 'amd64') {
    $.verbose = false;

    const imageDigestRaw =
      await $`docker manifest inspect ${image}-amd64 --verbose`;

    const jsonManifest = JSON.parse(`${imageDigestRaw}`);

    // verify jsonManifest is an array

    let arrayManifest = Array.isArray(jsonManifest)
      ? jsonManifest
      : [jsonManifest];

    const digest = arrayManifest.find(
      (manifest: any) => manifest.Descriptor.platform.architecture === 'amd64'
    )?.Descriptor.digest;

    image = image.split(':')[0];

    return `${image}@${digest}`;
  } else if (arch === 'arm64') {
    $.verbose = false;

    const imageDigestRaw =
      await $`docker manifest inspect ${image}-arm64 --verbose`;

    const jsonManifest = JSON.parse(`${imageDigestRaw}`);

    // find manifest with platform amd64

    let arrayManifest = Array.isArray(jsonManifest)
      ? jsonManifest
      : [jsonManifest];

    const digest = arrayManifest.find(
      (manifest: any) => manifest.Descriptor.platform.architecture === 'arm64'
    )?.Descriptor.digest;

    image = image.split(':')[0];
    return `${image}@${digest}`;
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
/**
 * Build and push Docker images to a registry
 *
 * This function builds Docker images for multiple architectures and pushes them
 * to a container registry. It supports multi-arch builds, caching, and cloud builds.
 *
 * @param componentOrOptions - Either the component name or register options
 * @param options - Additional register options (when first param is component name)
 *
 * @example
 * ```typescript
 * // Register default component for all architectures
 * await dockerRegister('web', { all: true });
 *
 * // Register with specific architecture
 * await dockerRegister({ component: 'api', amd64: true, cache: true });
 *
 * // Register with custom tags and build args
 * await dockerRegister('worker', {
 *   tags: ['latest', 'v1.0.0'],
 *   build_args: ['NODE_ENV=production']
 * });
 * ```
 */
export async function dockerRegister(
  componentOrOptions?: string | DockerRegisterOptions | CustomFunctionOptions,
  options?: DockerRegisterOptions
) {
  // verify id componentOrOptions is a string or an object

  if (typeof componentOrOptions === 'string') {
    options = options || {};
    options.component = componentOrOptions;
  } else if (componentOrOptions === undefined) {
    options = options || {};
  } else {
    options = componentOrOptions || {};
  }

  const {
    amd64,
    arm64,
    build_args,
    cache,
    cloud,
    machine_type,
    modifier,
    skip_tag_modifiers,
  } = options;

  const { dockerfile, dockerContext, image, tagsToPush } =
    await getDockerfileAndImageName(
      options.component,
      modifier,
      skip_tag_modifiers
    );

  Deno.env.set('BUILDX_NO_DEFAULT_ATTESTATIONS', '1');

  // verify the current architecture

  if (!amd64 && !arm64) {
    console.log('No architecture specified, using current architecture');
    return;
  }

  if (amd64 && arm64) {
    console.log('Only one architecture can be specified');
    return;
  }

  // Determine the machine architecture

  if (cloud && amd64 && !arm64) {
    await $`rm -rf /tmp/cloud_build.yaml`;

    let machineType = machine_type || 'e2-highcpu-32';

    // remove value of currentPath from dockerfile and dockerContext
    let dockerfilePath = dockerfile.replace(`${currentPath}/`, '');
    let dockerContextPath = dockerContext.replace(`${currentPath}/`, '');

    let dockerBuildCommand = [
      'docker',
      'buildx',
      'build',
      '--platform=linux/amd64',
      `--file=${dockerfilePath}`,
      '--push',
    ];

    if (build_args) {
      build_args.map((arg: any) => {
        dockerBuildCommand.push(`--build-arg=${arg}`);
      });
    }

    for (let tag of tagsToPush) {
      dockerBuildCommand.push(`--tag=${tag[0]}`);
      dockerBuildCommand.push(`--tag=${tag[0]}-amd64`);
    }

    dockerBuildCommand.push(dockerContextPath);

    let manifestAmenTags = [];

    let combinedImage = tagsToPush[0][0];

    for (const [fullImage, archImage] of tagsToPush) {
      try {
        await $`docker manifest inspect ${fullImage}-arm64`;
        manifestAmenTags.push(fullImage);
        manifestAmenTags.push(`${fullImage}-arm64`);
        manifestAmenTags.push(`${fullImage}-amd64`);
      } catch (e) {
        manifestAmenTags.push(fullImage);
        manifestAmenTags.push(`${fullImage}-amd64`);
      }
    }

    const dockerManifestCreateCommand = [
      'docker',
      'manifest',
      'create',
      '--amend',
      ...manifestAmenTags,
    ];

    const dockerManifestPushCommand = [
      'docker',
      'manifest',
      'push',
      combinedImage,
    ];

    const cloudBuildConfig = {
      options: {
        env: ['BUILDX_NO_DEFAULT_ATTESTATIONS=1'],
      },
      steps: [
        {
          name: 'gcr.io/cloud-builders/docker',
          script: 'docker buildx create --use',
        },
        {
          name: 'gcr.io/cloud-builders/docker',
          script: dockerBuildCommand.join(' '),
        },
        {
          name: 'gcr.io/cloud-builders/docker',
          script: dockerManifestCreateCommand.join(' '),
        },
        {
          name: 'gcr.io/cloud-builders/docker',
          script: dockerManifestPushCommand.join(' '),
        },
      ],
    };

    await Deno.writeTextFile(
      '/tmp/cloud_build.yaml',
      JSON.stringify(cloudBuildConfig)
    );

    await $`gcloud builds submit --config=/tmp/cloud_build.yaml --machine-type=${machineType}`;

    // ... existing code ...
  }
  if (cloud && !amd64 && arm64) {
    await $`rm -rf /tmp/cloud_build.yaml`;

    let machineType = machine_type || 'e2-highcpu-32';

    // remove value of currentPath from dockerfile and dockerContext
    let dockerfilePath = dockerfile.replace(`${currentPath}/`, '');
    let dockerContextPath = dockerContext.replace(`${currentPath}/`, '');

    let dockerBuildCommand = [
      'docker',
      'buildx',
      'build',
      '--platform=linux/arm64',
      `--file=${dockerfilePath}`,
      '--push',
    ];

    if (build_args) {
      build_args.map((arg: any) => {
        dockerBuildCommand.push(`--build-arg=${arg}`);
      });
    }

    for (let tag of tagsToPush) {
      dockerBuildCommand.push(`--tag=${tag[0]}`);
      dockerBuildCommand.push(`--tag=${tag[0]}-arm64`);
    }

    dockerBuildCommand.push(dockerContextPath);

    let manifestAmenTags = [];

    let combinedImage = tagsToPush[0][0];

    for (const [fullImage, archImage] of tagsToPush) {
      try {
        await $`docker manifest inspect ${fullImage}-amd64`;
        manifestAmenTags.push(fullImage);
        manifestAmenTags.push(`${fullImage}-arm64`);
        manifestAmenTags.push(`${fullImage}-amd64`);
      } catch (e) {
        manifestAmenTags.push(fullImage);
        manifestAmenTags.push(`${fullImage}-arm64`);
      }
    }

    const dockerManifestCreateCommand = [
      'docker',
      'manifest',
      'create',
      '--amend',
      ...manifestAmenTags,
    ];

    const dockerManifestPushCommand = [
      'docker',
      'manifest',
      'push',
      combinedImage,
    ];

    const cloudBuildConfig = {
      options: {
        env: ['BUILDX_NO_DEFAULT_ATTESTATIONS=1'],
      },
      steps: [
        {
          name: 'gcr.io/cloud-builders/docker',
          script: 'docker buildx create --use',
        },
        {
          name: 'gcr.io/cloud-builders/docker',
          script: dockerBuildCommand.join(' '),
        },
        {
          name: 'gcr.io/cloud-builders/docker',
          script: dockerManifestCreateCommand.join(' '),
        },
        {
          name: 'gcr.io/cloud-builders/docker',
          script: dockerManifestPushCommand.join(' '),
        },
      ],
    };

    await Deno.writeTextFile(
      '/tmp/cloud_build.yaml',
      JSON.stringify(cloudBuildConfig)
    );

    await $`gcloud builds submit --config=/tmp/cloud_build.yaml --machine-type=${machineType}`;

    // ... existing code ...
  }

  if (amd64 && !cloud) {
    // Ensure a buildx builder instance exists and is bootstrapped
    try {
      $.verbose = false;
      await `docker buildx inspect default`;
      await $`docker buildx use default`;
    } catch {
      $.verbose = true;
      // it should terminate
      console.log('Default builder not found');
      return;
    }

    let baseCommand = [
      'docker',
      'buildx',
      'build',
      '--platform=linux/amd64',
      `--file=${dockerfile}`,
      '--push',
    ];

    if (cache === undefined) {
      baseCommand.push('--no-cache');
    }

    if (build_args) {
      build_args.map((arg: any) => {
        baseCommand.push(`--build-arg=${arg}`);
      });
    }

    for (let tag of tagsToPush) {
      baseCommand.push(`--tag=${tag[0]}`);
      baseCommand.push(`--tag=${tag[0]}-amd64`);
    }

    baseCommand.push(dockerContext);

    await $`${baseCommand}`;

    let manifestAmenTags = [];

    let combinedImage = tagsToPush[0][0];

    for (const [fullImage, archImage] of tagsToPush) {
      try {
        await $`docker manifest inspect ${fullImage}-arm64`;
        manifestAmenTags.push(fullImage);
        manifestAmenTags.push(`${fullImage}-arm64`);
        manifestAmenTags.push(`${fullImage}-amd64`);
      } catch (e) {
        manifestAmenTags.push(fullImage);
        manifestAmenTags.push(`${fullImage}-amd64`);
      }
    }
    const dockerManifestCreateCommand = [
      'docker',
      'manifest',
      'create',
      '--amend',
      ...manifestAmenTags,
    ];

    const dockerManifestPushCommand = [
      'docker',
      'manifest',
      'push',
      combinedImage,
    ];

    $.verbose = true;
    await $`${dockerManifestCreateCommand}`;
    await $`${dockerManifestPushCommand}`;

    // $.verbose = false;
  }

  if (arm64 && !cloud) {
    // Ensure a buildx builder instance exists and is bootstrapped
    try {
      $.verbose = false;
      await `docker buildx inspect default`;
      await $`docker buildx use default`;
    } catch {
      $.verbose = true;
      // it should terminate
      console.log('Default builder not found');
      return;
    }

    let baseCommand = [
      'docker',
      'buildx',
      'build',
      '--platform=linux/arm64',
      `--file=${dockerfile}`,
      '--push',
    ];

    if (cache === undefined) {
      baseCommand.push('--no-cache');
    }

    if (build_args) {
      build_args.map((arg: any) => {
        baseCommand.push(`--build-arg=${arg}`);
      });
    }

    for (let tag of tagsToPush) {
      baseCommand.push(`--tag=${tag[0]}`);
      baseCommand.push(`--tag=${tag[0]}-arm64`);
    }

    baseCommand.push(dockerContext);

    await $`${baseCommand}`;

    let manifestAmenTags = [];

    let combinedImage = tagsToPush[0][0];

    for (const [fullImage, archImage] of tagsToPush) {
      try {
        await $`docker manifest inspect ${fullImage}-amd64`;
        manifestAmenTags.push(fullImage);
        manifestAmenTags.push(`${fullImage}-arm64`);
        manifestAmenTags.push(`${fullImage}-amd64`);
      } catch (e) {
        manifestAmenTags.push(fullImage);
        manifestAmenTags.push(`${fullImage}-arm64`);
      }
    }
    const dockerManifestCreateCommand = [
      'docker',
      'manifest',
      'create',
      '--amend',
      ...manifestAmenTags,
    ];

    const dockerManifestPushCommand = [
      'docker',
      'manifest',
      'push',
      combinedImage,
    ];

    $.verbose = true;
    await $`${dockerManifestCreateCommand}`;
    await $`${dockerManifestPushCommand}`;

    // $.verbose = false;
  }
}

////////////////////////////////////////////////////////////////////////////////
// DOCKER COMPOSE UP
////////////////////////////////////////////////////////////////////////////////

/**
 * Start Docker Compose services
 *
 * This function starts Docker Compose services for the specified component,
 * with options for building, recreating, running in detached mode, and setting
 * environment variables or files.
 *
 * @param componentOrOptions - Either the component name or up options
 * @param options - Additional up options (when first param is component name)
 *
 * @example
 * ```typescript
 * // Start default services
 * await dockerComposeUp();
 *
 * // Start specific component with build
 * await dockerComposeUp('web', { build: true, detach: true });
 *
 * // Start with environment variables
 * await dockerComposeUp('api', {
 *   env: ['NODE_ENV=production', 'DEBUG=true'],
 *   detach: true
 * });
 *
 * // Start with environment file
 * await dockerComposeUp('api', {
 *   envfile: '.env.production',
 *   build: true
 * });
 *
 * // Start with options object
 * await dockerComposeUp({
 *   component: 'api',
 *   build: true,
 *   forceRecreate: true,
 *   env: ['API_KEY=secret123']
 * });
 * ```
 */
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
      options = componentOrOptions;
    }
  }

  let { forceRecreate, detach, build, envfile, env } = options || {};

  let filesToUp = [];

  let metaConfig = await verifyIfMetaJsonExists(Deno.cwd());

  if (metaConfig === undefined) {
    return;
  }

  let { compose } = metaConfig;
  if (compose === undefined) {
    return;
  }
  if (compose === undefined) {
    return;
  }
  let filename = compose[component].filename || 'compose.yaml';
  let { root, use_project_env } = compose[component];

  // Check if we should use PROJECT env variable (default to true)
  const shouldUseProjectEnv = use_project_env !== false;
  const PROJECT = Deno.env.get('PROJECT');

  filesToUp.push('-f');
  filesToUp.push(`${currentPath}/${root}/${filename}`);

  if (filesToUp.length === 0) {
    return;
  }

  const commandDown = ['docker', 'compose'];

  // Add project name if conditions are met
  if (shouldUseProjectEnv && PROJECT) {
    commandDown.push('-p', PROJECT);
  }

  commandDown.push(...filesToUp, 'down');

  const baseCommand = ['docker', 'compose'];

  // Add project name if conditions are met
  if (shouldUseProjectEnv && PROJECT) {
    baseCommand.push('-p', PROJECT);
  }

  baseCommand.push(...filesToUp);

  // Handle environment file or create temporary one for env variables
  let tempEnvFile: string | undefined;

  if (env && env.length > 0) {
    // Create a temporary environment file with the provided variables
    const tempFileName = `compose-env-${createUUID()}.env`;
    tempEnvFile = `/tmp/${tempFileName}`;

    const envContent = env.join('\n') + '\n';
    await Deno.writeTextFile(tempEnvFile, envContent);

    baseCommand.push('--env-file');
    baseCommand.push(tempEnvFile);
  } else if (envfile) {
    // Use the provided environment file
    baseCommand.push('--env-file');
    baseCommand.push(envfile);
  }

  baseCommand.push('up');

  if (forceRecreate) {
    baseCommand.push('--force-recreate');
  }
  if (detach) {
    baseCommand.push('--detach');
  }
  if (build) {
    baseCommand.push('--build');
  }

  $.verbose = true;

  await $`${commandDown}`;

  try {
    await $`${baseCommand}`;
  } finally {
    // Clean up temporary environment file if created
    if (tempEnvFile) {
      try {
        await Deno.remove(tempEnvFile);
      } catch (error) {
        // Ignore errors when cleaning up temp file
        console.warn(
          `Warning: Could not remove temporary file ${tempEnvFile}:`,
          error instanceof Error ? error.message : String(error)
        );
      }
    }
  }
}

////////////////////////////////////////////////////////////////////////////////
// DOCKER COMPOSE DOWN
////////////////////////////////////////////////////////////////////////////////

/**
 * Stop and remove Docker Compose services
 *
 * This function stops and removes Docker Compose services for the specified
 * component, cleaning up containers, networks, and volumes.
 *
 * @param component - The component name (defaults to 'default')
 * @param options - Configuration options for the down operation
 * @param options.forceRecreate - Whether to force recreate on next up
 * @param options.all - Whether to stop all services
 *
 * @example
 * ```typescript
 * // Stop default component services
 * await dockerComposeDown();
 *
 * // Stop specific component
 * await dockerComposeDown('web', { forceRecreate: true });
 * ```
 */
export async function dockerComposeDown(component: any, options: any) {
  let { forceRecreate, all } = options;

  let filesToDown: string[] = [];

  if (component === undefined) {
    component = 'default';
  }

  let metaConfig = await verifyIfMetaJsonExists(Deno.cwd());

  if (metaConfig === undefined) {
    return;
  }

  let { compose } = metaConfig;

  if (compose === undefined) {
    return;
  }
  let filename = compose[component].filename || 'compose.yaml';
  let { root, use_project_env } = compose[component];

  // Check if we should use PROJECT env variable (default to true)
  const shouldUseProjectEnv = use_project_env !== false;
  const PROJECT = Deno.env.get('PROJECT');

  filesToDown.push('-f');
  filesToDown.push(`${root}/${filename}`);

  if (filesToDown.length === 0) {
    return;
  }

  const baseCommand = ['docker', 'compose'];

  // Add project name if conditions are met
  if (shouldUseProjectEnv && PROJECT) {
    baseCommand.push('-p', PROJECT);
  }

  baseCommand.push(...filesToDown, 'down');

  await $`${baseCommand}`;
}

////////////////////////////////////////////////////////////////////////////////
// DOCKER COMPOSE EXEC
////////////////////////////////////////////////////////////////////////////////

/**
 * Options for Docker Compose exec operations
 */
export interface DockerComposeExecOptions {
  /** The command/instructions to execute */
  instructions: string;
  /** Specific container to execute in */
  container?: string;
  /** Component to execute in */
  component?: string;
  /** Path to Docker Compose file */
  file?: string;
  /** Whether to force recreate containers */
  forceRecreate?: boolean;
  /** Environment file to use */
  envfile?: string;
}

/**
 * Docker Compose exec options with component specification
 */
export interface DockerComposeExecOptionsComponent
  extends DockerComposeExecOptions {
  /** The command/instructions to execute */
  instructions: string;
}

/**
 * Execute commands in Docker Compose containers
 *
 * This function executes commands inside running Docker Compose containers,
 * with support for targeting specific containers or components.
 *
 * @param instructionsOrOptions - Either the command string or exec options
 * @param options - Additional exec options (when first param is command string)
 *
 * @example
 * ```typescript
 * // Execute a simple command
 * await dockerComposeExec('ls -la');
 *
 * // Execute in specific container
 * await dockerComposeExec('npm test', {
 *   container: 'web',
 *   component: 'frontend'
 * });
 *
 * // Execute with options object
 * await dockerComposeExec({
 *   instructions: 'python manage.py migrate',
 *   component: 'api',
 *   envfile: '.env.local'
 * });
 * ```
 */
export async function dockerComposeExec(
  instructionsOrOptions: string | DockerComposeExecOptionsComponent,
  options?: DockerComposeExecOptions
) {
  let instructions: string;

  if (typeof instructionsOrOptions === 'string') {
    instructions = instructionsOrOptions;
  } else {
    instructions = instructionsOrOptions.instructions;
  }

  let { file, forceRecreate, container, component } = options || {};

  if (file === undefined) {
    file = 'compose.yaml';
  }
  let metaConfig = await verifyIfMetaJsonExists(Deno.cwd());

  if (metaConfig === undefined) {
    return;
  }
  let { compose } = metaConfig;

  component = component || 'default';

  let { root, use_project_env } = compose[component];

  // Check if we should use PROJECT env variable (default to true)
  const shouldUseProjectEnv = use_project_env !== false;
  const PROJECT = Deno.env.get('PROJECT');

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
  const baseCommand = ['docker', 'compose'];

  // Add project name if conditions are met
  if (shouldUseProjectEnv && PROJECT) {
    baseCommand.push('-p', PROJECT);
  }

  baseCommand.push('-f', `${root}/${file}`, 'exec', container, '/bin/bash', '-c', instructions);

  if (forceRecreate) {
    baseCommand.push('--force-recreate');
  }
  $.verbose = true;
  await $`${baseCommand}`;
}

////////////////////////////////////////////////////////////////////////////////
// DOCKER COMPOSE BUILD
////////////////////////////////////////////////////////////////////////////////

/**
 * Build Docker Compose services
 *
 * This function builds Docker Compose services based on the specified
 * component configuration and build options.
 *
 * @param componentOrOptions - Either the component name or build options
 * @param options - Additional build configuration options
 *
 * @example
 * ```typescript
 * // Build with cache disabled
 * await dockerComposeBuild('web-service', { cache: false });
 *
 * // Build specific component with custom file
 * await dockerComposeBuild({
 *   component: 'backend',
 *   file: 'docker-compose.prod.yml'
 * });
 * ```
 */
export async function dockerComposeBuild(
  componentOrOptions: DockerComposeBuildOptionsComponent,
  options?: DockerComposeBuildOptions
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

  let { root, use_project_env } = compose[component];

  // Check if we should use PROJECT env variable (default to true)
  const shouldUseProjectEnv = use_project_env !== false;
  const PROJECT = Deno.env.get('PROJECT');

  const baseCommand = ['docker', 'compose'];

  // Add project name if conditions are met
  if (shouldUseProjectEnv && PROJECT) {
    baseCommand.push('-p', PROJECT);
  }

  baseCommand.push('-f', `${root}/${file}`, 'build');

  if (cache === undefined) {
    baseCommand.push('--no-cache');
  }

  $.verbose = true;

  await $`${baseCommand}`;
}

////////////////////////////////////////////////////////////////////////////////
// DOCKER COMPOSE LOGS
////////////////////////////////////////////////////////////////////////////////

/**
 * View logs from Docker Compose services
 *
 * This function displays logs from Docker Compose services for the specified
 * component, useful for debugging and monitoring container output.
 *
 * @param component - The component name (defaults to 'default')
 * @param options - Configuration options for log viewing
 *
 * @example
 * ```typescript
 * // View logs for default component
 * await dockerComposeLogs();
 *
 * // View logs for specific component
 * await dockerComposeLogs('api', {});
 * ```
 */
export async function dockerComposeLogs(component: any, options: any) {
  //  get meta config
  let metaConfig = await verifyIfMetaJsonExists(Deno.cwd());
  if (metaConfig === undefined) {
    return;
  }
  let { compose } = metaConfig;

  if (!compose) {
    return;
  }

  if (component === undefined) {
    component = 'default';
  }

  let { root, use_project_env } = compose[component];

  // Check if we should use PROJECT env variable (default to true)
  const shouldUseProjectEnv = use_project_env !== false;
  const PROJECT = Deno.env.get('PROJECT');

  let filename = compose[component].filename || 'compose.yaml';

  const baseCommand = ['docker', 'compose'];

  // Add project name if conditions are met
  if (shouldUseProjectEnv && PROJECT) {
    baseCommand.push('-p', PROJECT);
  }

  baseCommand.push('-f', `${root}/${filename}`, 'logs');

  $.verbose = true;

  await $`${baseCommand}`;
}

////////////////////////////////////////////////////////////////////////////////
// DOCKER BUILD
////////////////////////////////////////////////////////////////////////////////

/**
 * Options for Docker build operations
 */
export interface DockerBuildOptions {
  /** The component to build */
  component?: string;
}

/**
 * Build a Docker image for the specified component
 *
 * This function builds a Docker image using the configuration from meta.json.
 * It automatically determines the Dockerfile path, image name, and build context.
 *
 * @param componentOrOptions - Either the component name or build options
 * @param options - Additional build options (when first param is component name)
 *
 * @example
 * ```typescript
 * // Build the default component
 * await dockerBuild();
 *
 * // Build a specific component
 * await dockerBuild("web-service");
 *
 * // Build with options
 * await dockerBuild({ component: "api" });
 * ```
 */
export async function dockerBuild(
  componentOrOptions?: string | DockerBuildOptions,
  options?: DockerBuildOptions
) {
  let component: string;

  // Handle different input types
  if (typeof componentOrOptions === 'string') {
    component = componentOrOptions;
    options = options || {};
  } else {
    options = componentOrOptions || {};
    component = options.component || 'default';
  }

  const { dockerfile, dockerContext, image } = await getDockerfileAndImageName(
    component
  );

  const baseCommand = [
    'docker',
    'build',
    `--file=${dockerfile}`,
    `--tag=${image}`,
    dockerContext,
  ];

  $.verbose = true;
  await $`${baseCommand}`;
}

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function commandDocker(program: any) {
  const docker = program.command('docker');
  docker.description('docker commands');

  docker
    .command('register')
    .description('build and push docker image with buildx')
    .option('-a, --all', 'Build all docker images')
    .option('--build-args <build_args...>', 'build arguments')
    .option('--amd64', 'build amd64 docker image')
    .option('--arm64', 'build arm64 docker image')
    .option('--no-cache', 'build docker image without cache')
    .option('--cloud', 'build docker image withh gcloud builds')
    .option('--machine-type <machine_type>', 'machine type')
    .option('--modifier <modifier>', 'image name modifier')
    .option('--skip-tag-modifiers', 'skip tag modifiers')
    .option('--component', 'component to build')
    .option('-t, --tags <tags...>', 'tags')
    .argument(
      '[component]',
      'component to build. It has priority over --component'
    )
    .action(dockerRegister);

  docker
    .command('build')
    .description('docker build commands')
    .argument('[component]', 'component to build')
    .action(dockerBuild);

  const dockerCompose = docker.command('compose');
  dockerCompose.description('docker compose commands');

  dockerCompose
    .command('up')
    .description('docker compose up')
    .argument('[component]', 'Component to build')
    .option('--build', 'build before up')
    .option('--force-recreate', 'force recreate')
    .option('--envfile [file]', 'environment file to use')
    .option('--env <env...>', 'environment variables to set (KEY=VALUE format)')
    .option('-d, --detach', 'detach')
    .action(dockerComposeUp);

  dockerCompose
    .command('down')
    .description('docker compose down')
    .action(dockerComposeDown)
    .argument('[component]', 'Component to build')
    .option('--force-recreate', 'force recreate');

  dockerCompose
    .command('exec')
    .description('docker compose exec')
    .action(dockerComposeExec)
    .argument('[instructions]', 'Commands to run')
    .option('--container <container>', 'Container to exec into')
    .option('--component <component>', 'Component to exec into')
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

  dockerCompose
    .command('logs')
    .argument('[component]', 'component to logs')
    .description('docker compose logs')
    .action(dockerComposeLogs);
}
