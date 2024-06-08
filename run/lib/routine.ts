import { $, cd, within } from 'npm:zx@8.1.0';
import {
  detectScriptsDirectory,
  verifyIfMetaJsonExists,
} from '../utils/divers.ts';
import { cmd } from './custom.ts';
import fs from 'npm:fs-extra@11.2.0';

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

////////////////////////////////////////////////////////////////////////////////
//
////////////////////////////////////////////////////////////////////////////////
export async function generateTreeCommands(
  scripts: string[],
  routineMap: any
): Promise<any> {
  function resolveRoutine(task: string, routines: any): any {
    const command = routines[task];

    if (!command) {
      return task; // If it's not a routine, return the task itself
    }

    // If the command starts with 'parallel ' or 'sequence ', handle them specially
    if (command.startsWith('parallel ')) {
      const parallelTasks = command
        .slice(9)
        .split(' ')
        .map((task: string) => task.trim());
      return {
        tasks: parallelTasks.map((task: string) =>
          resolveRoutine(task, routines)
        ),
        mode: 'parallel',
      };
    }

    if (command.startsWith('sequence ')) {
      const sequenceTasks = command
        .slice(9)
        .split(' ')
        .map((task: string) => task.trim());
      return {
        tasks: sequenceTasks.map((task: string) =>
          resolveRoutine(task, routines)
        ),
        mode: 'sequence',
      };
    }

    // Split the command string by && for sequence
    const sequenceParts = command
      .split('&&')
      .map((part: string) => part.trim());
    if (sequenceParts.length > 1) {
      return {
        tasks: sequenceParts.map((part: string) =>
          resolveRoutine(part, routines)
        ),
        mode: 'sequence',
      };
    }

    // Split the command string by & for parallel
    const parallelParts = command.split('&').map((part: string) => part.trim());
    if (parallelParts.length > 1) {
      return {
        tasks: parallelParts.map((part: any) => resolveRoutine(part, routines)),
        mode: 'parallel',
      };
    }

    // If the command does not contain any of the above patterns, return the command itself
    return command;
  }

  function buildTaskTree(tasks: string[], routines: any) {
    return tasks.map((task: string) => {
      if (routines[task]) {
        return resolveRoutine(task, routines);
      } else {
        return task;
      }
    });
  }

  function generateObjectTree(
    tasks: string[],
    routines: any,
    initialMode = 'parallel'
  ) {
    const taskTree = buildTaskTree(tasks, routines);
    return {
      tasks: taskTree,
      mode: initialMode,
    };
  }

  return generateObjectTree(scripts, routineMap);
}

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function npm(program: any) {
  $.verbose = false;
  const routine = program.command('routine');
  routine
    .description('run npm scripts')
    .argument('<script...>', 'script to run')
    .option('--parallel', 'Run scripts in parallel')
    .option('--sequence', 'Run scripts in sequence')
    .action(async (scripts: string[], options: any) => {
      $.verbose = false;

      Deno.env.set('FORCE_COLOR', '1');

      const routines = metaConfig?.routines;

      if (!routines) {
        console.log('No routines found');
        Deno.exit(0);
      }

      const result = await generateTreeCommands(scripts, routines);

      async function executeCommand(command: string) {
        $.verbose = true;

        // if command start with cd then change directory

        if (command.startsWith('cd ')) {
          const directory = command.slice(3);
          await cd(directory);
          return;
        } else {
          const isCustomCommand = cmd`${command}`;
          await $`${isCustomCommand}`;
        }
      }

      /**
       * Recursively execute tasks based on their mode.
       * @param {object} taskObject - The task object containing tasks and mode.
       */
      async function executeTasks(taskObject: any) {
        const { tasks, mode } = taskObject;

        if (mode === 'parallel') {
          await Promise.all(
            tasks.map((task: any) => {
              if (typeof task === 'string') {
                return executeCommand(task);
              } else {
                return executeTasks(task);
              }
            })
          );
        } else if (mode === 'sequence') {
          await within(async () => {
            for await (const task of tasks) {
              if (typeof task === 'string') {
                await executeCommand(task);
              } else {
                await executeTasks(task);
              }
            }
          });
        }
      }

      // Run the task tree
      executeTasks(JSON.parse(JSON.stringify(result)))
        .then(() => {
          console.log('All tasks executed successfully.');
        })
        .catch((error) => {
          console.error('Error executing tasks:', error);
        });
    });
}
