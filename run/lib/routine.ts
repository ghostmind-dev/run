import { $, cd, within } from 'npm:zx@8.1.0';
import {
  verifyIfMetaJsonExists,
  recursiveDirectoriesDiscovery,
} from '../utils/divers.ts';
import { cmd } from './custom.ts';

////////////////////////////////////////////////////////////////////////////////
// MUTE BY DEFAULT
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

////////////////////////////////////////////////////////////////////////////////
// RUNNING COMMAND LOCATION
////////////////////////////////////////////////////////////////////////////////

let currentPath = Deno.cwd();

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
  async function resolveRoutine(task: string, routines: any): Promise<any> {
    const command = routines[task];

    if (!command) {
      return task;
    }

    if (command.startsWith('parallel ')) {
      const parallelTasks = command
        .slice(9)
        .split(' ')
        .map((task: string) => task.trim());
      return {
        tasks: await Promise.all(
          parallelTasks.map((task: string) => {
            return resolveRoutine(task, routines);
          })
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
        tasks: await Promise.all(
          sequenceTasks.map((task: string) => resolveRoutine(task, routines))
        ),
        mode: 'sequence',
      };
    }

    if (command.startsWith('every ')) {
      const parallelTasks = command
        .slice(6)
        .split(' ')
        .map((task: string) => task.trim());
      let routinesTorun = [];
      let appToExclude = [];

      for (const task of parallelTasks) {
        if (task.startsWith('!')) {
          appToExclude.push(task.slice(1));
        } else {
          routinesTorun.push(task);
        }
      }

      let directories = await recursiveDirectoriesDiscovery(Deno.cwd());

      directories.push(Deno.cwd());

      // // from command, extract 2 types of string. One starting with ! and one not.

      let routinesToRun = [];
      for (const directory of directories) {
        const metaConfig = await verifyIfMetaJsonExists(directory);
        if (!metaConfig) {
          continue;
        }

        if (appToExclude.includes(metaConfig.name)) {
          continue;
        }

        // verify if routine exists in metaConfig.routines
        for (const routine of routinesTorun) {
          if (metaConfig.routines[routine]) {
            routinesToRun.push({
              task: 'default',
              routines: {
                default: `cd ${directory} && ${metaConfig.routines[routine]}`,
              },
            });
          }
        }
      }

      return {
        tasks: await Promise.all(
          routinesToRun.map(async (defaultTask) => {
            const routineResolved = await resolveRoutine(
              defaultTask.task,
              defaultTask.routines
            );
            console.log(routineResolved);
            return routineResolved;
          })
        ),
        mode: 'parallel',
      };
    }

    const sequenceParts = command
      .split('&&')
      .map((part: string) => part.trim());
    if (sequenceParts.length > 1) {
      return {
        tasks: await Promise.all(
          sequenceParts.map((part: string) => resolveRoutine(part, routines))
        ),
        mode: 'sequence',
      };
    }

    const parallelParts = command.split('&').map((part: string) => part.trim());
    if (parallelParts.length > 1) {
      return {
        tasks: await Promise.all(
          parallelParts.map((part: any) => resolveRoutine(part, routines))
        ),
        mode: 'parallel',
      };
    }

    return command;
  }

  async function buildTaskTree(tasks: string[], routines: any) {
    return await Promise.all(
      tasks.map(async (task: string) => {
        if (routines[task]) {
          return await resolveRoutine(task, routines);
        } else {
          return task;
        }
      })
    );
  }

  async function generateObjectTree(
    tasks: string[],
    routines: any,
    initialMode = 'parallel'
  ) {
    const taskTree = await buildTaskTree(tasks, routines);
    return {
      tasks: taskTree,
      mode: initialMode,
    };
  }

  return await generateObjectTree(scripts, routineMap);
}

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function routine(program: any) {
  $.verbose = false;
  const routine = program.command('routine');
  routine
    .description('run npm scripts')
    .argument('<script...>', 'script to run')
    .action(async (scripts: string[], _options: any) => {
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
          cd(directory);
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
