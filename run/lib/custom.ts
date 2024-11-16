import { $, cd, within } from 'npm:zx@8.1.0';
import { verifyIfMetaJsonExists } from '../utils/divers.ts';
import _ from 'npm:lodash@4.17.21';
import * as main from '../main.ts';

////////////////////////////////////////////////////////////////////////////////
// MUTE BY DEFAULT
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

////////////////////////////////////////////////////////////////////////////////
// CUSTOM CONFIG DEFAULT
////////////////////////////////////////////////////////////////////////////////

const customConfigDefault = {
  root: 'scripts',
};

////////////////////////////////////////////////////////////////////////////////
// RUNNING COMMAND LOCATION
////////////////////////////////////////////////////////////////////////////////

let currentPath = Deno.cwd();

////////////////////////////////////////////////////////////////////////////////
// TYPES
////////////////////////////////////////////////////////////////////////////////

export interface CustomOptionsEnv {
  [key: string]: string;
}

export interface CustomOptionsUtils {
  extract: (inputName: string) => string | undefined;
  has: (arg: string) => boolean;
  cmd: (
    template: string | TemplateStringsArray,
    ...substitutions: any[]
  ) => Promise<string[]>;
  // start take a argument of type string or string[]
  // start return an async function that take a config object
  // start function being retur a Void Promise
  // the config object has to property (commands, groups)
  // the commands property is an object with key value pair
  // the groups object is an object with key value pair
  // value is an array of string

  start: (config: CustomStartConfig) => Promise<void>;
}

export interface CustomOptionsUrl {
  docker: string;
  local: string;
  tunnel: string;
}

export interface CustomOptions {
  env: CustomOptionsEnv;
  run?: string;
  url: CustomOptionsUrl;
  main: typeof main;
  utils: CustomOptionsUtils;
  input?: string[];
  metaConfig?: any;
  currentPath: string;
  test?: boolean;
  port: string;
  extract: (inputName: string) => string | undefined;
  has: (arg: string) => boolean;
  cmd: (
    template: string | TemplateStringsArray,
    ...substitutions: any[]
  ) => Promise<string[]>;
  // start take a argument of type string or string[]
  // start return an async function that take a config object
  // start function being retur a Void Promise
  // the config object has to property (commands, groups)
  // the commands property is an object with key value pair
  // the groups object is an object with key value pair
  // value is an array of string

  start: (config: CustomStartConfig) => Promise<void>;
}

export type CustomArgs = string | string[];

export interface CommandOptions {
  priority?: number;
  groups?: string[];
}

export interface CustomStartConfigCommandFunction extends CommandOptions {
  command: CustomFunction;
  options?: any;
  variables?: never;
}

export interface CustomStartConfigCommandCommand extends CommandOptions {
  command: string;
  variables?: any;
  options?: never;
}

// create a type function that take a config object

export type CustomFunction = (options: any) => Promise<void>;

export interface CustomStartConfig {
  [key: string]:
    | string
    | CustomFunction
    | CustomStartConfigCommandFunction
    | CustomStartConfigCommandCommand;
}

export interface CustomStart {
  (config: CustomStartConfig): Promise<void>;
}

export interface CustomCommanderOptions {
  input?: string[];
  all?: boolean;
  dev?: boolean;
  test?: boolean;
}

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

/**
 * Start function
 * @param {string | string[]} args - The arguments for the start function
 * @param {CustomCommanderOptions} options - The options for the start function
 * @returns {CustomStart} - The start function
 */

