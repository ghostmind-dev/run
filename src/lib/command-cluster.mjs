import { $, sleep, cd, fs } from 'zx';
import { config } from 'dotenv';
import {
  detectScriptsDirectory,
  getDirectories,
  verifyIfMetaJsonExists,
  withMetaMatching,
} from '../utils/divers.mjs';
import { vaultKvCertsToVault, vaultKvCertsToLocal } from './command-vault.mjs';
import { actionRunLocal } from './command-action.mjs';

import _ from 'lodash';

////////////////////////////////////////////////////////////////////////////////
// MUTE BY DEFAULT
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

////////////////////////////////////////////////////////////////////////////////
// CONSTANTS
////////////////////////////////////////////////////////////////////////////////

const ENV = process.env.ENV;
const SRC = process.env.SRC;

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
// CHECK IF POD IF READY
////////////////////////////////////////////////////////////////////////////////

export async function verifyIfPodReady(app, namespace) {
  $.verbose = false;

  // to test this funciton, trigger this command
  // kubectl scale --replicas=0 deployment/
  // kubectl scale --replicas=1 deployment/

  let checkPodStatus =
    await $`kubectl get pods -l app=${app} -n ${namespace} -o 'jsonpath={..status.conditions[?(@.type=="Ready")].status}'`;

  while (`${checkPodStatus}` !== 'True') {
    console.log(`waiting for ${app} pod to be ready`);
    await sleep(5000);
    checkPodStatus =
      await $`kubectl get pods -l app=${app} -n ${namespace} -o 'jsonpath={..status.conditions[?(@.type=="Ready")].status}'`;
  }

  return;
}

////////////////////////////////////////////////////////////////////////////////
// VERIFY IF CLUSTER RELATED DIRECTORY
////////////////////////////////////////////////////////////////////////////////

export async function verifyClusterDirectory() {
  const metaConfig = await fs.readJsonSync('meta.json');
  let { type } = metaConfig;
  if (type === 'cluster' || type === 'cluster_app') {
    if (type === 'cluster_app') {
      config({ path: `../../.env` });
    }
    return true;
  } else {
    return false;
  }
}

////////////////////////////////////////////////////////////////////////////////
// CONNECT TO CLUSTER
////////////////////////////////////////////////////////////////////////////////

export async function connectToCluster() {
  const CLUSTER_PROJECT = process.env.RUN_CLUSTER_PROJECT;
  $.verbose = false;

  try {
    await $`gcloud container clusters get-credentials core-${ENV} --project ${CLUSTER_PROJECT} --zone us-central1-b`;
    return { status: 'success', message: 'connected to cluster' };
  } catch (e) {
    let { stderr } = e;
    // if sterr contains 404
    if (stderr.includes('404')) {
      return { status: 'error', message: 'cluster not found' };
    }
    return { status: 'error', message: 'unknown error' };
  }
}

////////////////////////////////////////////////////////////////////////////////
// EXPORT SSL CERTIFICATES ALL
////////////////////////////////////////////////////////////////////////////////

export async function exportCertificatesAll() {
  const matchingDirectories = await withMetaMatching({
    property: 'cluster.tls',
    value: true,
  });

  for (let matchDirectory of matchingDirectories) {
    const { config, directory } = matchDirectory;

    const { cluster, name } = config;

    const { namespace, app, tls } = cluster;

    cd(directory);
    $.verbose = true;

    const certificatJsonRaw =
      await $`kubectl get secret certificat-${app}-${name} -n ${namespace} -o json`;

    await vaultKvCertsToVault(certificatJsonRaw.stdout, directory);
  }
}

////////////////////////////////////////////////////////////////////////////////
// EXPORT CERTIFICATS
////////////////////////////////////////////////////////////////////////////////

export async function exportCertificatesUnit() {
  const metaConfig = await fs.readJsonSync('meta.json');
  const { cluster, name } = metaConfig;

  const { namespace, app, tls } = cluster;
  if (await verifyClusterDirectory()) {
    cd(currentPath);
    $.verbose = true;

    if (tls) {
      const certificatJsonRaw =
        await $`kubectl get secret certificat-${app}-${name} -n ${namespace} -o json`;

      await vaultKvCertsToVault(certificatJsonRaw.stdout);
    }
  }
}

