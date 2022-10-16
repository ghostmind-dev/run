import { $, which, sleep, cd, fs } from 'zx';
import { detectScriptsDirectory } from '../utils/divers.mjs';

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
// RUNNING COMMAND LOCATION
////////////////////////////////////////////////////////////////////////////////

const metaConfig = await fs.readJsonSync('meta.json');

////////////////////////////////////////////////////////////////////////////////
// CONSTANTS
////////////////////////////////////////////////////////////////////////////////

const ENV = `${process.env.ENV}`;
const GCP_PROJECT_NAME = `${process.env.GCP_PROJECT_NAME}`;

////////////////////////////////////////////////////////////////////////////////
// GET BACKEND BUCKET NAME AND DIRECTORY
////////////////////////////////////////////////////////////////////////////////

async function getBucketConfig(component) {
  let { type, name } = metaConfig;
  let bucketDirectory;

  if (type === 'project') {
    bucketDirectory = `admin/terraform/${component}`;
  } else if (type === 'app') {
    bucketDirectory = `${process.env.ENV}/app/${name}/terraform/${component}`;
  } else if (type === 'cluster') {
    bucketDirectory = `${process.env.ENV}/app/${name}/terraform/${component}`;
  } else if (type === 'cluster_core') {
    bucketDirectory = `${process.env.ENV}/cluster/terraform/${component}`;
  } else if (type === 'group') {
    bucketDirectory = `${process.env.ENV}/app/${name}/terraform/${component}`;
  } else if (type === 'rds') {
    bucketDirectory = `${process.env.ENV}/rds/terraform/${component}`;
  } else if (type === 'vault') {
    bucketDirectory = `vault/terraform/${component}`;
  } else if (type === 'db') {
    bucketDirectory = `${process.env.ENV}/db/${name}/terraform/${component}`;
  } else if (type === 'pgadmin') {
    bucketDirectory = `pg/terraform/${component}`;
  } else {
    console.log('this redirectory is neither of type project nor of type app');
    return;
  }

  $.verbose = true;

  const bcBucket = `bucket=bucket-${process.env.RUN_CORE_PROJECT}`;
  const bcPrefix = `prefix=${process.env.GCP_PROJECT_NAME}/${bucketDirectory}`;

  return { bcBucket, bcPrefix };
}

////////////////////////////////////////////////////////////////////////////////
// GET TERAFORM ROOT AND DOCKER BUILD CONFIG
////////////////////////////////////////////////////////////////////////////////

async function getTerraformConfig() {
  let { terraform } = await fs.readJsonSync('meta.json');

  if (terraform === undefined) {
    throw Error('terraform config not found');
  }

  return { ...terraformConfigDefault, ...terraform };
}

////////////////////////////////////////////////////////////////////////////////
// BUILD AND PUSH DOCKER IMAGE
////////////////////////////////////////////////////////////////////////////////

async function buildDocketImage() {
  let { name } = metaConfig;
  cd(`${currentPath}/app`);

  const DOCKERFILE = `${currentPath}/app/Dockerfile.${ENV}`;
  const DOCKER_CONTEXT = `${currentPath}/app`;

  $.verbose = true;
  process.env.DOCKER_DEFAULT_PLATFORM = 'linux/amd64';
  await $`docker build -t gcr.io/${GCP_PROJECT_NAME}/${name}:${ENV} -f ${DOCKERFILE} ${DOCKER_CONTEXT}`;

  await sleep(1000);
}

async function pushDockerImage() {
  let { name } = metaConfig;

  await $`docker push gcr.io/${GCP_PROJECT_NAME}/${name}:${ENV}`;
}

////////////////////////////////////////////////////////////////////////////////
// RUN TERRAFORM STATE MV
////////////////////////////////////////////////////////////////////////////////

export async function terraformStateMv(
  source_component,
  target_component,
  current_name,
  new_name
) {
  try {
    let { root } = await getTerraformConfig();

    let targetResources = `${currentPath}/${root}/${target_component}`;

    cd(`${targetResources}/`);

    let { bcBucket: targetBcBucket, bcPrefix: targetBcPrefix } =
      await getBucketConfig(target_component);

    await $`terraform init -backend-config=${targetBcBucket} -backend-config=${targetBcPrefix} --lock=false`;
    await $`terraform state pull > terraform.tfstate`;

    let sourceResources = `${currentPath}/${root}/${source_component}`;

    cd(`${sourceResources}/`);

    let pathTargetStateFile = `../${target_component}/terraform.tfstate`;

    if (new_name === undefined) {
      new_name = current_name;
    }

    let { bcBucket, bcPrefix } = await getBucketConfig(source_component);

    $.verbose = true;
    await $`terraform init -backend-config=${bcBucket} -backend-config=${bcPrefix} --lock=false`;
    await $`terraform state mv -state-out=${pathTargetStateFile} ${current_name} ${new_name}`;
  } catch (error) {
    console.error(error.message);
  }
}

////////////////////////////////////////////////////////////////////////////////
// TERRAFORM STATE PULL
////////////////////////////////////////////////////////////////////////////////

