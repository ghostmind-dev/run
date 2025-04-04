import { $, cd } from 'npm:zx@8.1.0';
import fs from 'npm:fs-extra@11.2.0';
import { readFileSync } from 'node:fs';
import {
  verifyIfMetaJsonExists,
  recursiveDirectoriesDiscovery,
} from '../utils/divers.ts';
import type { MetaJson } from '../utils/divers.ts';
import { getAppName } from '../utils/divers.ts';
import { getDockerImageDigest } from '../main.ts';
import _ from 'npm:lodash@4.17.21';

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

interface TerraformActivateOptions {
  arch?: string;
  docker?: string;
  modifiers?: string[];
  clean?: boolean;
}

interface TerraformActivateOptionsWithComponent
  extends TerraformActivateOptions {
  component: string;
}

interface TerraformDestroyOptions {
  arch?: string;
  clean?: boolean;
}

////////////////////////////////////////////////////////////////////////////////
// GET BACKEND BUCKET NAME AND DIRECTORY
////////////////////////////////////////////////////////////////////////////////

export async function getBucketConfig(
  id: string,
  global: any,
  component: string
): Promise<{ bcBucket: string; bcPrefix: string }> {
  const ENV = `${Deno.env.get('ENVIRONMENT')}`;
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

      let { path, global, containers } = terraform[component];

      const { bcBucket, bcPrefix } = await getBucketConfig(
        id,
        global,
        component
      );

      if (containers) {
        for (const container of containers) {
          $.verbose = true;

          Deno.env.set(`TF_VAR_IMAGE_DIGEST_${container.toUpperCase()}`, '');
        }
      }

      cd(`${currentPath}/${path}`);

      if (options.clean) {
        await $`rm -rf .terraform`;
      }

      await $`terraform init -backend-config=${bcBucket} -backend-config=${bcPrefix} --lock=false`;
      await $`terraform plan -destroy`;
      await $`terraform destroy -auto-approve`;
    }
  } catch (error) {
    console.log(error);
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

    let { terraform, id } = metaConfig;
    let { path, global, containers } = terraform[component];

    const { bcBucket, bcPrefix } = await getBucketConfig(id, global, component);

    if (containers) {
      let arch = options.arch || 'amd64';

      let modifiers = options.modifiers || [];

      cd(`${currentPath}`);

      for (const container of containers) {
        // verify if container equal to the begiining of one of the image_modifiers

        let imageDigest;

        let modifier = modifiers.find((modifier) =>
          modifier.startsWith(`${container}:`)
        );

        if (modifier) {
          // get value after :

          let modifierValue = modifier.split(':')[1];
          imageDigest = await getDockerImageDigest(
            arch,
            container,
            modifierValue
          );
        } else {
          imageDigest = await getDockerImageDigest(arch, container);
        }

        $.verbose = true;

        Deno.env.set(
          `TF_VAR_IMAGE_DIGEST_${container.toUpperCase()}`,
          imageDigest
        );
      }
    }

    cd(`${currentPath}/${path}`);

    if (options.clean) {
      await $`rm -rf .terraform`;
    }

    await $`terraform init -backend-config=${bcBucket} -backend-config=${bcPrefix} --lock=false`;
    await $`terraform plan`;
    await $`terraform apply -auto-approve`;
  } catch (error) {
    console.log(error);
  }
}
////////////////////////////////////////////////////////////////////////////////
// TERRAFORM VARIABLES
////////////////////////////////////////////////////////////////////////////////

