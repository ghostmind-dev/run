import { $, sleep, cd, fs, echo } from 'zx';
import { detectScriptsDirectory } from '../utils/divers.mjs';

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
// RUNNING COMMAND LOCATION
////////////////////////////////////////////////////////////////////////////////

const metaConfig = await fs.readJsonSync('meta.json');

////////////////////////////////////////////////////////////////////////////////
// DOCKER BUILD
////////////////////////////////////////////////////////////////////////////////

export async function buildDocketImage() {
  let { name } = metaConfig;
  const ENV = process.env.ENV;
  const GCP_PROJECT_NAME = process.env.GCP_PROJECT_NAME;

  cd(`${currentPath}/container`);
  const DOCKERFILE = `${currentPath}/container/Dockerfile.${ENV}`;
  const DOCKER_CONTEXT = `${currentPath}/container`;

  $.verbose = true;
  process.env.DOCKER_DEFAULT_PLATFORM = 'linux/amd64';
  await $`docker build -t gcr.io/${GCP_PROJECT_NAME}/${name}:${ENV} -f ${DOCKERFILE} ${DOCKER_CONTEXT}`;

  await sleep(1000);
}

////////////////////////////////////////////////////////////////////////////////
// DOCKER PUSH
////////////////////////////////////////////////////////////////////////////////

export async function pushDockerImage() {
  const ENV = process.env.ENV;
  const GCP_PROJECT_NAME = process.env.GCP_PROJECT_NAME;

  cd(`${currentPath}/container`);
  let { name } = metaConfig;

  $.verbose = true;

  await $`docker push gcr.io/${GCP_PROJECT_NAME}/${name}:${ENV}`;
}

////////////////////////////////////////////////////////////////////////////////
// DEPLOY RUN
////////////////////////////////////////////////////////////////////////////////

export async function getDockerImageDigest(path) {
  $.verbose = false;
  const ENV = process.env.ENV;
  const GCP_PROJECT_NAME = process.env.GCP_PROJECT_NAME;

  let { name } = metaConfig;

  if (path) {
    cd(path);
  }

  const imageName = `gcr.io/${GCP_PROJECT_NAME}/${name}:dev`;

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
