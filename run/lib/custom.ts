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

/**
 * Environment configuration for custom options
 */
export interface CustomOptionsEnv {
  [key: string]: string;
}

/**
 * Configuration options for custom command execution
 */
export interface CustomOptions {
  /** Environment configuration */
  env: CustomOptionsEnv;
  /** Run command string */
  run?: string;
  /** Main execution function */
  main: typeof main;
  /** Meta configuration object */
  metaConfig?: any;
  /** Current working path */
  currentPath: string;
  /** Extract function for parsing arguments */
  extract: (inputName: string) => string | undefined;
  /** Function to check argument existence */
  has: (arg: string) => boolean;
  /** Command template function */
  cmd: (
    template: string | TemplateStringsArray,
    ...substitutions: any[]
  ) => Promise<string[]>;
  /** Start function for initialization */
  start: (config: CustomStartConfig) => Promise<void>;
}

/**
 * Arguments passed to custom functions
 */
export type CustomArgs = string[];

/**
 * Command execution options with priority settings
 */
export interface CommandOptions {
  /** Execution priority level */
  priority?: number;
}

/**
 * Function-based command configuration with options
 */
export interface CustomStartConfigCommandFunction extends CommandOptions {
  /** Command function to execute */
  command: CustomFunction;
  /** Function options */
  options?: any;
  /** Environment variables (not used for functions) */
  variables?: never;
}

/**
 * String-based command configuration with variables
 */
export interface CustomStartConfigCommandCommand extends CommandOptions {
  /** Command string to execute */
  command: string;
  /** Environment variables for command substitution */
  variables?: any;
  /** Command options (not used for string commands) */
  options?: never;
}

/**
 * Custom function type for command execution
 */
export type CustomFunction = (options: any) => Promise<void>;

/**
 * Configuration object for custom start operations
 */
export interface CustomStartConfig {
  [key: string]:
    | string
    | CustomFunction
    | CustomStartConfigCommandFunction
    | CustomStartConfigCommandCommand;
}

/**
 * Custom start function interface
 */
export interface CustomStart {
  (config: CustomStartConfig): Promise<void>;
}

/**
 * Commander.js options for custom commands
 */
export interface CustomCommanderOptions {
  /** Root directory path */
  root?: string;
  /** Run all available commands */
  all?: boolean;
  /** Development mode flag */
  dev?: boolean;
}

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

/**
 * Create a start function for executing custom commands with priority ordering
 *
 * This function returns a start function that can execute multiple commands
 * in priority order, supporting both string commands and function calls.
 *
 * @param args - The command arguments (string or array of strings)
 * @param options - Configuration options for command execution
 * @param options.root - Root directory for script execution
 * @param options.all - Whether to run all available commands
 * @param options.dev - Whether to run in development mode
 * @returns A start function that executes the configured commands
 *
 * @example
 * ```typescript
 * const startFn = await start(['build', 'test'], { all: false });
 * await startFn({
 *   build: { command: 'npm run build', priority: 1 },
 *   test: { command: 'npm test', priority: 2 }
 * });
 * ```
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

    if (all === true) {
      let allCommands = Object.keys(commands);

      commandsToRun.push(...allCommands);
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
 * Create an extract function for parsing input arguments
 *
 * This function returns a function that can extract values from command-line
 * arguments formatted as KEY=VALUE pairs.
 *
 * @param args - Array of command-line arguments to parse
 * @returns A function that extracts values by input name
 *
 * @example
 * ```typescript
 * const extractFn = await extract(['env=production', 'debug=true']);
 * const environment = extractFn('env'); // returns 'production'
 * const debugMode = extractFn('debug'); // returns 'true'
 * ```
 */
