import { $, which, sleep, cd, fs } from "zx";
import {
  detectScriptsDirectory,
  verifyIfMetaJsonExists,
  withMetaMatching,
} from "../utils/divers.mjs";
import _ from "lodash";

////////////////////////////////////////////////////////////////////////////////
// MUTE BY DEFAULT
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

////////////////////////////////////////////////////////////////////////////////
// TERRAFORM DEFAULT CONFIG
////////////////////////////////////////////////////////////////////////////////

const terraformConfigDefault = {
  root: "gcp",
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

async function getBucketConfig(id, scope) {
  const ENV = `${process.env.ENV}`;
  let bucketDirectory;

  if (scope === "global") {
    bucketDirectory = `${id}/global/terraform`;
  } else {
    // environement can be dev, preview or prod

    let environment = ENV;
    bucketDirectory = `${id}/${environment}/terraform`;
  }

  $.verbose = true;

  const bcBucket = `bucket=bucket-${process.env.RUN_CORE_PROJECT}`;
  const bcPrefix = `prefix=${bucketDirectory}`;

  return { bcBucket, bcPrefix };
}

////////////////////////////////////////////////////////////////////////////////
// GET TERAFORM ROOT AND DOCKER BUILD CONFIG
////////////////////////////////////////////////////////////////////////////////

async function getTerraformConfig() {
  let currentPath = await detectScriptsDirectory(process.cwd());

  cd(currentPath);

  let { terraform } = await fs.readJsonSync("meta.json");

  if (terraform === undefined) {
    throw Error("terraform config not found");
  }

  return { ...terraformConfigDefault, ...terraform };
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
    let metaConfig = await verifyIfMetaJsonExists(currentPath);
    let { type } = metaConfig;

    let pathResources;

    if (type === "component") {
      console.log(
        `Need to be in a the parent of the root directory of the component you want to move`
      );
      return;
    }

    let { terraform } = metaConfig;

    let { root } = terraform;

    let targetResources = `${currentPath}/${root}/${target_component}`;

    cd(`${targetResources}/`);

    let targetMeta = await verifyIfMetaJsonExists(targetResources);

    let { id: targetId, scope: targetScope } = targetMeta;

    let { bcBucket: targetBcBucket, bcPrefix: targetBcPrefix } =
      await getBucketConfig(targetId, targetScope);

    await $`terraform init -backend-config=${targetBcBucket} -backend-config=${targetBcPrefix} --lock=false`;
    await $`terraform state pull > terraform.tfstate`;

    let pathTargetStateFile = `../${target_component}/terraform.tfstate`;

    if (new_name === undefined) {
      new_name = current_name;
    }

    let sourceResources = `${currentPath}/${root}/${source_component}`;

    cd(`${sourceResources}/`);

    let sourceMeta = await verifyIfMetaJsonExists(sourceResources);

    let { id: sourceId, scope: sourceScope } = targetMeta;

    let { bcBucket: sourceBcBucket, bcPrefix: sourceBcPrefix } =
      await getBucketConfig(sourceId, sourceScope);

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

    if (type !== "component" && component === undefined) {
      console.log(`something is wrong`);
      return;
    }

    let { id, scope } = metaConfig;

    const { bcBucket, bcPrefix } = await getBucketConfig(id, scope);

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
    let metaConfig = await verifyIfMetaJsonExists(currentPath);
    let { type } = metaConfig;

    let pathResources;

    if (component !== undefined) {
      let { terraform } = metaConfig;
      let { root } = terraform;
      pathResources = `${currentPath}/${root}/${component}`;
      cd(`${pathResources}/`);
    }

    if (type !== "component" && component === undefined) {
      console.log(`something is wrong`);
      return;
    }

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

    if (type !== "component" && component === undefined) {
      console.log(`something is wrong`);
      return;
    }

    let { id, scope } = metaConfig;

    const { bcBucket, bcPrefix } = await getBucketConfig(id, scope);

    await $`terraform init -backend-config=${bcBucket} -backend-config=${bcPrefix} --lock=false`;
    await $`terraform import ${local_resouces_path} ${remote_resources_path}`;
  } catch (error) {
    console.error(error.message);
  }
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
  const metaConfig = await fs.readJsonSync("meta.json");

  let { root } = await getTerraformConfig();

  const componentDirectories = await withMetaMatching({
    property: "type",
    value: "component",
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

    if (type !== "component" && component === undefined) {
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
  const { all, local } = options;

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
  const metaConfig = await fs.readJsonSync("meta.json");

  let { root } = await getTerraformConfig();

  const componentDirectories = await withMetaMatching({
    property: "type",
    value: "component",
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
    let { type } = metaConfig;

    let pathResources;

    if (component !== undefined) {
      let { terraform } = metaConfig;
      let { root } = terraform;
      pathResources = `${currentPath}/${root}/${component}`;
      cd(`${pathResources}/`);
      metaConfig = await verifyIfMetaJsonExists(pathResources);
    }

    if (type === "component" && component === undefined) {
      let { terraform } = metaConfig;
      let { root } = terraform;
      pathResources = `${currentPath}/${root}`;
      cd(`${pathResources}/`);
      metaConfig = await verifyIfMetaJsonExists(pathResources);
    }

    if (type === "container" && component === undefined) {
      let { terraform } = metaConfig;
      let { root } = terraform;
      pathResources = `${currentPath}/${root}`;
      cd(`${pathResources}/`);
      metaConfig = await verifyIfMetaJsonExists(pathResources);
    }

    if (type === "app" && component === undefined) {
      let { terraform } = metaConfig;
      let { root } = terraform;
      pathResources = `${currentPath}/${root}`;
      cd(`${pathResources}/`);
      metaConfig = await verifyIfMetaJsonExists(pathResources);
    }

    let { id, scope } = metaConfig;

    const { bcBucket, bcPrefix } = await getBucketConfig(id, scope);

    console.log(bcPrefix);

    await $`terraform init -backend-config=${bcBucket} -backend-config=${bcPrefix} --lock=false`;
    await $`terraform plan`;
    await $`terraform apply -auto-approve`;
    // await $`terraform 0.13upgrade`;
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
// TERRAFORM VARIABLES
////////////////////////////////////////////////////////////////////////////////

export async function terraformVariables(env_file = ".env") {
  // Read the .env file
  const content = fs.readFileSync(env_file, "utf-8");

  // Extract all variable names that don't start with TF_VAR
  const nonTfVarNames = content.match(/^(?!TF_VAR_)[A-Z_]+(?==)/gm);

  // Generate the prefixed variable declarations for non-TF_VAR variables
  const prefixedVars = nonTfVarNames
    .map((varName) => {
      const value = content.match(new RegExp(`^${varName}=(.*)$`, "m"))[1];
      return `TF_VAR_${varName}=${value}`;
    })
    .join("\n");

  // Write the prefixed variable declarations to the output.txt file
  fs.writeFileSync("output.txt", prefixedVars);

  console.log("Output written to output.txt");
}

////////////////////////////////////////////////////////////////////////////////
// TERRAFORM ENV
////////////////////////////////////////////////////////////////////////////////

export async function terraformEnv() {
  // Read the .env file
  const content = fs.readFileSync(".env", "utf-8");

  // Extract all variable names that start with TF_VAR
  const variableNames = content.match(/^TF_VAR_[A-Z_]+(?==)/gm);

  // Generate the env declarations
  const envDeclarations = variableNames
    .map((varName) => {
      // Remove the "TF_VAR_" prefix for Terraform declarations
      const tfName = varName.replace(/^TF_VAR_/, "");
      return `
        env {
          name  = "${tfName}"
          value = var.${tfName}
        }
  `;
    })
    .join("\n");

  // Generate the variable declarations
  const varDeclarations = variableNames
    .map((varName) => {
      const tfName = varName.replace(/^TF_VAR_/, "");
      return `variable "${tfName}" {}`;
    })
    .join("\n");

  // Write to the .txt file
  const output = `${envDeclarations}\n\n${varDeclarations}`;
  fs.writeFileSync("output.txt", output);

  console.log("Output written to output.txt");
}

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function commandTerraform(program) {
  const terraform = program.command("terraform");
  terraform.description("infrastructure definition");

  const tfApply = terraform.command("apply");
  const tfDestroy = terraform.command("destroy");
  const tfEnv = terraform.command("env");

  const tfToEnv = tfEnv
    .command("to_env")
    .description("generate TF_VAR from .env")
    .action(terraformVariables)
    .argument("[env]", "name of the env file");

  const tfToTf = tfEnv
    .command("to_tf")
    .description("generate .tf config from .env")
    .action(terraformEnv);

  tfApply
    .description("apply the infrastructure")
    .argument("[component]", "component to deploy")
    .option("--local", "use local state")
    .option("--all", "deploy all components")
    .action(terraformApplyEntry);

  tfDestroy
    .description("terminate the infrastructure")
    .argument("[component]", "component to destroy")
    .action(terraformDestroyEntry);

  // const tfImport = terraform.command('import');

  // tfImport
  //   .description('import the infrastructure')
  //   .argument('[component]', 'component source')
  //   .argument('[local]', 'local resource path')
  //   .argument('[remote]', 'remote resource path')
  //   .action(terraformImport);

  // const tfOutput = terraform.command('output');

  // tfOutput
  //   .description('output terraform process as json')
  //   .argument('[component]', 'component to output')
  //   .action(terraformOutput);

  // const tfState = terraform.command('state');

  // tfState.description('manage the local and remorte state');
  // const tfStatePull = tfState.command('pull');
  // tfStatePull.argument('[component]', 'component to pull');
  // tfStatePull.action(terraformStatePull);
  // const tfStatePush = tfState.command('push');
  // tfStatePush.argument('[component]', 'component to push');
  // tfStatePush.action(terraformStatePush);
  // const tfStateMv = tfState.command('mv');
  // tfStateMv.argument('[source_component]', 'component source');
  // tfStateMv.argument('[target_component]', 'component target');
  // tfStateMv.argument('[current_name]', 'current name of part to move');
  // tfStateMv.argument('[new_name]', 'new name after move');
  // tfStateMv.action(terraformStateMv);
}