export async function start(
  args: string | string[],
  options: CustomCommanderOptions
): Promise<CustomStart> {
  return async function (commands: CustomStartConfig): Promise<void> {
    let { all } = options;

    let commandsToRun: string[] = [];

    if (args === undefined) {
      console.log('no args');
      return;
    }

    let group_from_command = [];

    for (let command in commands) {
      let { groups = [] } = commands[
        command
      ] as CustomStartConfigCommandCommand;

      if (groups.length > 0) {
        group_from_command.push(...groups);
      }
    }

    if (all === true) {
      let allCommands = Object.keys(commands);

      commandsToRun.push(...allCommands);
    } else if (typeof args === 'string') {
      if (group_from_command.includes(args)) {
        for (let command in commands) {
          let { groups = [] } = commands[
            command
          ] as CustomStartConfigCommandCommand;

          if (groups.includes(args)) {
            commandsToRun.push(command);
          }
        }
      } else if (commands[args] !== undefined) {
        commandsToRun.push(args);
      } else {
        console.log('command or group does not exist');
        return;
      }
    } else if (Array.isArray(args)) {
      // verify if one of the args is a group
      // the first group found will be run

      // if no group is found

      if (commandsToRun.length === 0) {
        for (let arg of args) {
          if (commands[arg] !== undefined) {
            commandsToRun.push(arg);
          }
        }
      }
    }

    // for each command to run, group them by priority

    let groupedCommandsPerPriority: any = {};

    for (let command of commandsToRun) {
      let { priority } = commands[command] as CustomStartConfigCommandCommand;

      if (priority === undefined) {
        groupedCommandsPerPriority[999] =
          groupedCommandsPerPriority[999] === undefined
            ? []
            : groupedCommandsPerPriority[999];
        groupedCommandsPerPriority[999].push(command);
      } else {
        groupedCommandsPerPriority[priority] =
          groupedCommandsPerPriority[priority] === undefined
            ? []
            : groupedCommandsPerPriority[priority];
        groupedCommandsPerPriority[priority].push(command);
      }
    }
    // sort the groupedCommandsPerPriority by priority

    let sortedKeys = Object.keys(groupedCommandsPerPriority).sort(
      (a, b) => parseInt(a) - parseInt(b)
    );

    // run the commands by priority order from the lowest to the highest
    // run in Promise.all

    for await (let key of sortedKeys) {
      await Promise.all(
        groupedCommandsPerPriority[key].map(
          async (command_from_config: any) => {
            if (typeof commands[command_from_config] === 'string') {
              const commandToRun = cmd`${commands[command_from_config]}`;
              await within(async () => {
                await $`${commandToRun}`;
              });
            } else if (typeof commands[command_from_config] === 'function') {
              const function_to_call: any = commands[command_from_config];
              await within(async () => {
                cd(currentPath);
                await function_to_call();
              });
            } else if (typeof commands[command_from_config] === 'object') {
              const command_to_run = commands[command_from_config];

              const { command, options, variables } = command_to_run as
                | CustomStartConfigCommandFunction
                | CustomStartConfigCommandCommand;

              if (command !== undefined && typeof command === 'function') {
                let options_to_pass = options === undefined ? {} : options;
                const function_to_call: any = command;

                await within(async () => {
                  cd(currentPath);
                  await function_to_call(options_to_pass);
                });
              }

              if (command !== undefined && typeof command === 'string') {
                const commandToRun = cmd`${command}`;

                // variables is an object with key value pair
                // the command might need variable substitution
                // as an example, the command might be "echo ${this}"

                if (variables !== undefined) {
                  for (let variable in variables) {
                    const value = variables[variable];

                    // in the example, we need to replace ${this} by the value of the variable this

                    const variableToReplace = '$' + variable + '';

                    const indexOfVariable =
                      commandToRun.indexOf(variableToReplace);

                    if (indexOfVariable !== -1) {
                      commandToRun[indexOfVariable] = value;
                    }
                  }
                }

                await within(async () => {
                  cd(currentPath);
                  await $`${commandToRun}`;
                });
              }
            }
          }
        )
      );
    }
  };
}

/**
 * Extract the value of an input
 * @param {string[]} input - The input to extract
 * @param {string | string[]} argument - The argument to extract
 * @returns {function(string): any} - A function that extract the value of an input
 * @returns {Promise<any>} - The value of the input
 */

