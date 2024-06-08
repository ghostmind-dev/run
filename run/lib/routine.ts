import { $, cd } from 'npm:zx@8.1.0';
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
  routines: string[],
  routineMap: any
): Promise<any> {
  function splitCommands(command, routines) {
    if (command.startsWith('parallel ')) {
      const parallelTasks = command
        .slice(9)
        .split(' ')
        .map((task) => task.trim());
      return {
        tasks: parallelTasks.flatMap((task) => splitCommands(task, routines)),
        mode: 'parallel',
      };
    }

    if (command.startsWith('sequence ')) {
      const sequenceTasks = command
        .slice(9)
        .split(' ')
        .map((task) => task.trim());
      return {
        tasks: sequenceTasks.flatMap((task) => splitCommands(task, routines)),
        mode: 'sequence',
      };
    }

    // Split the command string by && for sequence and & for parallel if it contains such commands
    const sequenceParts = command.split('&&').map((part) => part.trim());
    if (sequenceParts.length > 1) {
      return {
        tasks: sequenceParts.flatMap((seqPart) =>
          splitCommands(seqPart, routines)
        ),
        mode: 'sequence',
      };
    }

    const parallelParts = command.split('&').map((part) => part.trim());
    if (parallelParts.length > 1) {
      return {
        tasks: parallelParts.flatMap((parPart) =>
          splitCommands(parPart, routines)
        ),
        mode: 'parallel',
      };
    }

    if (routines[command]) {
      return splitCommands(routines[command], routines);
    }

    return command;
  }

  function buildTaskTree(tasks, routines) {
    return tasks.map((task) => {
      if (routines[task]) {
        const splitTask = splitCommands(routines[task], routines);
        if (typeof splitTask === 'string') {
          return splitTask;
        } else {
          return splitTask;
        }
      } else {
        return task;
      }
    });
  }

  function generateObjectTree(tasks, routines, initialMode = 'parallel') {
    const taskTree = buildTaskTree(tasks, routines);
    return {
      tasks: taskTree,
      mode: initialMode,
    };
  }

  return generateObjectTree(routines, routineMap);
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
    .action(async (scripts: string | string[], options: any) => {
      $.verbose = false;

      const routines = metaConfig?.routines as RoutineMap;

      if (!routines) {
        console.log('No routines found');
        Deno.exit(0);
      }

      const result = await generateTreeCommands(scripts, routines);

      /**
       * Execute a single command using google/zx.
       * @param {string} command - The command to execute.
       */
      async function executeCommand(command) {
        $.verbose = true;
        const isCustomCommand = cmd`${command}`;
        await $`${isCustomCommand}`;
      }

      /**
       * Recursively execute tasks based on their mode.
       * @param {object} taskObject - The task object containing tasks and mode.
       */
      async function executeTasks(taskObject) {
        const { tasks, mode } = taskObject;

        if (mode === 'parallel') {
          await Promise.all(
            tasks.map((task) => {
              if (typeof task === 'string') {
                return executeCommand(task);
              } else {
                return executeTasks(task);
              }
            })
          );
        } else if (mode === 'sequence') {
          for (const task of tasks) {
            if (typeof task === 'string') {
              await executeCommand(task);
            } else {
              await executeTasks(task);
            }
          }
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
