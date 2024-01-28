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
  const CLUSTER_NAME = process.env.CLUSTER_NAME;

  $.verbose = false;

  await $`run cluster connect ${CLUSTER_NAME}`;

  // to test this funciton, trigger this command
  // kubectl scale --replicas=0 deployment/
  // kubectl scale --replicas=1 deployment/

  let checkPodStatus =
    await $`kubectl get pods -l app=${app} -n ${namespace} -o 'jsonpath={..status.conditions[?(@.type=="Ready")].status}'`;

  while (`${checkPodStatus}`.includes('Trues')) {
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
  if (type === 'cluster' || type === 'pod') {
    if (type === 'pod') {
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
  const ENV = process.env.ENV;
  const CLUSTER_PROJECT = process.env.RUN_CLUSTER_PROJECT;
  const CLUSTER_ZONE = process.env.RUN_CLUSTER_ZONE;
  $.verbose = true;

  let environment;

  if (ENV === 'prod') {
    environment = 'prod';
  } else {
    environment = 'dev';
  }

  try {
    await $`gcloud container clusters get-credentials core-${environment} --project ${CLUSTER_PROJECT} --zone ${CLUSTER_ZONE}`;
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
    const { config: metaConfig, directory } = matchDirectory;

    const { cluster, name } = metaConfig;

    const { namespace, app, tls } = cluster;

    cd(directory);

    config({ path: '.env', override: true });

    const NAMESPACE = process.env.NAMESPACE;

    $.verbose = true;

    const certificatJsonRaw =
      await $`kubectl get secret certificat-${app}-${name} -n ${NAMESPACE} -o json`;

    await vaultKvCertsToVault(certificatJsonRaw.stdout, directory);
  }
}

////////////////////////////////////////////////////////////////////////////////
// EXPORT CERTIFICATS
////////////////////////////////////////////////////////////////////////////////

export async function exportCertificatesUnit() {
  const metaConfig = await fs.readJsonSync('meta.json');
  const { cluster, name } = metaConfig;

  const NAMESPACE = process.env.NAMESPACE;

  const { namespace, app, tls } = cluster;
  if (await verifyClusterDirectory()) {
    cd(currentPath);
    $.verbose = true;

    if (tls) {
      const certificatJsonRaw =
        await $`kubectl get secret certificat-${app}-${name} -n ${NAMESPACE} -o json`;

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

    await $`kubectl config set-context --current --namespace=${process.env.NAMESPACE}`;

    const certificateName = `certificat-${app}-${name}`;

    const certsRaw = await vaultKvCertsToLocal();

    if (tls === true && certsRaw !== '') {
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

  await $`kubectl config set-context --current --namespace=${process.env.NAMESPACE}`;

  const secretName = `secrets-${app}-${name}`;

  if (type === 'cluster' || type === 'pod') {
    if (type === 'pod') {
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

  console.log(directories);

  let appList = [];
  for (const directory of directories) {
    // read all meta.json files

    let podDirectory = `${getDirectoryPath}/app/${directory}`;

    const { cluster, name, type } = await fs.readJsonSync(
      `${podDirectory}/meta.json`
    );

    const currentBranchRaw = await $`git branch --show-current`;
    // trim the trailing newline
    const currentBranch = currentBranchRaw.stdout.trim();

    const { ignoreEnv } = cluster;

    if (type === 'pod') {
      const { priority, ignoreEnv } = cluster;

      if (ignoreEnv !== undefined) {
        // check if current branch is in ignoreEnv
        if (ignoreEnv.includes(currentBranch)) {
          console.log(`Ignoring ${name} on branch ${currentBranch}`);
          continue;
        }
      }

      appList.push({ podDirectory, priority });
    }
  }

  const appsByPriorityGroup = _.groupBy(appList, (app) => app.priority);
  for (let group in appsByPriorityGroup) {
    let groupApps = appsByPriorityGroup[group];
    for (let app in groupApps) {
      let { podDirectory: podToDeploy } = groupApps[app];
      console.log(128912981298);
      cd(podToDeploy);
      await $`run custom init`;
    }
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
  const ENV = process.env.ENV;
  const metaConfig = await fs.readJsonSync('meta.json');
  const { cluster } = metaConfig;

  let environment;

  if (ENV === 'prod' || ENV === 'preview') {
    environment = ENV;
  } else {
    environment = 'dev';
  }

  await $`kubectl config set-context --current --namespace=${process.env.NAMESPACE}`;

  await $`kustomize build --load-restrictor LoadRestrictionsNone ${currentPath}/k8s/${environment} | kubectl apply -f -`;

  // await $`kustomize build --load-restrictor LoadRestrictionsNone ${currentPath}/k8s/${environment} > ${SRC}/kusomize.yaml`;
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
    .argument('[name]', 'app name')
    .option('--no-tls', 'do not get certificates from vault')
    .action(deployGroupGkeToCluster);

  namespace.command('set').argument('[name]', 'namespace').action(setNamespace);

  pod.command('apply').action(applyPod);
}
