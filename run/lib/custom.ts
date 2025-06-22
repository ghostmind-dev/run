import { $, cd, within } from 'npm:zx@8.1.0';
import { verifyIfMetaJsonExists } from '../utils/divers.ts';
import _ from 'npm:lodash@4.17.21';
import * as main from '../main.ts';
import { setSecretsOnLocal } from '../utils/divers.ts';

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
  /** Set secrets on local environment (only available in programmatic mode) */
  setSecrets?: boolean;
}

/**
 * Configuration object for programmatic runScript execution
 */
export interface RunScriptConfig {
  /** Name of the script to run (without .ts extension) */
  script: string;
  /** Arguments to pass to the script */
  arguments?: string[];
  /** Execution options */
  options?: CustomCommanderOptions;
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
 * Execute a custom TypeScript script with enhanced runtime context (CLI mode)
 *
 * This function dynamically imports and executes a TypeScript script,
 * providing it with a rich context including meta configuration,
 * utility functions, and environment access.
 *
 * @param script - Name of the script to run (without .ts extension)
 * @param argument - Arguments to pass to the script (required, use empty array if none)
 * @param options - Execution options (required, use empty object if none)
 * @param options.dev - Whether to run in development mode
 * @param options.root - Custom root directory for script lookup
 *
 * @example
 * ```typescript
 * // CLI mode - Run a script called 'deploy.ts' in the scripts folder
 * await runScript('deploy', ['--env=production'], { dev: false });
 *
 * // Run with custom root directory
 * await runScript('build', [], { root: 'custom-scripts' });
 * ```
 */
export async function runScript(
  script: string,
  argument: string[],
  options: CustomCommanderOptions
): Promise<void>;

/**
 * Execute a custom TypeScript script with enhanced runtime context (programmatic mode)
 *
 * This function dynamically imports and executes a TypeScript script,
 * providing it with a rich context including meta configuration,
 * utility functions, and environment access.
 *
 * @param config - Configuration object containing script, arguments, and options
 * @param config.script - Name of the script to run (without .ts extension)
 * @param config.arguments - Arguments to pass to the script (optional)
 * @param config.options - Execution options (optional)
 * @param config.options.setSecrets - Set secrets on local environment (defaults to true, only available in programmatic mode)
 *
 * @example
 * ```typescript
 * // Programmatic mode - Run a script with configuration object
 * await runScript({
 *   script: 'deploy',
 *   arguments: ['--env=production'],
 *   options: { dev: false, setSecrets: true }
 * });
 *
 * // Simple script execution without arguments (setSecrets defaults to true)
 * await runScript({ script: 'build' });
 *
 * // Disable setSecrets
 * await runScript({
 *   script: 'build',
 *   options: { setSecrets: false }
 * });
 * ```
 */
export async function runScript(config: RunScriptConfig): Promise<void>;

/**
 * Implementation of runScript supporting both CLI and programmatic modes
 */
export async function runScript(
  scriptOrConfig: string | RunScriptConfig,
  argument?: string[],
  options?: CustomCommanderOptions
): Promise<void> {
  let script: string;
  let args: string[];
  let opts: CustomCommanderOptions;

  // Determine which mode we're in based on the first parameter
  if (typeof scriptOrConfig === 'string') {
    // CLI mode: three separate parameters (argument and options should be provided)
    script = scriptOrConfig;
    args = argument || []; // Fallback for safety, but CLI should always provide this
    opts = options || {}; // Fallback for safety, but CLI should always provide this
  } else {
    // Programmatic mode: single configuration object
    script = scriptOrConfig.script;
    args = scriptOrConfig.arguments || [];
    opts = scriptOrConfig.options || {};

    // Handle setSecrets - only available in programmatic mode

    let currentPath = Deno.cwd();

    cd(currentPath);

    if (opts.setSecrets !== false) {
      // Default to true if not explicitly set to false

      await setSecretsOnLocal(currentPath);
    }
  }
  if (!script) {
    console.log('specify a script to run');
    return;
  }

  Deno.env.set('CUSTOM_STATUS', 'in_progress');

  // Always use the actual current working directory, not the module's location

  let { dev } = opts;

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

  if (opts.root) {
    // If root is specified, try direct path first
    const directPath = `${currentPath}/${opts.root}/${script}.ts`;
    const subfolderPath = `${currentPath}/${opts.root}/${scriptsFolder}/${script}.ts`;

    try {
      await Deno.stat(directPath);
      scriptPath = new URL(`file://${directPath}`).href;
    } catch {
      try {
        await Deno.stat(subfolderPath);
        scriptPath = new URL(`file://${subfolderPath}`).href;
      } catch {
        console.log(
          `Script not found in either:\n${directPath}\nor\n${subfolderPath}`
        );
        return;
      }
    }
  } else {
    // If no root specified, only look in scripts folder
    const localScriptPath = `${currentPath}/${scriptsFolder}/${script}.ts`;
    try {
      await Deno.stat(localScriptPath);
      // Convert to file:// URL for proper import handling
      scriptPath = new URL(`file://${localScriptPath}`).href;
    } catch {
      console.log(`Script not found: ${localScriptPath}`);
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

    await custom_function.default(args, {
      metaConfig,
      currentPath,
      env,
      run,
      main,
      cmd,
      extract: await extract(args),
      has: has(args),
      start: await start(args, opts),
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
