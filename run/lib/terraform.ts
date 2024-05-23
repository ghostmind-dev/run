import { $, cd } from 'npm:zx@8.1.0';
import fs from 'npm:fs-extra@11.2.0';
import { readFileSync } from 'node:fs';
import {
  detectScriptsDirectory,
  verifyIfMetaJsonExists,
  recursiveDirectoriesDiscovery,
} from '../utils/divers.ts';
import { getAppName } from '../utils/divers.ts';
import { getDockerImageDigest } from '../main.ts';
import _ from 'npm:lodash@4.17.21';
import { Storage } from 'npm:@google-cloud/storage@7.11.1';

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
// GET BACKEND BUCKET NAME AND DIRECTORY
////////////////////////////////////////////////////////////////////////////////

export async function getBucketConfig(id: any, global: any, component: any) {
  const ENV = `${Deno.env.get('ENV')}`;
  let bucketDirectory;

  if (global === true) {
    bucketDirectory = `${id}/global/terraform/${component}`;
  } else {
    bucketDirectory = `${id}/${ENV}/terraform/${component}`;
  }

  $.verbose = true;

  const bcBucket = `bucket=${Deno.env.get('TERRAFORM_BUCKET_NAME')}`;
  const bcPrefix = `prefix=${bucketDirectory}`;

  return { bcBucket, bcPrefix };
}

////////////////////////////////////////////////////////////////////////////////
// TERRAFORM DESTROY UNIT
////////////////////////////////////////////////////////////////////////////////

export async function terraformDestroy(
  component: string,
  options: TerraformDestroyOptions
) {
  try {
    let metaConfig = await verifyIfMetaJsonExists(currentPath);

    if (metaConfig) {
      let { terraform, id } = metaConfig;

      let { path, global } = terraform[component];

      const { bcBucket, bcPrefix } = await getBucketConfig(
        id,
        global,
        component
      );

      Deno.env.set('TF_VAR_IMAGE_DIGEST', '');

      cd(`${currentPath}/${path}`);

      await $`terraform init -backend-config=${bcBucket} -backend-config=${bcPrefix} --lock=false`;
      await $`terraform plan -destroy`;
      await $`terraform destroy -auto-approve`;
    }
  } catch (error) {
    console.error(error.message);
  }
}

////////////////////////////////////////////////////////////////////////////////
// TERRAFORM APPLY UNIT
////////////////////////////////////////////////////////////////////////////////

