import { $, which, sleep, cd, fs } from "npm:zx";
import {
  detectScriptsDirectory,
  recursiveDirectoriesDiscovery,
  verifyIfMetaJsonExists,
} from "../utils/divers.ts";

////////////////////////////////////////////////////////////////////////////////
// MUTE BY DEFAULT
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

////////////////////////////////////////////////////////////////////////////////
// TERRAFORM DEFAULT CONFIG
////////////////////////////////////////////////////////////////////////////////

const vaultConfigDefault = {};

////////////////////////////////////////////////////////////////////////////////
// RUNNING COMMAND LOCATION
////////////////////////////////////////////////////////////////////////////////

let currentPath = await detectScriptsDirectory(Deno.cwd());

cd(currentPath);

////////////////////////////////////////////////////////////////////////////////
// CURRENT METADATA
////////////////////////////////////////////////////////////////////////////////

let metaConfig = await verifyIfMetaJsonExists(currentPath);

////////////////////////////////////////////////////////////////////////////////
// UTILS
////////////////////////////////////////////////////////////////////////////////

async function defineSecretNamespace(target?: string) {
  const ENV = Deno.env.get("ENV");
  let currentPath = await detectScriptsDirectory(Deno.cwd());
  cd(currentPath);
  let metaConfig = await fs.readJsonSync("meta.json");
  let { id, scope } = metaConfig;
  let secretNamespace;
  if (target) {
    secretNamespace = `${id}/${target}`;
  } else if (scope === "global") {
    secretNamespace = `${id}/global`;
  } else {
    let environment;
    if (ENV === "prod") {
      environment = "prod";
    } else if (ENV === "preview") {
      environment = "preview";
    } else {
      environment = "dev";
    }

    secretNamespace = `${id}/${environment}`;
  }
  $.verbose = true;
  return secretNamespace;
}

////////////////////////////////////////////////////////////////////////////////
// Import json file
////////////////////////////////////////////////////////////////////////////////

export async function vaultKvCertsToVault(data: any, directoryPath: string) {
  if (directoryPath !== undefined) {
    metaConfig = await verifyIfMetaJsonExists(directoryPath);
  }

  let secretPath = await defineSecretNamespace();

  secretPath = `${secretPath}/certificats`;

  await $`vault kv put kv/${secretPath} CREDS=${data}`;
}

////////////////////////////////////////////////////////////////////////////////
// Import json file
////////////////////////////////////////////////////////////////////////////////

export async function vaultKvCertsToLocal(data: any) {
  let secretPath = await defineSecretNamespace();

  secretPath = `${secretPath}/certificats`;

  const randomFilename = Math.floor(Math.random() * 1000000);

  try {
    await $`vault kv get -format=json kv/${secretPath}  > /tmp/env.${randomFilename}.json`;

    $.verbose = true;

    const credsValue = fs.readJSONSync(`/tmp/env.${randomFilename}.json`);

    const { CREDS } = credsValue.data;

    return CREDS;
  } catch (e) {
    return "";
  }
}

////////////////////////////////////////////////////////////////////////////////
// Import .env FILE to remote vault
////////////////////////////////////////////////////////////////////////////////

export async function vaultKvLocalToVault(options: any) {
  const { target, envfile } = options;

  let envfilePath = "";

  const targetSet = target !== undefined ? target : "local";

  if (envfile) {
    envfilePath = envfile;
  } else {
    envfilePath = `.env.${targetSet}`;
  }

  const envFileRaw = await fs.readFileSync(envfilePath, "utf8");

  let secretPath = await defineSecretNamespace(targetSet);

  secretPath = `${secretPath}/secrets`;

  $.verbose = true;

  await $`vault kv put kv/${secretPath} CREDS=${envFileRaw}`;
}

////////////////////////////////////////////////////////////////////////////////
// Export remote vault credentials to gke secret credentials
////////////////////////////////////////////////////////////////////////////////

