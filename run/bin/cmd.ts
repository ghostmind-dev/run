#!/usr/bin/env -S deno run --allow-all

import { $ } from "npm:zx";
import { config } from "npm:dotenv";
import _ from "npm:lodash";
import { Command, Option } from "npm:commander";
import { resolve } from "https://deno.land/std@0.221.0/path/mod.ts";

////////////////////////////////////////////////////////////////////////////////
// SRC
////////////////////////////////////////////////////////////////////////////////

const SRC = Deno.env.get("SRC");

////////////////////////////////////////////////////////////////////////////////
// CONST
////////////////////////////////////////////////////////////////////////////////

const currentPath = Deno.cwd();

////////////////////////////////////////////////////////////////////////////////
// STARTING PROGRAM
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

const program = new Command();

////////////////////////////////////////////////////////////////////////////////
// COMMAND
////////////////////////////////////////////////////////////////////////////////

import commandAction from "../lib/action.ts";
import commandCustom from "../lib/custom.ts";
import commandDocker from "../lib/docker.ts";
import commandHasura from "../lib/hasura.ts";
import commandMachine from "../lib/machine.ts";
import commandNpm from "../lib/npm.ts";
import commandTerraform from "../lib/terraform.ts";
import commandTunnel from "../lib/tunnel.ts";
import commandUtils from "../lib/utils.ts";
import commmandVault from "../lib/vault.ts";

////////////////////////////////////////////////////////////////////////////////
// DOTENV
////////////////////////////////////////////////////////////////////////////////

config({ path: `${currentPath}/.env.local` });
config({ path: `${Deno.env.get("HOME")}/.zprofile`, override: false });

program
  .option("--envname <env context>", "name of the env to load")
  .on("option:envname", function (envname) {
    config({ path: `${currentPath}/${envname}`, override: true });
    config({ path: `${Deno.env.get("HOME")}/.zprofile`, override: false });
  })
  .option("--envpath <filename>", "path to envfile to load")
  .on("option:envpath", function (filepath) {
    config({ path: resolve(currentPath, filepath), override: true });
    config({ path: `${Deno.env.get("HOME")}/.zprofile`, override: false });
  });

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

program.exitOverride();

program.name("run");

////////////////////////////////////////////////////////////////////////////////
// GIT COMMAND
////////////////////////////////////////////////////////////////////////////////

commandAction(program);
commandCustom(program);
commandDocker(program);
commandHasura(program);
commandMachine(program);
commandNpm(program);
commandTerraform(program);
commandTunnel(program);
commandUtils(program);
commmandVault(program);

////////////////////////////////////////////////////////////////////////////////
// PARSING ARGUMENTS
////////////////////////////////////////////////////////////////////////////////

try {
  program.parse();
} catch (err) {
  const { exitCode, name, code, message } = err;

  if (!message.includes("outputHelp")) {
    console.log(message);
    console.error("something went wrong");
  }
}

////////////////////////////////////////////////////////////////////////////////
// THE END
////////////////////////////////////////////////////////////////////////////////