export async function terraformVariables(component: any, options: any) {
  const { target } = options;

  // if envfile is not defined, set it to .env

  let env_file = `.env.${target}` || '.env.local';

  // read meta.json

  const metaConfig = await verifyIfMetaJsonExists(currentPath);

  let envcotent: string = '';
  let baseContent: string = '';

  if (metaConfig?.secrets?.base) {
    baseContent = readFileSync(`.env.${metaConfig?.secrets.base}`, 'utf-8');
  }

  if (metaConfig === undefined) {
    return;
  }

  const { terraform } = metaConfig;

  const { path } = terraform[component];

  // Read the .env file
  envcotent = readFileSync(env_file, 'utf-8');

  let content: string = `${baseContent}\n${envcotent}`;

  // Extract all variable names that don't start with TF_VAR
  let nonTfVarNames: any = content.match(/^(?!TF_VAR_)[A-Z_]+(?==)/gm);

  if (nonTfVarNames === null) {
    nonTfVarNames = [];
  }

  // Generate the prefixed variable declarations for non-TF_VAR variables

  // remove element TF_VAR_PORT

  if (terraform[component].containers) {
    // Add IMAGE_DIGEST variables for each container
    for (const container of terraform[component].containers) {
      nonTfVarNames.push(`IMAGE_DIGEST_${container.toUpperCase()}`);
    }
  }

  let prefixedVars = nonTfVarNames
    .map((varName: any) => {
      const match = content.match(new RegExp(`^${varName}=(.*)$`, 'm'));
      const value = match && match[1] ? match[1] : '';
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

  // Function to read environment variables from a file
  const envContent = fs.readFileSync(`/tmp/.env.${APP_NAME}`, 'utf-8');

  // Extract all variable names that start with TF_VAR
  let tfVarNames = envContent.match(/^TF_VAR_[A-Z_]+(?==)/gm);
  if (!tfVarNames) {
    console.log('No TF_VAR_ variables found.');
    return;
  }

  // Generate variable declarations for variables.tf
  const varDeclarations = tfVarNames
    // remove if equal TF_VAR_PROJECT
    .map((varName: string) => {
      const tfName = varName.replace(/^TF_VAR_/, '');
      return `variable "${tfName}" {}`;
    })
    .join('\n');

  // Generate locals block for environment variables
  const localsBlock = `
  locals {
    env_vars = [
  ${tfVarNames
    .filter((varName: string) => varName !== 'TF_VAR_PORT')
    .map((varName: string) => {
      const tfName = varName.replace(/^TF_VAR_/, '');
      return `    {
        name  = "${tfName}"
        value = var.${tfName}
      }`;
    })
    .join(',\n')}
    ]
  }
  `;

  // Combine variable declarations and locals block
  const variablesTfContent = `# variables.tf

  ${varDeclarations}

  ${localsBlock}
  `;

  // Path to variables.tf using Deno.cwd()
  const variablesTfPath = `${currentPath}/${path}/variables.tf`;

  // Clear the content of variables.tf before writing new content
  fs.writeFileSync(variablesTfPath, '');

  // Write the new content to variables.tf
  fs.writeFileSync(variablesTfPath, variablesTfContent, 'utf-8');

  console.log('variables.tf file updated successfully.');
}

////////////////////////////////////////////////////////////////////////////////
// CLEAN TERRAFORM STATE
////////////////////////////////////////////////////////////////////////////////

export async function cleanDotTerraformFolders() {
  // Check if path ends with /.terraform (with forward slash)
  const metaconfig: MetaJson | undefined = await verifyIfMetaJsonExists(
    currentPath
  );

  if (metaconfig) {
    // get the terraform object
    const terraform = metaconfig?.terraform;

    if (terraform) {
      for (const component of Object.keys(terraform)) {
        const { path } = terraform[component];

        await $`rm -rf ${currentPath}/${path}/.terraform`;

        console.log(`State cleaned for ${component}`);
      }
    }
  }
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
    .option('--modifiers <...modifiers>', 'docker image modifiers')
    .option('--local', 'use local state')
    .option('--clean', 'delete the .terraform folder before apply')
    .action(terraformActivate);

  terraform
    .command('destroy')
    .argument('[component]', 'component to deploy')
    .option('--arch <arch>', 'architecture. default to amd64')
    .option('--docker <docker>', 'docker app name')
    .option('--clean', 'delete the .terraform folder before destroy')
    .description('terminate the infrastructure')
    .action(terraformDestroy);
}