////////////////////////////////////////////////////////////////////////////////
//  EXPORT CERTIFICATS ENTRY
////////////////////////////////////////////////////////////////////////////////

export async function exportCerts(options) {
  const { all } = options;

  await connectToCluster();

  if (all) {
    await exportCertificatesAll();
  } else {
    await exportCertificatesUnit();
  }
}

////////////////////////////////////////////////////////////////////////////////
// IMPORT CERTIFICATS
////////////////////////////////////////////////////////////////////////////////

export async function importCerts() {
  if (await verifyClusterDirectory()) {
    cd(currentPath);
    $.verbose = true;

    const metaConfig = await fs.readJsonSync('meta.json');

    let { name, cluster } = metaConfig;

    const { tls, namespace, app } = cluster;

    await $`kubectl config set-context --current --namespace=${namespace}`;

    const certificateName = `certificat-${app}-${name}`;

    if (tls === true) {
      const certsRaw = await vaultKvCertsToLocal();

      const certsUnfiltered = JSON.parse(certsRaw);

      // remove a property metadata.creationTimestamp
      const certs = _.omit(certsUnfiltered, [
        'metadata.creationTimestamp',
        'metadata.resourceVersion',
        'metadata.uid',
      ]);

      const randomFilename = Math.floor(Math.random() * 1000000);

      await fs.writeJSONSync(`/tmp/certificat.${randomFilename}.json`, certs);

      $.verbose = true;

      try {
        await $`kubectl get secret ${certificateName}`;
        await $`kubectl delete secret ${certificateName}`;
      } catch (error) {
        if (!error.stderr.includes('not found')) {
          return;
        }
      }

      await $`kubectl apply -f /tmp/certificat.${randomFilename}.json`;
    }
  }
}

////////////////////////////////////////////////////////////////////////////////
// CREATE SECRETS
////////////////////////////////////////////////////////////////////////////////

export async function createSecrets() {
  $.verbose = true;
  const metaConfig = await fs.readJsonSync('meta.json');
  const { type, name, cluster } = metaConfig;

  const { app, namespace } = cluster;

  await $`kubectl config set-context --current --namespace=${namespace}`;

  const secretName = `secrets-${app}-${name}`;

  if (type === 'cluster' || type === 'cluster_app') {
    if (type === 'cluster_app') {
      config({ path: `../../.env` });
    }
    $.verbose = true;
    try {
      await $`kubectl get secret ${secretName}`;
      await $`kubectl delete secret ${secretName}`;
    } catch (error) {
      if (!error.stderr.includes('not found')) {
        return;
      }
    }

    // verify if .env file exists
    if (fs.existsSync('.env')) {
      await $`kubectl create secret generic ${secretName} --from-env-file=.env`;
    }
  } else {
    console.log('Not a cluster app');
  }
}

////////////////////////////////////////////////////////////////////////////////
// CLUSTER DESTROY REMOTE
////////////////////////////////////////////////////////////////////////////////

export async function actionClusterRemoveRemote(appName, { watch }) {
  await $`gh workflow run cluster-remove.yaml -f APP_NAME=${appName} --ref main`;

  if (watch) {
    $.verbose = false;

    await sleep(5000);
    const runId =
      await $`gh run list --limit 1 | sed -En '1p' | awk '{ print $(NF - 2) }'`;

    $.verbose = true;
    await $`gh run watch ${runId}`;
  }
}

////////////////////////////////////////////////////////////////////////////////
// CLUSTER DEPLOY LOCAL
////////////////////////////////////////////////////////////////////////////////

export async function actionClusterRemovelocal(appName, { live, reuse }) {
  fs.writeJsonSync('/tmp/inputs.json', {
    inputs: {
      APP_NAME: appName,
      LIVE: live,
    },
  });
  let actArgments = [
    { name: '--env', value: `ENV=${ENV}` },
    { name: '--eventpath', value: '/tmp/inputs.json' },
  ];

  if (reuse === true) {
    actArgments.push({ name: '--reuse', value: '' });
  }

  await actionRunLocal('cluster-remove', actArgments);
}

