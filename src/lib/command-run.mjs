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
// DEFINE IMAGE NAME
////////////////////////////////////////////////////////////////////////////////

async function defineImageName() {
  let { type, name } = metaConfig;

  const GCP_PROJECT_NAME = process.env.GCP_PROJECT_NAME;
  const ENV = process.env.ENV;

  let imageNamespace;

  switch (type) {
    case 'app': {
      imageNamespace = `gcr.io/${GCP_PROJECT_NAME}/${name}:${ENV}`;
      break;
    }
    case 'group_app': {
      let { group } = metaConfig;
      let { app } = group;
      imageNamespace = `gcr.io/${GCP_PROJECT_NAME}/${app}-${name}:${ENV}`;
      break;
    }
    case 'db': {
      imageNamespace = `gcr.io/${GCP_PROJECT_NAME}/db-${name}:${ENV}`;
      break;
    }

    case 'pgadmin': {
      imageNamespace = `gcr.io/${GCP_PROJECT_NAME}/db-${name}:${ENV}`;
      break;
    }

    default: {
      console.log('Not a cloud run app');
      throw new Error('Not a cloud run app');
    }
  }

  $.verbose = true;

  return imageNamespace;
}

////////////////////////////////////////////////////////////////////////////////
// DOCKER BUILD
////////////////////////////////////////////////////////////////////////////////

export async function buildDocketImage() {
  const ENV = process.env.ENV;

  let imageName = await defineImageName();

  cd(`${currentPath}/container`);

  const DOCKERFILE = `${currentPath}/container/Dockerfile.${ENV}`;
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
