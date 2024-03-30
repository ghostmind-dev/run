import { $, which, sleep, cd, fs } from 'zx';
import {
  detectScriptsDirectory,
  verifyIfMetaJsonExists,
  withMetaMatching,
  recursiveDirectoriesDiscovery,
} from '../utils/divers.mjs';
import _ from 'lodash';
import { Storage } from '@google-cloud/storage';

////////////////////////////////////////////////////////////////////////////////
// MUTE BY DEFAULT
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

////////////////////////////////////////////////////////////////////////////////
// TERRAFORM DEFAULT CONFIG
////////////////////////////////////////////////////////////////////////////////

const terraformConfigDefault = {
  root: 'gcp',
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

const GCP_PROJECT_NAME = `${process.env.GCP_PROJECT_NAME}`;

////////////////////////////////////////////////////////////////////////////////
// GET BACKEND BUCKET NAME AND DIRECTORY
////////////////////////////////////////////////////////////////////////////////

async function getBucketConfig(id, global, component) {
  const ENV = `${process.env.ENV}`;
  let bucketDirectory;

  if (global === true) {
    bucketDirectory = `${id}/global/terraform`;
  } else {
    bucketDirectory = `${id}/${ENV}/terraform`;
  }

  $.verbose = true;

  const bcBucket = `bucket=${process.env.TERRAFORM_BUCKET_NAME}`;
  const bcPrefix = `prefix=${bucketDirectory}`;

  return { bcBucket, bcPrefix };
}

////////////////////////////////////////////////////////////////////////////////
// GET TERAFORM ROOT AND DOCKER BUILD CONFIG
////////////////////////////////////////////////////////////////////////////////

async function getTerraformConfig() {
  let currentPath = await detectScriptsDirectory(process.cwd());

  cd(currentPath);

  let { terraform } = await fs.readJsonSync('meta.json');

  if (terraform === undefined) {
    throw Error('terraform config not found');
  }

  return { ...terraformConfigDefault, ...terraform };
}

////////////////////////////////////////////////////////////////////////////////
// TERRAFORM DESTROY ENTRYPOINT
////////////////////////////////////////////////////////////////////////////////

export async function terraformDestroyEntry(component, options) {
  const { all, local } = options;

  if (all) {
    await terraformDestroAll(options);
  } else {
    await terraformDestroyUnit(component, options);
  }
}

////////////////////////////////////////////////////////////////////////////////
// TERRAFORM DESTROY ALL
////////////////////////////////////////////////////////////////////////////////

export async function terraformDestroAll(options) {
  const metaConfig = await fs.readJsonSync('meta.json');

  let { root } = await getTerraformConfig();

  const componentDirectories = await withMetaMatching({
    property: 'type',
    value: 'component',
    path: `${currentPath}/${root}`,
  });

  const componentsByPriority = _.sortBy(componentDirectories, (composante) => {
    return composante.config.terraform.priority;
  });

  for (let component of componentsByPriority) {
    let { directory, config } = component;
    let { id, scope } = config;

    let { bcBucket, bcPrefix } = await getBucketConfig(id, scope);

    cd(`${directory}/`);

    await $`terraform init -backend-config=${bcBucket} -backend-config=${bcPrefix} --lock=false`;
    await $`terraform plan -destroy`;
    await $`terraform destroy -auto-approve`;
  }
}

////////////////////////////////////////////////////////////////////////////////
// TERRAFORM DESTROY UNIT
////////////////////////////////////////////////////////////////////////////////

export async function terraformDestroyUnit(component, options) {
  try {
    let metaConfig = await verifyIfMetaJsonExists(currentPath);
    let { type } = metaConfig;

    let pathResources;

    if (component !== undefined) {
      let { terraform } = metaConfig;
      let { root } = terraform;
      pathResources = `${currentPath}/${root}/${component}`;
      cd(`${pathResources}/`);
      metaConfig = await verifyIfMetaJsonExists(pathResources);
    }

    if (type !== 'component' && component === undefined) {
      console.log(`
      # from parent directory
      $ run terraform apply component

      # from component directory
      $ run terraform apply
    `);
      return;
    }

    let { id, scope } = metaConfig;

    const { bcBucket, bcPrefix } = await getBucketConfig(id, scope);
    await $`terraform init -backend-config=${bcBucket} -backend-config=${bcPrefix} --lock=false`;
    await $`terraform plan -destroy`;
    await $`terraform destroy -auto-approve`;
  } catch (error) {
    console.error(error.message);
  }
}

////////////////////////////////////////////////////////////////////////////////
// TERRAFORM APPLY ENTRYPOINT
////////////////////////////////////////////////////////////////////////////////

export async function terraformApplyEntry(component, options) {
  const { all } = options;

  if (all) {
    await terraformApplyAll(options);
  } else {
    await terraformApplyUnit(component, options);
  }
}

////////////////////////////////////////////////////////////////////////////////
// TERRAFORM APPLY ALL
////////////////////////////////////////////////////////////////////////////////

export async function terraformApplyAll(options) {
  const metaConfig = await fs.readJsonSync('meta.json');

  let { root } = await getTerraformConfig();

  const componentDirectories = await withMetaMatching({
    property: 'type',
    value: 'component',
    path: `${currentPath}/${root}`,
  });

  const componentsByPriority = _.sortBy(componentDirectories, (composante) => {
    return composante.config.terraform.priority;
  });

  for (let component of componentsByPriority) {
    let { directory, config } = component;
    let { id, scope } = config;

    let { bcBucket, bcPrefix } = await getBucketConfig(id, scope);

    cd(`${directory}/`);

    await $`terraform init -backend-config=${bcBucket} -backend-config=${bcPrefix} --lock=false`;
    await $`terraform plan`;
    await $`terraform apply -auto-approve`;
  }
}

////////////////////////////////////////////////////////////////////////////////
// TERRAFORM APPLY UNIT
////////////////////////////////////////////////////////////////////////////////

export async function terraformApplyUnit(component, options) {
  try {
    let metaConfig = await verifyIfMetaJsonExists(currentPath);
    let { terraform } = metaConfig;

    let { id, path, global } = terraform[component];

    const { bcBucket, bcPrefix } = await getBucketConfig(id, global, component);

    cd(`${currentPath}/${path}`);

    await $`terraform init -backend-config=${bcBucket} -backend-config=${bcPrefix} --lock=false`;
    await $`terraform plan`;
    await $`terraform apply -auto-approve`;
  } catch (error) {
    console.error(error.message);
  }
}

////////////////////////////////////////////////////////////////////////////////
// TERRAFORM VARIABLES
////////////////////////////////////////////////////////////////////////////////

export async function terraformVariables(component, options) {
  const { envfile, tf } = options;

  // if envfile is not defined, set it to .env

  let env_file = envfile || '.env';

  // read meta.json

  const { terraform } = await verifyIfMetaJsonExists(currentPath);

  const { path } = terraform[component];

  const replaceContentBetweenComments = (
    fileContent,
    startComment,
    endComment,
    newContent
  ) => {
    const regex = new RegExp(`${startComment}[\\s\\S]*?${endComment}`, 'g');
    return fileContent.replace(
      regex,
      `${startComment}\n\n${newContent}\n\n${endComment}`
    );
  };

  // Read the .env file
  const content = fs.readFileSync(env_file, 'utf-8');
  // Extract all variable names that don't start with TF_VAR
  const nonTfVarNames = content.match(/^(?!TF_VAR_)[A-Z_]+(?==)/gm);
  // Generate the prefixed variable declarations for non-TF_VAR variables
  const prefixedVars = nonTfVarNames
    .map((varName) => {
      const value = content.match(new RegExp(`^${varName}=(.*)$`, 'm'))[1];
      return `TF_VAR_${varName}=${value}`;
    })
    .join('\n');
  // Append the prefixed variable declarations to the env_file (.env)
  // Add an empty line before the new content if the file already exists and is not empty
  const startEnvComment = `###############################################################################\n# TERRAFORM\n###############################################################################\n`;
  const endEnvComment = `###############################################################################\n# THE END\n###############################################################################\n`;

  const updatedEnvContent = replaceContentBetweenComments(
    content,
    startEnvComment,
    endEnvComment,
    prefixedVars
  );
  fs.writeFileSync(`${currentPath}/${env_file}`, updatedEnvContent);

  // // Read the .env file
  const envContent = fs.readFileSync(env_file, 'utf-8');

  if (tf) {
    // Extract all variable names that start with TF_VAR
    const tfVarNames = envContent.match(/^TF_VAR_[A-Z_]+(?==)/gm);
    if (!tfVarNames) {
      console.log('No TF_VAR_ variables found.');
      return;
    }
    // Generate the env declarations for main.tf
    const envDeclarations = tfVarNames
      .map((varName) => {
        const tfName = varName.replace(/^TF_VAR_/, '');
        return `        env {\n          name  = "${tfName}"\n          value = var.${tfName}\n        }`;
      })
      .join('\n\n');
    // Generate the variable declarations for variables.tf
    const varDeclarations = tfVarNames
      .map((varName) => {
        const tfName = varName.replace(/^TF_VAR_/, '');
        return `variable "${tfName}" {}`;
      })
      .join('\n');
    // Function to replace content between start and end comments
    const startMainComment = `        ##########################################\n        # START ENV\n        ##########################################\n`;
    const endMainComment = `        ##########################################\n        # END ENV\n        ##########################################\n`;
    const mainTfPath = `${currentPath}/${path}/main.tf`;

    const mainTfContent = fs.readFileSync(mainTfPath, 'utf-8');
    const updatedMainTfContent = replaceContentBetweenComments(
      mainTfContent,
      startMainComment,
      endMainComment,
      envDeclarations
    );
    fs.writeFileSync(mainTfPath, updatedMainTfContent);
    // Update variables.tf
    const startVariablesComment = `##########################################\n# START ENV\n##########################################\n`;
    const endVariablesComment = `##########################################\n# END ENV\n##########################################\n`;
    const variablesTfPath = `${currentPath}/${path}/variables.tf`;
    const variablesTfContent = fs.readFileSync(variablesTfPath, 'utf-8');
    const updatedVariablesTfContent = replaceContentBetweenComments(
      variablesTfContent,
      startVariablesComment,
      endVariablesComment,
      varDeclarations
    );
    fs.writeFileSync(variablesTfPath, updatedVariablesTfContent);
  }
}

////////////////////////////////////////////////////////////////////////////////
// CLEAN TERRAFORM STATE
////////////////////////////////////////////////////////////////////////////////

export async function cleanDotTerraformFolders() {
  const folders = await recursiveDirectoriesDiscovery(currentPath);

  for (let folder of folders) {
    // if path finish with .terraform
    if (folder.match(/\.terraform$/)) {
      await $`rm -rf ${folder}`;
    }
  }
}

////////////////////////////////////////////////////////////////////////////////
// UNLOCK TERRAFORM
////////////////////////////////////////////////////////////////////////////////

export async function terraformUnlock(options) {
  let { env } = options;

  const storage = new Storage({});

  // read the meta.json file

  let { id } = await verifyIfMetaJsonExists(currentPath);

  if (env === undefined) {
    env = process.env.ENV;
  }

  const filename = `${id}/${env}/terraform/default.tflock`;

  const bucketName = process.env.TERRAFORM_BUCKET_NAME;

  const bucket = storage.bucket(bucketName);
  const file = bucket.file(filename);

  const [exists] = await file.exists();
  if (!exists) {
    console.log(`File ${filename} does not exist.`);
    return;
  }

  await file.delete();
}

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function commandTerraform(program) {
  const terraform = program.command('terraform');
  terraform.description('infrastructure definition');

  terraform
    .command('clean')
    .description('delete all .tfstate files')
    .action(cleanDotTerraformFolders);

  terraform
    .command('env')
    .description('generate varialbes for .env and .tf')
    .action(terraformVariables)
    .argument('[component]', 'component to deploy')
    .option('--envfile <path>', 'path to .env file')
    .option('--no-tf', 'do not generate variables for .tf files');

  terraform
    .command('apply')
    .description('apply the infrastructure')
    .argument('[component]', 'component to deploy')
    .option('--local', 'use local state')
    .option('--all', 'deploy all components')
    .action(terraformApplyEntry);

  terraform
    .command('destroy')
    .description('terminate the infrastructure')
    .argument('[component]', 'component to destroy')
    .action(terraformDestroyEntry);

  terraform
    .command('unlock')
    .description('delete the lock file')
    .action(terraformUnlock)
    .option('--env <env>', 'environment');
}
