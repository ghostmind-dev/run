import { $, cd } from 'npm:zx@8.1.0';
import {
  detectScriptsDirectory,
  verifyIfMetaJsonExists,
} from '../utils/divers.ts';
import { cmd } from './custom.ts';

////////////////////////////////////////////////////////////////////////////////
// MUTE BY DEFAULT
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

////////////////////////////////////////////////////////////////////////////////
// RUNNING COMMAND LOCATION
////////////////////////////////////////////////////////////////////////////////

let currentPath = await detectScriptsDirectory(Deno.cwd());

cd(currentPath);

////////////////////////////////////////////////////////////////////////////////
// CURRENT METADATA
////////////////////////////////////////////////////////////////////////////////

let metaConfig = await verifyIfMetaJsonExists(currentPath);

// JSDOC

/**
 * Run a command
 * @param {string} command - command to run
 */

export async function runCommand(command: string) {
  if (command.includes('&&')) {
    const commands = command.split('&&').map((cmd) => cmd.trim());
    for await (const cmd_to_run of commands) {
      $.verbose = true;

      if (cmd_to_run.includes('cd')) {
        const path = cmd_to_run.split('cd')[1].trim();
        cd(`${currentPath}/${path}`);
        // go to the next iteration
        continue;
      }

      await $`${cmd`${cmd_to_run}`}`;
    }
  } else if (command.includes('&')) {
    const commands = command.split('&').map((cmd) => cmd.trim());
    await Promise.all(
      commands.map(async (command_to_run) => {
        $.verbose = true;
        await $`${cmd`${command_to_run}`}`;
      })
    );
  } else {
    $.verbose = true;
    await $`${cmd`${command}`}`;
  }
}

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function routine(program: any) {
  $.verbose = false;
  const routine = program.command('routine');
  routine
    .description('run npm scripts')
    .argument('<script>', 'script to run')
    .action(async (script: any) => {
      $.verbose = false;

      const routines = metaConfig?.routines;

      if (routines) {
        if (routines[script]) {
          const routineCommand = routines[script];

          if (routineCommand.startsWith('parallel')) {
            const tasks = routineCommand.split(' ').slice(1);

            await Promise.all(
              tasks.map(async (task: any) => {
                $.verbose = true;
                await $`${routine(task)}`;
              })
            );
          } else if (routineCommand.startsWith('sequence')) {
            const tasks = routineCommand.split(' ').slice(1);

            for (const task of tasks) {
              $.verbose = true;
              await $`${routine(task)}`;
            }
          } else {
            await runCommand(routineCommand);
          }
        }
      }
    });
}

////////////////////////////////////////////////////////////////////////////////
// THE END
////////////////////////////////////////////////////////////////////////////////