////////////////////////////////////////////////////////////////////////////////
// CLUSTER DEPLOY ENTRY
////////////////////////////////////////////////////////////////////////////////

export async function actionClusterRemove(appName, options) {
  $.verbose = true;
  const { local, watch, live, reuse } = options;

  if (local) {
    await actionClusterRemovelocal(appName, { live, reuse });
    return;
  }

  await actionClusterRemoveRemote(appName, { watch });
}

////////////////////////////////////////////////////////////////////////////////
// CLUSTER DEPLOY LOCAL
////////////////////////////////////////////////////////////////////////////////

export async function actionClusterDeploylocal(appName, { live, reuse }) {
  fs.writeJsonSync('/tmp/inputs.json', {
    inputs: {
      APP_NAME: appName,
      LIVE: live,
    },
  });

  let actArgments = [
    { name: '--env', value: `ENV=${ENV}` },
    { name: '--eventpath', value: '/tmp/inputs.json' },
  ];

  if (reuse === true) {
    actArgments.push({ name: '--reuse', value: '' });
  }

  await actionRunLocal('cluster-deploy', actArgments);
}

////////////////////////////////////////////////////////////////////////////////
// CLUSTER DEPLOY REMOTE
////////////////////////////////////////////////////////////////////////////////

export async function actionClusterDeployRemote(appName, { watch, branch }) {
  branch = branch || 'main';

  await $`gh workflow run cluster-deploy.yaml -f APP_NAME=${appName} --ref ${branch}`;

  if (watch) {
    $.verbose = false;

    await sleep(5000);
    const runId =
      await $`gh run list --limit 1 | sed -En '1p' | awk '{ print $(NF - 2) }'`;

    $.verbose = true;
    await $`gh run watch ${runId}`;
  }
}

////////////////////////////////////////////////////////////////////////////////
// CLUSTER DEPLOY ENTRY
////////////////////////////////////////////////////////////////////////////////

export async function actionClusterDeploy(appName, options) {
  $.verbose = true;
  const { local, watch, live, reuse, branch } = options;

  if (local) {
    await actionClusterDeploylocal(appName, { live, reuse });
    return;
  }

  await actionClusterDeployRemote(appName, { watch, branch });
}

////////////////////////////////////////////////////////////////////////////////
// DEPlOY CLUSTER
////////////////////////////////////////////////////////////////////////////////

export async function deployGroupGkeToCluster(appName, options) {
  const { tls } = options;

  let appDirectoryPath = `${SRC}/app`;

  let getDirectoryPath;

  let appDirectories = await getDirectories(appDirectoryPath);

  for (let appDirectory of appDirectories) {
    let appMeta = await fs.readJson(
      `${appDirectoryPath}/${appDirectory}/meta.json`
    );
    let { type, name } = appMeta;

    if (type === 'cluster' && name === appName) {
      getDirectoryPath = `${appDirectoryPath}/${appDirectory}`;
    }
  }

  if (getDirectoryPath === undefined) {
    console.log('App not found');
    return;
  }

  cd(getDirectoryPath);
  // loop through all directory in app

  $.verbose = true;

  const directories = await getDirectories(`${getDirectoryPath}/app`);

  let appList = [];
  for (const directory of directories) {
    // read all meta.json files
    const { cluster, name } = await fs.readJsonSync(
      `${getDirectoryPath}/app/${directory}/meta.json`
    );
    const { priority } = cluster;
    appList.push({ name, priority });
  }
  const appsByPriorityGroup = _.groupBy(appList, (app) => app.priority);
  for (let group in appsByPriorityGroup) {
    let groupApps = appsByPriorityGroup[group];
    for (let app in groupApps) {
      let { name } = groupApps[app];
      const init_script = await import(
        `${getDirectoryPath}/app/${name}/scripts/init.mjs`
      );
      await init_script.default({ tls });
    }
  }
}

////////////////////////////////////////////////////////////////////////////////
// DOCKER BUILD
////////////////////////////////////////////////////////////////////////////////

