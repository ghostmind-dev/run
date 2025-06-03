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
// TERRAFORM TEMPLATE MANAGEMENT
////////////////////////////////////////////////////////////////////////////////

export async function listTerraformTemplates(): Promise<string[]> {
  try {
    const repoUrl =
      'https://api.github.com/repos/ghostmind-dev/config/contents/config/terraform';

    console.log('Fetching available Terraform templates from GitHub...');

    const response = await fetch(repoUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch templates: ${response.statusText}`);
    }

    const data = await response.json();

    // Filter only directories
    const directories = data
      .filter((item: any) => item.type === 'dir')
      .map((item: any) => item.name);

    return directories;
  } catch (error) {
    console.error('Error fetching templates:', error);
    return [];
  }
}

export async function downloadTerraformTemplate(
  templateName: string,
  targetPath: string = 'infra'
): Promise<void> {
  try {
    const repoUrl = `https://api.github.com/repos/ghostmind-dev/config/contents/config/terraform/${templateName}`;

    console.log(`Downloading template: ${templateName}...`);

    // Create target directory if it doesn't exist
    const userWorkingDirectory = Deno.cwd();
    const fullTargetPath = `${userWorkingDirectory}/${targetPath}`;
    await fs.ensureDir(fullTargetPath);

    // Fetch template files
    const response = await fetch(repoUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch template files: ${response.statusText}`);
    }

    const files = await response.json();

    // Download each file
    for (const file of files) {
      if (file.type === 'file') {
        console.log(`Downloading: ${file.name}`);

        // Fetch file content
        const fileResponse = await fetch(file.download_url);
        const fileContent = await fileResponse.text();

        // Write file to target directory
        const filePath = `${fullTargetPath}/${file.name}`;
        await fs.writeFile(filePath, fileContent);
      }
    }

    // Create empty variables.tf if it doesn't exist
    const variablesPath = `${fullTargetPath}/variables.tf`;
    if (!(await fs.pathExists(variablesPath))) {
      await fs.writeFile(
        variablesPath,
        '# Variables for Terraform configuration\n\n'
      );
      console.log('Created empty variables.tf file');
    }

    console.log(
      `✅ Template '${templateName}' successfully downloaded to './${targetPath}' directory`
    );
  } catch (error) {
    console.error('Error downloading template:', error);
  }
}

async function promptUser(
  question: string,
  defaultValue?: string
): Promise<string> {
  const prompt = defaultValue
    ? `${question} (default: ${defaultValue}): `
    : `${question}: `;

  // Use Deno.stdout.write for the prompt to avoid newline issues
  await Deno.stdout.write(new TextEncoder().encode(prompt));

  const decoder = new TextDecoder();
  const buffer = new Uint8Array(1024);
  const n = await Deno.stdin.read(buffer);
  const input = decoder.decode(buffer.subarray(0, n || 0)).trim();

  return input || defaultValue || '';
}

async function updateMetaJsonWithTerraform(
  componentName: string,
  path: string,
  containers: string[]
): Promise<void> {
  try {
    // Use Deno.cwd() to get the current working directory where the user ran the command
    const userWorkingDirectory = Deno.cwd();
    const metaConfig = await verifyIfMetaJsonExists(userWorkingDirectory);

    if (!metaConfig) {
      console.log(
        'No meta.json found in current directory. Please make sure you are in a project directory with a meta.json file.'
      );
      return;
    }

    // Initialize terraform section if it doesn't exist
    if (!metaConfig.terraform) {
      metaConfig.terraform = {};
    }

    // Add the new terraform component
    metaConfig.terraform[componentName] = {
      path: path,
      global: false,
      containers: containers,
    };

    // Write back to meta.json in the user's current working directory
    const metaJsonPath = `${userWorkingDirectory}/meta.json`;
    await fs.writeFile(metaJsonPath, JSON.stringify(metaConfig, null, 2));

    console.log(
      `✅ Updated meta.json with terraform component '${componentName}'`
    );
  } catch (error) {
    console.error('Error updating meta.json:', error);
  }
}

export async function terraformTemplate(): Promise<void> {
  try {
    const templates = await listTerraformTemplates();

    if (templates.length === 0) {
      console.log('No templates found or failed to fetch templates.');
      return;
    }

    console.log('\nAvailable Terraform templates:');
    console.log('==============================');

    templates.forEach((template, index) => {
      console.log(`${index + 1}. ${template}`);
    });

    const templateSelection = await promptUser(
      '\nPlease select a template by entering its number'
    );
    const selectedIndex = parseInt(templateSelection) - 1;

    if (selectedIndex < 0 || selectedIndex >= templates.length) {
      console.log('Invalid selection. Please try again.');
      return;
    }

    const selectedTemplate = templates[selectedIndex];
    console.log(`\nSelected template: ${selectedTemplate}`);

    // Ask for component configuration
    const componentName = await promptUser('Enter component name', 'core');
    const folderPath = await promptUser('Enter folder path', 'infra');

    // Check for existing docker configurations
    const userWorkingDirectory = Deno.cwd();
    const metaConfig = await verifyIfMetaJsonExists(userWorkingDirectory);
    let selectedContainers: string[] = [];

    if (metaConfig?.docker) {
      const dockerKeys = Object.keys(metaConfig.docker);

      if (dockerKeys.length > 0) {
        console.log('\nExisting Docker configurations found:');
        dockerKeys.forEach((key, index) => {
          console.log(`${index + 1}. ${key}`);
        });

        const containerSelection = await promptUser(
          'Select Docker containers to associate (comma-separated numbers, or press Enter to skip)',
          ''
        );

        if (containerSelection.trim()) {
          const selectedIndices = containerSelection
            .split(',')
            .map((s) => parseInt(s.trim()) - 1)
            .filter((i) => i >= 0 && i < dockerKeys.length);

          selectedContainers = selectedIndices.map((i) => dockerKeys[i]);
        }
      } else {
        console.log('No Docker configurations found in meta.json');
      }
    } else {
      console.log('No Docker configurations found in meta.json');
    }

    console.log(`\nConfiguration:
- Component name: ${componentName}
- Folder path: ${folderPath}
- Containers: ${
      selectedContainers.length > 0 ? selectedContainers.join(', ') : 'none'
    }`);

    // Download the template
    await downloadTerraformTemplate(selectedTemplate, folderPath);

    // Update meta.json with the new terraform configuration
    await updateMetaJsonWithTerraform(
      componentName,
      folderPath,
      selectedContainers
    );
  } catch (error) {
    console.error('Error in terraform template command:', error);
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

  terraform
    .command('template')
    .description('list and download Terraform templates')
    .action(terraformTemplate);
}