export async function extract(args: string[]): Promise<any> {
  return function extract(inputName: string) {
    // return the value of the input
    // format of each input is: INPUT_NAME=INPUT_VALUE

    if (args === undefined) {
      return undefined;
    }

    let foundElement = _.find(args, (element: any) => {
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
 * Create a function to check if arguments contain a specific value
 *
 * This function returns a function that can check whether a specific
 * argument exists in the provided arguments array.
 *
 * @param args - Array of arguments to search in
 * @returns A function that checks if a specific argument exists
 *
 * @example
 * ```typescript
 * const hasFn = has(['--verbose', '--debug', 'production']);
 * const isVerbose = hasFn('--verbose'); // returns true
 * const isQuiet = hasFn('--quiet'); // returns false
 * ```
 */
export function has(args: string[]): (arg: string) => boolean {
  return function (arg: string): boolean {
    if (args === undefined) {
      return false;
    }

    if (Array.isArray(args)) {
      return args.includes(arg);
    }

    return false;
  };
}

/**
 * Create a command array from a template string
 *
 * This function converts a command template string into an array of arguments,
 * supporting both regular strings and template literals with substitutions.
 *
 * @param template - The command template (string or template literal)
 * @param substitutions - Values to substitute in template literals
 * @returns An array of command arguments split by spaces
 *
 * @example
 * ```typescript
 * // Simple string command
 * const command1 = cmd('docker build -t myapp .');
 * // Returns: ['docker', 'build', '-t', 'myapp', '.']
 *
 * // Template literal with substitution
 * const image = 'myapp:latest';
 * const command2 = cmd`docker run ${image}`;
 * // Returns: ['docker', 'run', 'myapp:latest']
 * ```
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

/**
 * Execute a custom TypeScript script with enhanced runtime context
 *
 * This function dynamically imports and executes a TypeScript script,
 * providing it with a rich context including meta configuration,
 * utility functions, and environment access.
 *
 * @param script - Name of the script to run (without .ts extension)
 * @param argument - Arguments to pass to the script
 * @param options - Execution options
 * @param options.dev - Whether to run in development mode
 * @param options.root - Custom root directory for script lookup
 *
 * @example
 * ```typescript
 * // Run a script called 'deploy.ts' in the scripts folder
 * await runScript('deploy', ['--env=production'], { dev: false });
 *
 * // Run with custom root directory
 * await runScript('build', [], { root: 'custom-scripts' });
 * ```
 */
async function runScript(script: string, argument: string[], options: any) {
  if (!script) {
    console.log('specify a script to run');
    return;
  }

  Deno.env.set('CUSTOM_STATUS', 'in_progress');

  let currentPath = Deno.cwd();

  let { dev } = options;

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

  // Get the scripts subfolder from meta.json or default
  const scriptsFolder = custom?.root || 'scripts';

  let scriptPath = '';
  let isAbsolutePath = false;

  if (options.root) {
    // If root is specified, try direct path first
    const directPath = `${currentPath}/${options.root}/${script}.ts`;
    const subfolderPath = `${currentPath}/${options.root}/${scriptsFolder}/${script}.ts`;

    try {
      await Deno.stat(directPath);
      scriptPath = directPath;
    } catch {
      try {
        await Deno.stat(subfolderPath);
        scriptPath = subfolderPath;
      } catch {
        console.log(
          `Script not found in either:\n${directPath}\nor\n${subfolderPath}`
        );
        return;
      }
    }
  } else {
    // If no root specified, only look in scripts folder
    scriptPath = `${currentPath}/${scriptsFolder}/${script}.ts`;
    try {
      await Deno.stat(scriptPath);
    } catch {
      console.log(`Script not found: ${scriptPath}`);
      return;
    }
  }

  // if there is a custom script
  // try to run the custom script
  try {
    const specifier = script !== 'DO_NOT_SET_TO_THIS_VALUE' ? scriptPath : '';

    const custom_function = await import(specifier);

    // Keep verbose mode off to avoid zx interfering with stdio output
    $.verbose = false;

    // Set the working directory to the current path which may have been changed
    cd(currentPath);

    let env = Deno.env.toObject();

    await custom_function.default(argument, {
      metaConfig,
      currentPath,
      env,
      run,
      main,
      cmd,
      extract: await extract(argument),
      has: has(argument),
      start: await start(argument, options),
    });
  } catch (e) {
    console.log(e);
    console.log('something went wrong');
  }
}
////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function commandCustom(program: any) {
  const custom = program.command('custom');
  custom
    .description('run custom script')
    .argument('[script]', 'script to perform')
    .argument('[argument...]', 'arguments for the script')
    .option('--all', 'run all start commands')
    .option('--dev', 'run in dev mode')
    .option('-r,--root <path>', 'root path for the custom script')
    .action(runScript);
}

////////////////////////////////////////////////////////////////////////////////
// THE END
////////////////////////////////////////////////////////////////////////////////
