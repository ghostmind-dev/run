import * as zx from "npm:zx";
import {
  verifyIfMetaJsonExists,
  setSecretsUptoProject,
} from "../utils/divers.ts";
import _ from "npm:lodash";

////////////////////////////////////////////////////////////////////////////////
//  SETTING UP ZX
////////////////////////////////////////////////////////////////////////////////

const { $, cd, fs } = zx;

////////////////////////////////////////////////////////////////////////////////
// MUTE BY DEFAULT
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

////////////////////////////////////////////////////////////////////////////////
// CUSTOM CONFIG DEFAULT
////////////////////////////////////////////////////////////////////////////////

const customConfigDefault = {
  root: "scripts",
  getSecretsUpToProject: true,
};

////////////////////////////////////////////////////////////////////////////////
// TYPE DEFINITION
////////////////////////////////////////////////////////////////////////////////

export interface CustomScriptOptions {
  input?: string[];
  extract?: (inputName: string) => string | undefined;
  detect?: (value: string) => boolean;
  has?: (argument: string | string[]) => (arg: string) => boolean;
  metaConfig?: any;
  currentPath?: string;
  run?: string;
  env?: Record<string, string>;
}

export type CustomScriptArgument = string;

////////////////////////////////////////////////////////////////////////////////
// RUN CUSTOM SCRIPT
////////////////////////////////////////////////////////////////////////////////

async function runCustomScript(
  script: string,
  argument: string[] | string,
  options: any
) {
  let { custom_script } = await fs.readJsonSync("meta.json");

  let currentPath = Deno.cwd();

  let { test, input, dev } = options;

  ////////////////////////////////////////////////////////////////////////////////
  // CURRENT METADATA
  ////////////////////////////////////////////////////////////////////////////////

  let metaConfig = await verifyIfMetaJsonExists(currentPath);

  let testMode = test === undefined ? {} : { root: "test" };

  const SRC = Deno.env.get("SRC");
  const HOME = Deno.env.get("HOME");

  let NODE_PATH: any = await $`npm root -g`;
  NODE_PATH = NODE_PATH.stdout.trim();

  const run =
    dev === true ? `${SRC}/dev/play/bin/cmd.ts` : `${HOME}/run/play/bin/cmd.ts`;
  ////////////////////////////////////////////////////////////////////////////////
  // GET INPUT VALUE
  ////////////////////////////////////////////////////////////////////////////////

  async function extract(inputName: string) {
    // return the value of the input
    // format of each input is: INPUT_NAME=INPUT_VALUE
    let foundElement = _.find(input, (element: any) => {
      // if the element is not a string
      // return false
      if (typeof element !== "string") {
        return false;
      }

      // if the element does not contain the inputName
      // return false
      if (!element.includes(`${inputName}=`)) {
        return false;
      }

      // if the element contains the inputName
      // return true
      return true;
    });
    // remove inputName=- from the element

    if (foundElement === undefined) {
      return undefined;
    }

    foundElement = foundElement.replace(`${inputName}=`, "");

    return foundElement;
  }

  function has(argument: any) {
    return function (arg: any) {
      if (argument === undefined) {
        return false;
      }
      if (typeof argument === "string") {
        return argument === arg;
      }
      if (Array.isArray(argument)) {
        return argument.includes(arg);
      }
    };
  }

  ////////////////////////////////////////////////////////////////////////////////
  // VERIFY IF VALUE EXISTS
  ////////////////////////////////////////////////////////////////////////////////

  function detect(value: string) {
    return _.some(input, (x: string) => x === `${value}`);
  }

  ////////////////////////////////////////////////////////////////////////////////
  // CUSTOM CONFIG
  ////////////////////////////////////////////////////////////////////////////////

  const { root, getSecretsUpToProject }: any = {
    ...customConfigDefault,
    ...custom_script,
    ...testMode,
  };
  cd(`${currentPath}/${root}`);

  if (getSecretsUpToProject === true) {
    await setSecretsUptoProject(currentPath);
  }

  // if there is no custom script
  // return the list of available custom scripts
  if (script === undefined) {
    try {
      const { stdout: scripts } = await $`ls *.ts`;
      // remove \n from apps
      let scriptsArray = scripts.split("\n");
      // removing empty element from scriptsArray
      scriptsArray.pop();
      console.log("Available scripts:");
      for (let scriptAvailable of scriptsArray) {
        scriptAvailable = scriptAvailable.replace(".ts", "");
        console.log(`- ${scriptAvailable}`);
      }
    } catch (error) {
      console.log("no custom script found");
    }
    return;
  }
  // if there is a custom script
  // try to run the custom script
  try {
    const specifier =
      script !== "DO_NOT_SET_TO_THIS_VALUE"
        ? `${currentPath}/${root}/${script}.ts`
        : "";

    const custom_function = await import(specifier);

    $.verbose = true;

    if (argument.length === 1) {
      argument = argument[0];
    }

    await custom_function.default(argument, {
      input: input === undefined ? [] : input,
      extract,
      detect,
      has: has(argument),
      metaConfig,
      currentPath,
      run,
      env: Deno.env.toObject(),
    });
  } catch (e) {
    console.log(e);
    console.log("something went wrong");
  }
}
////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function commandCustom(program: any) {
  const custom = program.command("custom");
  custom
    .description("run custom script")
    .argument("[script]", "script to perform")
    .argument("[argument...]", "single argument for the script")
    .option("-i, --input <items...>", "multiple arguments for the script")
    .option("--dev", "run in dev mode")
    .option("--test", "run in test mode")
    .action(runCustomScript);
}
