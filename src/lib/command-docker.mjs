import { $, which, sleep, cd, fs } from 'zx';
import {
  detectScriptsDirectory,
  verifyIfMetaJsonExists,
  withMetaMatching,
} from '../utils/divers.mjs';
import _ from 'lodash';

////////////////////////////////////////////////////////////////////////////////
// MUTE BY DEFAULT
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

////////////////////////////////////////////////////////////////////////////////
// TERRAFORM DEFAULT CONFIG
////////////////////////////////////////////////////////////////////////////////

const terraformConfigDefault = {
  root: 'gcp',
  docker_build: true,
};

////////////////////////////////////////////////////////////////////////////////
// RUNNING COMMAND LOCATION
////////////////////////////////////////////////////////////////////////////////

let currentPath = await detectScriptsDirectory(process.cwd());

cd(currentPath);

////////////////////////////////////////////////////////////////////////////////
// CURRENT METADATA
////////////////////////////////////////////////////////////////////////////////

let metaConfig = await verifyIfMetaJsonExists(currentPath);

////////////////////////////////////////////////////////////////////////////////
// CONSTANTS
////////////////////////////////////////////////////////////////////////////////

const ENV = `${process.env.ENV}`;
const GCP_PROJECT_NAME = `${process.env.GCP_PROJECT_NAME}`;

////////////////////////////////////////////////////////////////////////////////
// GET LATEST IMAGE DIGEST
////////////////////////////////////////////////////////////////////////////////

export async function getDockerImageDigest(image) {
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

export async function dockerPushAll() {}

////////////////////////////////////////////////////////////////////////////////
// DOCKER PUSH UNIT
////////////////////////////////////////////////////////////////////////////////

export async function dockerPushUnit() {
  let { type, scope, docker } = metaConfig;

  let { root } = docker;

  let dockerFileName;

  let dockerfile;
  let dockerContext;

  if (scope === 'global') {
    dockerFileName = `Dockerfile`;
  } else {
    dockerFileName = `Dockerfile.${ENV}`;
  }

  if (type === 'container') {
    dockerfile = `${currentPath}/${dockerFileName}`;
    dockerContext = `${currentPath}`;
  } else if (root !== undefined) {
    dockerfile = `${currentPath}/${root}/${dockerFileName}`;
    dockerContext = `${currentPath}/${root}`;
    metaConfig = await verifyIfMetaJsonExists(dockerContext);
    cd(dockerContext);
  }

  $.verbose = true;

  let { image } = metaConfig.docker;

  if (scope !== 'global') {
    image = `${image}:${ENV}`;
  }

  await $`docker push ${image}`;
}

////////////////////////////////////////////////////////////////////////////////
// DOCKER BUILD
////////////////////////////////////////////////////////////////////////////////

export async function dockerBuildActionEntry(options) {
  const { all } = options;

  if (all) {
    await dockerBuildAll();
  } else {
    await dockerBuildUnit();
  }
}

////////////////////////////////////////////////////////////////////////////////
// DOCKER BUILD ALL
////////////////////////////////////////////////////////////////////////////////

export async function dockerBuildAll() {}

////////////////////////////////////////////////////////////////////////////////
// DOCKER BUILD UNIT
////////////////////////////////////////////////////////////////////////////////

export async function dockerBuildUnit() {
  let { type, scope, docker } = metaConfig;

  let { root } = docker;

  let dockerFileName;

  let dockerfile;
  let dockerContext;

  if (scope === 'global') {
    dockerFileName = `Dockerfile`;
  } else {
    dockerFileName = `Dockerfile.${ENV}`;
  }

  if (type === 'container') {
    dockerfile = `${currentPath}/${dockerFileName}`;
    dockerContext = `${currentPath}`;
  } else if (root !== undefined) {
    dockerfile = `${currentPath}/${root}/${dockerFileName}`;
    dockerContext = `${currentPath}/${root}`;
    metaConfig = await verifyIfMetaJsonExists(dockerContext);
    cd(dockerContext);
  }

  $.verbose = true;

  let { image } = metaConfig.docker;

  if (scope !== 'global') {
    image = `${image}:${ENV}`;
  }

  await $`docker build -t ${image} -f ${dockerfile} ${dockerContext}`;
}

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function commandDocker(program) {
  const docker = program.command('docker');

  const dockerBuild = docker.command('build');
  dockerBuild.description('Build docker image');
  dockerBuild.option('-a, --all', 'Build all docker images');
  dockerBuild.action(dockerBuildActionEntry);

  const dockerPush = docker.command('push');
  dockerPush.description('Push docker image');
  dockerPush.option('-a, --all', 'Push all docker images');
  dockerPush.action(dockerPushActionEntry);
}