export async function terraformStatePull(component) {
  try {
    let { root } = await getTerraformConfig();

    let pathResources = `${currentPath}/${root}/${component}`;

    cd(`${pathResources}/`);

    let { bcBucket, bcPrefix } = await getBucketConfig(component);

    $.verbose = true;
    await $`terraform init -backend-config=${bcBucket} -backend-config=${bcPrefix} --lock=false`;
    await $`terraform state pull > terraform.tfstate`;
  } catch (error) {
    console.error(error.message);
  }
}

////////////////////////////////////////////////////////////////////////////////
// TERRAFORM STATE PUSH
////////////////////////////////////////////////////////////////////////////////

export async function terraformStatePush(component) {
  try {
    let { root } = await getTerraformConfig(component);

    let pathResources = `${currentPath}/${root}/${component}`;

    cd(`${pathResources}/`);

    $.verbose = true;

    await $`terraform state push terraform.tfstate`;
  } catch (error) {
    console.error(error.message);
  }
}

////////////////////////////////////////////////////////////////////////////////
// TERRAFORM IMPORT
////////////////////////////////////////////////////////////////////////////////

export async function terraformImport(
  component,
  local_resouces_path,
  remote_resources_path
) {
  try {
    let { root } = await getTerraformConfig(component);

    let pathResources = `${currentPath}/${root}/${component}`;

    cd(`${pathResources}/`);

    const { bcBucket, bcPrefix } = await getBucketConfig(component);

    await $`terraform init -backend-config=${bcBucket} -backend-config=${bcPrefix} --lock=false`;
    await $`terraform import ${local_resouces_path} ${remote_resources_path}`;
  } catch (error) {
    console.error(error.message);
  }
}

////////////////////////////////////////////////////////////////////////////////
// TERRAFORM DESTROY
////////////////////////////////////////////////////////////////////////////////

export async function terraformDestroy(component, options) {
  try {
    let { root } = await getTerraformConfig(component);

    let pathResources = `${currentPath}/${root}/${component}`;

    cd(`${pathResources}/`);

    const { bcBucket, bcPrefix } = await getBucketConfig(component);

    await $`terraform init -backend-config=${bcBucket} -backend-config=${bcPrefix} --lock=false`;
    await $`terraform plan -destroy`;
    await $`terraform destroy -auto-approve`;
  } catch (error) {
    console.error(error.message);
  }
}

////////////////////////////////////////////////////////////////////////////////
// TERRAFORM APPLY
////////////////////////////////////////////////////////////////////////////////

export async function terraformApply(component, options) {
  // test
  try {
    let { root, docker_build } = await getTerraformConfig(component);
    if (docker_build) {
      await buildDocketImage();
      await pushDockerImage();
    }
    let pathResources = `${currentPath}/${root}/${component}`;
    cd(`${pathResources}/`);
    const { bcBucket, bcPrefix } = await getBucketConfig(component);
    await $`terraform init -backend-config=${bcBucket} -backend-config=${bcPrefix} --lock=false`;
    await $`terraform plan`;
    await $`terraform apply -auto-approve`;
  } catch (error) {
    console.error(error.message);
  }
}

////////////////////////////////////////////////////////////////////////////////
// TERRAFORM APPLY
////////////////////////////////////////////////////////////////////////////////

export async function terraformOutput(component) {
  try {
    let { root } = await getTerraformConfig(component);

    let pathResources = `${currentPath}/${root}/${component}`;

    cd(`${pathResources}/`);

    $.verbose = true;

    await $`terraform output -json`;
  } catch (error) {}
}

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function commandTerraform(program) {
  const terraform = program.command('terraform');
  terraform.description('infrastructure definition');

  const tfApply = terraform.command('apply');
  const tfDestroy = terraform.command('destroy');
  const tfImport = terraform.command('import');
  const tfState = terraform.command('state');
  const tfOutput = terraform.command('output');
  tfApply
    .description('apply the infrastructure')
    .argument('[component]', 'component to deploy')
    .option('--local', 'use local state')
    .action(terraformApply);

  tfDestroy
    .description('terminate the infrastructure')
    .argument('[component]', 'component to destroy')
    .action(terraformDestroy);

  tfImport
    .description('import the infrastructure')
    .argument('[component]', 'component source')
    .argument('[local]', 'local resource path')
    .argument('[remote]', 'remote resource path')
    .action(terraformImport);

  tfOutput
    .description('output terraform process as json')
    .argument('[component]', 'component to output')
    .action(terraformOutput);

  tfState.description('manage the local and remorte state');
  const tfStatePull = tfState.command('pull');
  tfStatePull.argument('[component]', 'component to pull');
  tfStatePull.action(terraformStatePull);
  const tfStatePush = tfState.command('push');
  tfStatePush.argument('[component]', 'component to push');
  tfStatePush.action(terraformStatePush);
  const tfStateMv = tfState.command('mv');
  tfStateMv.argument('[source_component]', 'component source');
  tfStateMv.argument('[target_component]', 'component target');
  tfStateMv.argument('[current_name]', 'current name of part to move');
  tfStateMv.argument('[new_name]', 'new name after move');
  tfStateMv.action(terraformStateMv);
}