export async function dockerBuildApp() {
  const metaConfig = await fs.readJsonSync('meta.json');
  const { name, cluster } = metaConfig;

  const { app } = cluster;

  $.verbose = true;

  // loop through all directory in containers]

  const CLUSTER_PROJECT = process.env.RUN_CLUSTER_PROJECT;

  const directories = await getDirectories(`${currentPath}/containers`);

  for (const directory of directories) {
    let dockerfile = `${currentPath}/containers/${directory}/Dockerfile.${ENV}`;
    let dockerfileContext = `${currentPath}/containers/${directory}/`;
    let dockerfileImage = `gcr.io/${CLUSTER_PROJECT}/${app}-${name}-${directory}:${ENV}`;
    await $`docker build -t ${dockerfileImage} -f ${dockerfile} ${dockerfileContext}`;
  }
}

////////////////////////////////////////////////////////////////////////////////
// DOCKER PUSH
////////////////////////////////////////////////////////////////////////////////

export async function dockerPushApp() {
  const metaConfig = await fs.readJsonSync('meta.json');
  const { name, cluster } = metaConfig;

  const { app } = cluster;

  $.verbose = true;
  // loop through all directory in containers]

  const CLUSTER_PROJECT = process.env.RUN_CLUSTER_PROJECT;

  const directories = await getDirectories(`${currentPath}/containers`);

  for (const directory of directories) {
    let dockerfileImage = `gcr.io/${CLUSTER_PROJECT}/${app}-${name}-${directory}:${ENV}`;

    await $`docker push ${dockerfileImage}`;
  }
}

////////////////////////////////////////////////////////////////////////////////
// NAMESPACE SET
////////////////////////////////////////////////////////////////////////////////

export async function setNamespace(namespace) {
  $.verbose = true;
  await $`kubectl create namespace ${namespace} --dry-run=client -o yaml | kubectl apply -f -`;
}

////////////////////////////////////////////////////////////////////////////////
//  KUBECTL APPLY FOR THE POD
////////////////////////////////////////////////////////////////////////////////

export async function applyPod() {
  $.verbose = true;
  const metaConfig = await fs.readJsonSync('meta.json');
  const { cluster } = metaConfig;

  const { namespace } = cluster;

  await $`kubectl config set-context --current --namespace=${namespace}`;

  await $`kustomize build --load-restrictor LoadRestrictionsNone ${currentPath}/k8s/${ENV} | kubectl apply -f -`;
}

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function cluster(program) {
  const cluster = program.command('cluster');
  cluster.description('manage cluster');

  const certs = cluster.command('certs');
  const secrets = cluster.command('secrets');
  const deploy = cluster.command('deploy');
  const remove = cluster.command('remove');
  const connect = cluster.command('connect');
  const apps = cluster.command('apps');
  const pod = cluster.command('pod');
  const namespace = cluster.command('namespace');

  connect
    .description('connect to cluster')
    .argument('[clusterName]', 'cluster name')
    .action(connectToCluster);

  secrets
    .command('create')
    .description('from local .env to gke secret')
    .action(createSecrets);

  certs
    .command('export')
    .description('from gke secrets to vault secrets')
    .option('--all', 'export all cluster apps tls certificates')
    .action(exportCerts);
  certs
    .command('import')
    .description('from vault secrets to gke credential secrets')
    .action(importCerts);

  deploy
    .argument('[name]', 'cluster name')
    .option('--local', 'deploy cluster from local runner')
    .option('--no-reuse', 'do not resuse existing state in act')
    .option('--live', 'live-command mode in act')
    .option('--watch', 'watch remote action')
    .option('--branch <branch>', 'branch to deploy')
    .action(actionClusterDeploy);

  remove
    .argument('[name]', 'cluster name')
    .option('--local', 'destroy cluster from local runner')
    .option('--no-reuse', 'do not resuse existing state in act')
    .option('--live', 'live-command mode in act')
    .option('--watch', 'watch remote action')
    .action(actionClusterRemove);

  apps
    .command('deploy')
    .argument('[name]', 'app name')
    .option('--no-tls', 'do not get certificates from vault')
    .action(deployGroupGkeToCluster);

  const docker = pod.command('docker').argument('[name]', 'app name');

  docker.command('build').action(dockerBuildApp);
  docker.command('push').action(dockerPushApp);

  namespace.command('set').argument('[name]', 'namespace').action(setNamespace);

  pod.command('apply').action(applyPod);
}