export async function vaultKvVaultToGkeCredentials() {
  let secretPath = await defineSecretNamespace();

  secretPath = `${secretPath}/secrets`;

  const randomFilename = Math.floor(Math.random() * 1000000);

  await $`vault kv get -format=json kv/${secretPath}  > /tmp/env.${randomFilename}.json`;

  $.verbose = true;

  const credsValue = fs.readJSONSync(`/tmp/env.${randomFilename}.json`);

  const { CREDS } = credsValue.data;

  return CREDS;
}

////////////////////////////////////////////////////////////////////////////////
// Export remote vault credentials to .env file
////////////////////////////////////////////////////////////////////////////////

export async function vaultKvVaultToLocalEntry(options: any) {
  const { all } = options;

  if (all) {
    await vaultKvVaultToLocalAll();
  } else {
    await vaultKvVaultToLocalUnit({ options });
  }
}

////////////////////////////////////////////////////////////////////////////////
// Export all proeject vault secrets to .env file
////////////////////////////////////////////////////////////////////////////////

export async function vaultKvVaultToLocalAll() {
  let metaConfig = await fs.readJsonSync("meta.json");
  let allDirectories = await recursiveDirectoriesDiscovery(
    `${Deno.env.get("SRC")}`
  );

  allDirectories.push(`${Deno.env.get("SRC")}`);

  for (let directory of allDirectories) {
    const meta = await verifyIfMetaJsonExists(directory);

    if (meta.secrets) {
      metaConfig = meta;
      currentPath = directory;
      sleep(2000);
      await vaultKvVaultToLocalUnit({ currentPathNew: currentPath });
    }
  }
}

////////////////////////////////////////////////////////////////////////////////
// Export remote vault credentials to .env file
////////////////////////////////////////////////////////////////////////////////

export async function vaultKvVaultToLocalUnit({
  currentPathNew,
  options = {},
}: any) {
  let currentPath = await detectScriptsDirectory(Deno.cwd());

  if (currentPathNew !== undefined) {
    currentPath = currentPathNew;
  }

  cd(currentPath);

  let metaConfig = await fs.readJsonSync("meta.json");

  let { vault } = metaConfig;

  if (vault !== undefined) {
    let { ignoreEnv } = vault;
    if (ignoreEnv) {
      const environment = Deno.env.get("ENV");

      // verify if environment is included in ignoreEnv array
      if (ignoreEnv.includes(environment)) {
        return;
      }
    }
  }

  const { target, envfile } = options;

  let secretPath;

  if (target === undefined) {
    secretPath = await defineSecretNamespace();
  } else {
    secretPath = await defineSecretNamespace(target);
  }

  // generate a random integer number

  const randomFilename = Math.floor(Math.random() * 1000000);

  secretPath = `${secretPath}/secrets`;

  await $`vault kv get -format=json kv/${secretPath}  > /tmp/env.${randomFilename}.json`;

  const credsValue = await fs.readJSONSync(`/tmp/env.${randomFilename}.json`);

  const { CREDS } = credsValue.data.data;

  // if .env file exists, create a backup

  if (envfile) {
    fs.writeFileSync(envfile, CREDS, "utf8");
  } else {
    fs.writeFileSync(".env", CREDS, "utf8");
    if (fs.existsSync(".env.backup")) {
      fs.unlinkSync(".env.backup");
    }
  }
}

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

// commands
// create/update a vault secret
// actions

export default async function vault(program: any) {
  const vault = program.command("vault");
  vault.description("manage project secrets");
  const vaultKv = vault.command("kv");
  vaultKv.description("manage key-value pairs");

  const vaultKvImport = vaultKv.command("import");
  const vaultKvExport = vaultKv.command("export");

  vaultKvImport
    .description("from .env to remote vault")
    .action(vaultKvLocalToVault)
    .option("--envfile <path>", "path to .env file")
    .option("--target <environment>", "environment target");

  vaultKvExport
    .description("from remote vault to .env")
    .option("--all", "export all project secrets")
    .option("--envfile <path>", "path to .env file")
    .option("--target <environment>", "environment target")
    .action(vaultKvVaultToLocalEntry);
}
