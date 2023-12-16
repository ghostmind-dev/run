import { $, which, sleep, cd, fs } from "zx";
import {
  detectScriptsDirectory,
  verifyIfMetaJsonExists,
} from "../utils/divers.mjs";
import { config } from "dotenv";

////////////////////////////////////////////////////////////////////////////////
// MUTE BY DEFAULT
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

////////////////////////////////////////////////////////////////////////////////
// ACTION DEFAULT CONFIG
////////////////////////////////////////////////////////////////////////////////

const hasuraConfigDefault = {
  state: "container/state",
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
// RUN ACTION LOCALLY WITH ACT
////////////////////////////////////////////////////////////////////////////////

export async function hasuraOpenConsole(options) {
  const metaConfig = await fs.readJsonSync("meta.json");

  const { hasura: hasuraConfig } = metaConfig;

  const { local } = options;

  const { state } = { ...hasuraConfigDefault, ...hasuraConfig };

  cd(`${currentPath}/${state}`);

  $.verbose = true;

  const HASURA_GRAPHQL_ENDPOINT = process.env.HASURA_GRAPHQL_ENDPOINT;

  let HASURA_GRAPHQL_HGE_ENPOINT = process.env.HASURA_GRAPHQL_HGE_ENPOINT;

  if (local || HASURA_GRAPHQL_HGE_ENPOINT !== undefined) {
    const HASURA_GRAPHQL_CONSOLE_PORT =
      process.env.HASURA_GRAPHQL_CONSOLE_PORT || 8085;
    HASURA_GRAPHQL_HGE_ENPOINT =
      process.env.HASURA_GRAPHQL_HGE_ENPOINT || "http://0.0.0.0:8081";
    console.log(HASURA_GRAPHQL_HGE_ENPOINT);
    console.log(HASURA_GRAPHQL_ENDPOINT);

    await $`hasura console --endpoint ${HASURA_GRAPHQL_ENDPOINT} --no-browser --address 0.0.0.0 --console-port ${HASURA_GRAPHQL_CONSOLE_PORT} --console-hge-endpoint ${HASURA_GRAPHQL_HGE_ENPOINT} --skip-update-check`;
    return;
  }

  await $`hasura console --endpoint ${HASURA_GRAPHQL_ENDPOINT} --no-browser --skip-update-check`;
}

////////////////////////////////////////////////////////////////////////////////
// SQUASH MIGRATIONS
////////////////////////////////////////////////////////////////////////////////

export async function hasuraMigrateSquash(version, options) {
  const metaConfig = await fs.readJsonSync("meta.json");

  const { hasura: hasuraConfig } = metaConfig;

  const { state } = { ...hasuraConfigDefault, ...hasuraConfig };

  cd(`${currentPath}/${state}`);

  const HASURA_GRAPHQL_ENDPOINT = process.env.HASURA_GRAPHQL_ENDPOINT;

  $.verbose = true;
  await $`hasura migrate squash --endpoint ${HASURA_GRAPHQL_ENDPOINT} --from ${version} --database-name default`;
}

////////////////////////////////////////////////////////////////////////////////
// CREATE MIGRATIONS
////////////////////////////////////////////////////////////////////////////////

export async function hasuraMigrateCreate(name) {
  const metaConfig = await fs.readJsonSync("meta.json");

  const { hasura: hasuraConfig } = metaConfig;

  const { state } = { ...hasuraConfigDefault, ...hasuraConfig };

  cd(`${currentPath}/${state}`);

  $.verbose = true;

  await $`hasura migrate create "${name}" --from-server --database-name default`;
}

////////////////////////////////////////////////////////////////////////////////
// APPLY MIGRATIONS
////////////////////////////////////////////////////////////////////////////////

export async function hasuraMigrateApply(options) {
  const metaConfig = await fs.readJsonSync("meta.json");

  const { hasura: hasuraConfig } = metaConfig;

  const { state } = { ...hasuraConfigDefault, ...hasuraConfig };

  cd(`${currentPath}/${state}`);

  $.verbose = true;

  const HASURA_GRAPHQL_ENDPOINT = process.env.HASURA_GRAPHQL_ENDPOINT;

  await $`hasura migrate apply --endpoint ${HASURA_GRAPHQL_ENDPOINT} --database-name default`;
}

////////////////////////////////////////////////////////////////////////////////
//  EXPORT SCHEMA
////////////////////////////////////////////////////////////////////////////////

export async function hasuraSchemaExportToLocal() {
  const HASURA_GRAPHQL_API_ENDPOINT = process.env.HASURA_GRAPHQL_API_ENDPOINT;
  const HASURA_GRAPHQL_ADMIN_SECRET = process.env.HASURA_GRAPHQL_ADMIN_SECRET;
  const SRC = process.env.SRC;

  await $`gq ${HASURA_GRAPHQL_API_ENDPOINT} -H "X-Hasura-Admin-Secret: ${HASURA_GRAPHQL_ADMIN_SECRET}" --introspect > ${SRC}/schema.graphql`;
}

////////////////////////////////////////////////////////////////////////////////
// METADATA APPLY
////////////////////////////////////////////////////////////////////////////////

export async function metaDataApply(options) {
  const metaConfig = await fs.readJsonSync("meta.json");

  const { hasura: hasuraConfig } = metaConfig;

  const { state } = { ...hasuraConfigDefault, ...hasuraConfig };

  cd(`${currentPath}/${state}`);

  $.verbose = true;

  const HASURA_GRAPHQL_ENDPOINT = process.env.HASURA_GRAPHQL_ENDPOINT;

  await $`hasura metadata apply --endpoint ${HASURA_GRAPHQL_ENDPOINT}`;
}

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function hasura(program) {
  const hasura = program.command("hasura");
  hasura.description("perform hasura maintenances");

  const hasuraConsole = hasura.command("console");
  const hasuraMigrate = hasura.command("migrate");
  const hasuraMetadata = hasura.command("metadata");

  hasuraConsole
    .description("open hasura console locally ")
    .option("--local", "use local hasura")
    .action(hasuraOpenConsole);

  const migrateSquash = hasuraMigrate.command("squash");
  migrateSquash
    .description("squash all migrations")
    .argument("<version>", "version to squash to")
    .option("--local", "use local hasura")
    .action(hasuraMigrateSquash);

  const migrateApply = hasuraMigrate.command("apply");
  migrateApply
    .description("apply all migrations")
    .option("--local", "use local hasura")
    .action(hasuraMigrateApply);

  const hasuraMetadataApply = hasuraMetadata.command("apply");
  hasuraMetadataApply
    .description("apply metadata")
    .option("--local", "use local hasura")
    .action(metaDataApply);
}
