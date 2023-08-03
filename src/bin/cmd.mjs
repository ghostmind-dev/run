#!/usr/bin/env node

import { $, which, fs } from "zx";
import { config } from "dotenv";
import { Command } from "commander";
import commandTerraform from "../lib/command-terraform.mjs";
import commandCustom from "../lib/command-custom.mjs";
import commandVault from "../lib/command-vault.mjs";
import commandAction from "../lib/command-action.mjs";
import commandGithub from "../lib/command-github.mjs";
import commandSkaffold from "../lib/command-skaffold.mjs";
import commandHasura from "../lib/command-hasura.mjs";
import commandCluster from "../lib/command-cluster.mjs";
import commandDb from "../lib/command-db.mjs";
import commandUtils from "../lib/command-utils.mjs";
import commandDocker from "../lib/command-docker.mjs";
import commandVercel from "../lib/command-vercel.mjs";
import commandLib from "../lib/command-lib.mjs";
import commandMachine from "../lib/command-machine.mjs";

////////////////////////////////////////////////////////////////////////////////
// CONST
////////////////////////////////////////////////////////////////////////////////

const SRC = process.env.SRC;

////////////////////////////////////////////////////////////////////////////////
// CONST
////////////////////////////////////////////////////////////////////////////////

const currentPath = process.cwd();

////////////////////////////////////////////////////////////////////////////////
// DOTENV
////////////////////////////////////////////////////////////////////////////////

config({ path: `${SRC}/.env` });
config({ path: `${currentPath}/.env` });

////////////////////////////////////////////////////////////////////////////////
// STARTING PROGRAM
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

const program = new Command();

program.exitOverride();

program.name("run");

////////////////////////////////////////////////////////////////////////////////
// GIT COMMAND
////////////////////////////////////////////////////////////////////////////////

await commandTerraform(program);
await commandCustom(program);
await commandVault(program);
await commandAction(program);
await commandGithub(program);
await commandSkaffold(program);
await commandHasura(program);
await commandCluster(program);
await commandDb(program);
await commandUtils(program);
await commandDocker(program);
await commandVercel(program);
await commandLib(program);
await commandMachine(program);

////////////////////////////////////////////////////////////////////////////////
// GIT COMMAND
////////////////////////////////////////////////////////////////////////////////

try {
  program.parse(process.argv);
} catch (err) {
  const { exitCode, name, code, message } = err;

  if (!message.includes("outputHelp")) {
    console.error("something went wrong");
  }
}