export async function extract(input: string[]): Promise<any> {
  return async function extract(inputName: string) {
    // return the value of the input
    // format of each input is: INPUT_NAME=INPUT_VALUE
    let foundElement = _.find(input, (element: any) => {
      // if the element is not a string
      // return false
      if (typeof element !== 'string') {
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

    foundElement = foundElement.replace(`${inputName}=`, '');

    return foundElement;
  };
}

/**
 * Verify if the argumentation is equal to the argument
 * @param {string | string[]} argumentation - The argumentation to verify
 * @returns {function(string): boolean} - A function that verify if the argumentation is equal to the argument
 */

export function has(argumentation: any): (arg: string) => boolean {
  return function (arg: string): boolean {
    if (argumentation === undefined) {
      return false;
    }
    if (typeof argumentation === 'string') {
      return argumentation === arg;
    }
    if (Array.isArray(argumentation)) {
      return argumentation.includes(arg);
    }

    return false;
  };
}

/**
 * Create a command
 * @param {string | TemplateStringsArray} template - The template for the command
 * @param {any[]} substitutions - The substitutions for the command
 * @returns {string[]} - The command as an array of string
 */

export function cmd(
  template: string | TemplateStringsArray,
  ...substitutions: any[]
): string[] {
  let result: string;

  if (typeof template === 'string') {
    result = template;
  } else {
    result = template[0];
    substitutions.forEach((sub, i) => {
      result += sub + template[i + 1];
    });
  }

  return result.split(' ');
}

////////////////////////////////////////////////////////////////////////////////
// RUN CUSTOM SCRIPT
////////////////////////////////////////////////////////////////////////////////

// document runScript with JSDoc

/**
 * Run a custom script
 * @param {string} script - The script to run
 * @param {string[]} argument - The arguments for the script
 * @param {Object} options - The options for the script
 */

async function runScript(
  script: string,
  argument: string[] | string,
  options: any
) {
  if (!script) {
    console.log('specify a script to run');
    return;
  }

  Deno.env.set('CUSTOM_STATUS', 'in_progress');

  let currentPath = Deno.cwd();

  let { test, input, dev } = options;

  let metaConfig = await verifyIfMetaJsonExists(currentPath);

  if (metaConfig === undefined) {
    return;
  }

  let { custom } = metaConfig;

  const SRC = Deno.env.get('SRC');
  const HOME = Deno.env.get('HOME');

  let NODE_PATH: any = await $`npm root -g`;
  NODE_PATH = NODE_PATH.stdout.trim();

  const run =
    dev === true ? `${SRC}/dev/run/bin/cmd.ts` : `${HOME}/run/run/bin/cmd.ts`;

  const port = Deno.env.get('PORT');

  let url: CustomOptionsUrl = {
    docker: `http://host.docker.internal`,
    local: `http://localhost`,
    tunnel: await getTunnelUrl(),
  };

  async function getTunnelUrl(): Promise<string> {
    const defaultTunnelUrl = 'http://whereisthetunnelgotdamnit';
    if (metaConfig?.tunnel) {
      let subdomain = metaConfig.tunnel.subdomain;

      let tunnelUrl = defaultTunnelUrl;

      if (subdomain) {
        tunnelUrl = `https://${subdomain}.${Deno.env.get(
          'CLOUDFLARED_TUNNEL_URL'
        )}`;
      } else {
        tunnelUrl = `https://${Deno.env.get('CLOUDFLARED_TUNNEL_URL')}`;
      }

      return tunnelUrl;
    } else {
      return defaultTunnelUrl;
    }
  }

  const { root }: any = {
    ...customConfigDefault,
    ...custom,
    ...options,
  };

  // verify if root folder exists
  try {
    Deno.statSync(`${currentPath}/${root}`);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      console.log(
        `custom folder name: ${root} \n` + `This folder does not exist`
      );
      return;
    }
    throw error; // rethrow if it's a different error
  }

  // if there is a custom script
  // try to run the custom script
  try {
    const specifier =
      script !== 'DO_NOT_SET_TO_THIS_VALUE'
        ? `${currentPath}/${root}/${script}.ts`
        : '';

    const custom_function = await import(specifier);

    $.verbose = true;

    if (argument.length === 1) {
      argument = argument[0];
    }

    cd(currentPath);

    const utils = {
      extract: await extract(input),
      has: has(argument),
      cmd,
      start: await start(argument, options),
    };

    let env = Deno.env.toObject();

    input = input === undefined ? [] : input;

    await custom_function.default(argument, {
      env,
      run,
      url,
      test,
      main,
      utils,
      ...utils,
      port,
      input,
      metaConfig,
      currentPath,
    });
  } catch (e) {
    console.log(e);
    console.log('something went wrong');
  }
}
////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function commandScript(program: any) {
  const custom = program.command('custom');
  custom
    .description('run custom script')
    .argument('[script]', 'script to perform')
    .argument('[argument...]', 'arguments for the script')
    .option('-i, --input <items...>', 'multiple arguments for the script')
    .option('--all', 'run all start commands')
    .option('--dev', 'run in dev mode')
    .option('--test', 'run in test mode')
    .option('--root <path>', 'root path for the custom script')
    .action(runScript);
}

////////////////////////////////////////////////////////////////////////////////
// THE END
////////////////////////////////////////////////////////////////////////////////