export async function terraformActivate(
  componentOrOptions: string | TerraformActivateOptionsWithComponent,
  options?: TerraformActivateOptions
) {
  let component: string;

  if (typeof componentOrOptions === 'string') {
    component = componentOrOptions;
    options = options || {};
  } else {
    component = componentOrOptions.component;
    options = componentOrOptions;
  }

  try {
    let metaConfig = await verifyIfMetaJsonExists(currentPath);

    if (metaConfig === undefined) {
      return;
    }

    let dockerAppName = options.docker || 'default';

    let arch = options.arch || 'amd64';

    const imageDigest: any = await getDockerImageDigest(arch, dockerAppName);

    Deno.env.set('TF_VAR_IMAGE_DIGEST', imageDigest);

    let { terraform, id } = metaConfig;
    let { path, global } = terraform[component];
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

export async function terraformVariables(component: any, options: any) {
  const { target, tf } = options;

  // if envfile is not defined, set it to .env

  let env_file = `.env.${target}` || '.env.local';

  // read meta.json

  const metaConfig = await verifyIfMetaJsonExists(currentPath);

  if (metaConfig === undefined) {
    return;
  }

  const { terraform } = metaConfig;

  const { path } = terraform[component];

  const replaceContentBetweenComments = (
    fileContent: any,
    startComment: any,
    endComment: any,
    newContent: any
  ) => {
    const regex = new RegExp(`${startComment}[\\s\\S]*?${endComment}`, 'g');
    return fileContent.replace(
      regex,
      `${startComment}\n\n${newContent}\n\n${endComment}`
    );
  };

  // Read the .env file
  const content: any = readFileSync(env_file, 'utf-8');
  // Extract all variable names that don't start with TF_VAR
  let nonTfVarNames: any = content.match(/^(?!TF_VAR_)[A-Z_]+(?==)/gm);
  // Generate the prefixed variable declarations for non-TF_VAR variables

  // remove element TF_VAR_PORT

  let prefixedVars = nonTfVarNames

    .map((varName: any) => {
      const value = content.match(new RegExp(`^${varName}=(.*)$`, 'm'))[1];
      return `TF_VAR_${varName}=${value}`;
    })
    .join('\n');

  const projectHasBeenDefined = prefixedVars.match(/^TF_VAR_PROJECT=(.*)$/m);
  const appNameHasBeenDefined = prefixedVars.match(/^TF_VAR_APP=(.*)$/m);
  const gcpProjectIdhAsBeenDefined = prefixedVars.match(
    /^TF_VAR_GCP_PROJECT_ID=(.*)$/m
  );

  if (!projectHasBeenDefined) {
    const SRC = Deno.env.get('SRC') || '';
    const metaConfig = await verifyIfMetaJsonExists(SRC);

    const name = metaConfig || '';

    // add the project name to the .env file
    prefixedVars += `\nTF_VAR_PROJECT=${name}`;
  }

  if (!appNameHasBeenDefined) {
    const metaConfig = await verifyIfMetaJsonExists(currentPath);

    const name = metaConfig || '';
    prefixedVars += `\nTF_VAR_APP=${name}`;
  }

  if (!gcpProjectIdhAsBeenDefined) {
    const GCP_PROJECT_ID = Deno.env.get('GCP_PROJECT_ID') || '';
    prefixedVars += `\nTF_VAR_GCP_PROJECT_ID=${GCP_PROJECT_ID}`;
  }

  const APP_NAME = await getAppName();

  await $`rm -rf /tmp/.env.${APP_NAME}`;
  // write content to /tmp/.env.APP_NAME and addd prefixedVars at the end

  await fs.writeFile(`/tmp/.env.${APP_NAME}`, `${content}\n${prefixedVars}`);

  // // Read the .env file
  const envContent = readFileSync(`/tmp/.env.${APP_NAME}`, 'utf-8');

  // Extract all variable names that start with TF_VAR
  let tfVarNames = envContent.match(/^TF_VAR_[A-Z_]+(?==)/gm);
  if (!tfVarNames) {
    console.log('No TF_VAR_ variables found.');
    return;
  }
  // Generate the env declarations for main.tf

  //remote the TF_VAR_PROJECT

  // tfVarNames = tfVarNames.filter(
  //   (varName: any) => varName !== 'TF_VAR_PROJECT'
  // );

  const varDeclarations = tfVarNames
    // remove if equal TF_VAR_PROJECT

    .map((varName: any) => {
      const tfName = varName.replace(/^TF_VAR_/, '');
      return `variable "${tfName}" {}`;
    })
    .join('\n');

  const envDeclarations = tfVarNames
    .filter((varName: any) => varName !== 'TF_VAR_PORT')
    .map((varName: any) => {
      const tfName = varName.replace(/^TF_VAR_/, '');
      return `        env {\n          name  = "${tfName}"\n          value = var.${tfName}\n        }`;
    })
    .join('\n\n');
  // Generate the variable declarations for variables.tf
  // Function to replace content between start and end comments
  const startMainComment = `        ##########################################\n        # START ENV\n        ##########################################\n`;
  const endMainComment = `        ##########################################\n        # END ENV\n        ##########################################\n`;
  const mainTfPath = `${currentPath}/${path}/main.tf`;

  const mainTfContent = readFileSync(mainTfPath, 'utf-8');
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
  const variablesTfContent = readFileSync(variablesTfPath, 'utf-8');
  const updatedVariablesTfContent = replaceContentBetweenComments(
    variablesTfContent,
    startVariablesComment,
    endVariablesComment,
    varDeclarations
  );
  fs.writeFileSync(variablesTfPath, updatedVariablesTfContent);
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

export async function terraformUnlock(component: string, options: any) {
  let { env } = options;

  const storage = new Storage({});

  // read the meta.json file

  const metaConfig = await verifyIfMetaJsonExists(currentPath);

  if (metaConfig === undefined) {
    return;
  }

  const { id } = metaConfig;

  if (env === undefined) {
    env = Deno.env.get('ENV');
  }

  const filename = `${id}/${env}/terraform/${component}/default.tflock`;

  const bucketName: any = Deno.env.get('TERRAFORM_BUCKET_NAME');

  const bucket = storage.bucket(bucketName);
  const file = bucket.file(filename);

  const [exists] = await file.exists();
  if (!exists) {
    console.log(`File ${filename} does not exist.`);
    return;
  }

  await file.delete();

  console.log(`gs://${bucketName}/${filename} deleted.`);
}

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function commandTerraform(program: any) {
  Deno.env.set('GOOGLE_APPLICATION_CREDENTIALS', '/tmp/gsa_key.json');

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
    .option('--target <name>', 'environment to target');

  terraform
    .command('activate')
    .description('apply the infrastructure')
    .option('--arch <arch>', 'architecture. default to amd64')
    .option('--docker <docker>', 'docker app name')
    .argument(
      '[component]',
      'component to deplo. It has priority over --component option'
    )
    .option('--component <component>', 'component to deploy')
    .option('--local', 'use local state')
    .action(terraformActivate);

  terraform
    .command('destroy')
    .argument('[component]', 'component to deploy')
    .option('--arch <arch>', 'architecture. default to amd64')
    .option('--docker <docker>', 'docker app name')
    .description('terminate the infrastructure')
    .action(terraformDestroy);

  terraform
    .command('unlock')
    .description('delete the lock file')
    .argument('[component]', 'component to unlock')
    .action(terraformUnlock)
    .option('--env <env>', 'environment');
}
