// @deno-types="../types/global.d.ts"

import { $, cd } from 'npm:zx@8.1.0';
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
// RUN CUSTOM SCRIPT
////////////////////////////////////////////////////////////////////////////////

export async function runScript(
  script: string,
  argument: string[] | string,
  options: any
) {
  let currentPath = Deno.cwd();

  let { test, input, dev, all } = options;

  ////////////////////////////////////////////////////////////////////////////////
  // CURRENT METADATA
  ////////////////////////////////////////////////////////////////////////////////

  let metaConfig = await verifyIfMetaJsonExists(currentPath);

  if (metaConfig === undefined) {
    return;
  }

  let { custom_script } = metaConfig;

  let testMode = test === undefined ? {} : { root: 'test' };

  const SRC = Deno.env.get('SRC');
  const HOME = Deno.env.get('HOME');

  let NODE_PATH: any = await $`npm root -g`;
  NODE_PATH = NODE_PATH.stdout.trim();

  const run =
    dev === true ? `${SRC}/dev/run/bin/cmd.ts` : `${HOME}/run/run/bin/cmd.ts`;

  ////////////////////////////////////////////////////////////////////////////////
  // EXTRACT
  ////////////////////////////////////////////////////////////////////////////////

  const PORT = Deno.env.get('PORT');

  let url: any = {
    internal: `http://host.docker.internal:${PORT}`,
    local: `http://localhost:${PORT}`,
  };

  if (metaConfig.tunnel) {
    let subdomain = metaConfig.tunnel.subdomain;

    let tunnelUrl = '';

    if (subdomain) {
      tunnelUrl = `https://${subdomain}.${Deno.env.get(
        'CLOUDFLARED_TUNNEL_URL'
      )}`;
    } else {
      tunnelUrl = `https://${Deno.env.get('CLOUDFLARED_TUNNEL_URL')}`;
    }

    url['tunnel'] = tunnelUrl;
  }

  ////////////////////////////////////////////////////////////////////////////////
  // EXTRACT
  ////////////////////////////////////////////////////////////////////////////////

  async function extract(inputName: string) {
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
  }

  ////////////////////////////////////////////////////////////////////////////////
  // HAS
  ////////////////////////////////////////////////////////////////////////////////

  function has(argumentation: any) {
    return function (arg: any) {
      if (argumentation === undefined) {
        return false;
      }
      if (typeof argumentation === 'string') {
        return argumentation === arg;
      }
      if (Array.isArray(argumentation)) {
        return argument.includes(arg);
      }
    };
  }

  ////////////////////////////////////////////////////////////////////////////////
  // cmd
  ////////////////////////////////////////////////////////////////////////////////

  type MyFunctionType = {
    (str: string): string[];
    (template: TemplateStringsArray, ...substitutions: any[]): string[];
  };

  const cmd: MyFunctionType = (
    template: string | TemplateStringsArray,
    ...substitutions: any[]
  ): string[] => {
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
  };

  ////////////////////////////////////////////////////////////////////////////////
  // cmd
  ////////////////////////////////////////////////////////////////////////////////

  async function start(args: string | string[]): Promise<CustomStart> {
    return async function (config: CustomStartConfig): Promise<void> {
      let { commands, groups } = config;

      // the sequnce goes like this
      // if verify if the args is a string,
      // if so, it will verify if a group extist with the same name and run the group
      // if not, it will verify if a command exist with the same name and run the command
      // if not, it will output a message saying that the command or group does not exist

      let commandsToRun: string[] = [];

      if (args === undefined) {
        console.log('no args');
        return;
      }

      if (all === true) {
        let allCommands = Object.keys(commands);

        commandsToRun.push(...allCommands);
      } else if (typeof args === 'string') {
        console.log('args', args);

        if (groups && groups[args] !== undefined) {
          commandsToRun.push(...groups[args]);
        } else if (commands[args] !== undefined) {
          commandsToRun.push(args);
        } else {
          console.log('command or group does not exist');
          return;
        }
      } else if (Array.isArray(args)) {
        // verify if one of the args is a group
        // the first group found will be run

        for (let arg of args) {
          if (groups && groups[arg] !== undefined) {
            commandsToRun.push(...groups[arg]);
            break;
          }
        }

        // if no group is found

        if (commandsToRun.length === 0) {
          for (let arg of args) {
            if (commands[arg] !== undefined) {
              commandsToRun.push(arg);
            }
          }
        }
      }

      await Promise.all(
        commandsToRun.map(async (command) => {
          const commandToRun = cmd`${commands[command]}`;
          await $`${commandToRun}`;
        })
      );
    };
  }

  ////////////////////////////////////////////////////////////////////////////////
  // CUSTOM CONFIG
  ////////////////////////////////////////////////////////////////////////////////

  const { root }: any = {
    ...customConfigDefault,
    ...custom_script,
    ...testMode,
  };
  cd(`${currentPath}/${root}`);

  // if there is no custom script
  // return the list of available custom scripts
  if (script === undefined) {
    try {
      const { stdout: scripts } = await $`ls *.ts`;
      // remove \n from apps
      let scriptsArray = scripts.split('\n');
      // removing empty element from scriptsArray
      scriptsArray.pop();
      console.log('Available scripts:');
      for (let scriptAvailable of scriptsArray) {
        scriptAvailable = scriptAvailable.replace('.ts', '');
        console.log(`- ${scriptAvailable}`);
      }
    } catch (error) {
      console.log('no custom script found');
    }
    return;
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
      extract,
      has: has(argument),
      cmd,
      start: await start(argument),
    };

    let env = Deno.env.toObject();

    input = input === undefined ? [] : input;

    ///////////////////////////////////////////////////////////////////////
    // CALL CUSTOM FUNCTION
    ///////////////////////////////////////////////////////////////////////

    await custom_function.default(argument, {
      env,
      run,
      url,
      main,
      utils,
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
    .action(runScript);
}
