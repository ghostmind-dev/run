import { $, sleep, cd, fs, echo } from 'zx';
import {
  detectScriptsDirectory,
  verifyIfMetaJsonExists,
} from '../utils/divers.mjs';

////////////////////////////////////////////////////////////////////////////////
// MUTE BY DEFAULT
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

////////////////////////////////////////////////////////////////////////////////
// ACTION DEFAULT CONFIG
////////////////////////////////////////////////////////////////////////////////

const clusterConfigDefault = {};

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
// DEFINE IMAGE NAME
////////////////////////////////////////////////////////////////////////////////

async function defineImageName() {
  const metaConfig = await fs.readJsonSync('meta.json');
  let { scope, name } = metaConfig;

  const GCP_PROJECT_NAME = process.env.GCP_PROJECT_NAME;
  const ENV = process.env.ENV;

  let imageNamespace;

  if (scope === 'global') {
    imageNamespace = `gcr.io/${GCP_PROJECT_NAME}/${name}`;
  } else {
    imageNamespace = `gcr.io/${GCP_PROJECT_NAME}/${name}:${ENV}`;
  }

  return imageNamespace;
}

////////////////////////////////////////////////////////////////////////////////
// DOCKER BUILD
////////////////////////////////////////////////////////////////////////////////

export async function buildDocketImage() {
  const ENV = process.env.ENV;

  const metaConfig = await fs.readJsonSync('meta.json');
  const { scope } = metaConfig;

  let imageName = await defineImageName();

  let DOCKERFILE;

  cd(`${currentPath}/container`);

  if (scope === 'global') {
    DOCKERFILE = `${currentPath}/container/Dockerfile`;
  } else {
    DOCKERFILE = `${currentPath}/container/Dockerfile.${ENV}`;
  }
  const DOCKER_CONTEXT = `${currentPath}/container`;

  $.verbose = true;

  process.env.DOCKER_DEFAULT_PLATFORM = 'linux/amd64';

  await $`docker build -t ${imageName} -f ${DOCKERFILE} ${DOCKER_CONTEXT}`;

  await sleep(1000);
}

////////////////////////////////////////////////////////////////////////////////
// DOCKER PUSH
////////////////////////////////////////////////////////////////////////////////

export async function pushDockerImage() {
  let imageName = await defineImageName();
  const metaConfig = await fs.readJsonSync('meta.json');

  cd(`${currentPath}/container`);
  let { name, type } = metaConfig;

  $.verbose = true;

  await $`docker push ${imageName}`;
}

////////////////////////////////////////////////////////////////////////////////
// DEPLOY RUN
////////////////////////////////////////////////////////////////////////////////

export async function getDockerImageDigest(path) {
  $.verbose = false;
  const metaConfig = await fs.readJsonSync('meta.json');
  let { name, type } = metaConfig;

  if (path) {
    cd(path);
  }

  let imageName = await defineImageName();

  const imageDigestRaw =
    await $`docker inspect --format='{{index .RepoDigests 0}}' ${imageName}`;

  //  remove /n from the end of the string
  const imageDigest = imageDigestRaw.stdout.slice(0, -1);
  return imageDigest;
}
////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function run(program) {
  const cr = program.command('cr');
  cr.description('manage gcp cloud run');

  const build = cr.command('build');
  const push = cr.command('push');

  build.action(buildDocketImage);
  push.action(pushDockerImage);
}
