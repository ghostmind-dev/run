import { $, cd, within } from 'npm:zx@8.1.0';
import inquirer from 'npm:inquirer@9.2.22';
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
//
////////////////////////////////////////////////////////////////////////////////

/**
 * Represents a node in the command execution tree.
 * It can be a single command (string) or a structured node with tasks and execution mode.
 */
export interface CommandNode {
  tasks: (string | CommandNode)[];
  mode: 'parallel' | 'sequence';
}

export async function generateTreeCommands(
  scripts: string[],
  routineMap: Record<string, string>
): Promise<CommandNode> {
  async function resolveRoutine(
    task: string,
    routines: Record<string, string>
  ): Promise<string | CommandNode> {
    ////////////////////////////////////////////////////////////////////////////////
    // CURRENT METADATA
    ////////////////////////////////////////////////////////////////////////////////

    let metaConfig = await verifyIfMetaJsonExists(currentPath);

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

/**
 * Sets up the 'routine' command for running npm-style scripts defined in meta.json.
 * @param {object} program - The program instance, expected to have a `command` method.
 */
export default async function routine(program: {
  command: (name: string) => any;
}) {
  $.verbose = false;
  const routine = program.command('routine');
  routine
    .description('run npm style scripts')
    .argument('[script...]', 'script to run')
    .action(async (scripts: string[]) => {
      $.verbose = false;
      Deno.env.set('FORCE_COLOR', '1');

      let metaConfig = await verifyIfMetaJsonExists(currentPath);

      const routines = metaConfig?.routines;

      if (!routines) {
        console.log('No routines found');
        Deno.exit(0);
      }

      // Add interactive script selection when no scripts are provided
      if (scripts.length === 0) {
        const availableScripts = Object.keys(routines);

        if (availableScripts.length === 0) {
          console.log('No scripts available to run');
          Deno.exit(0);
        }

        const { selectedScript } = await inquirer.prompt([
          {
            type: 'list',
            name: 'selectedScript',
            message: 'Select a script to run:',
            choices: availableScripts,
          },
        ]);

        scripts = [selectedScript];
      }

      const result = await generateTreeCommands(scripts, routines);

      /**
       * Executes a single command string.
       * If the command starts with 'cd ', it changes the directory.
       * Otherwise, it executes the command using zx.
       * @param {string} command - The command string to execute.
       */
      async function executeCommand(command: string): Promise<void> {
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
       * @param {CommandNode} taskObject - The task object containing tasks and mode.
       */
      async function executeTasks(taskObject: CommandNode): Promise<void> {
        const { tasks, mode } = taskObject;

        if (mode === 'parallel') {
          await Promise.all(
            tasks.map((task: string | CommandNode) => {
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
          Deno.exit(0);
        })
        .catch((error) => {
          console.error('Error executing tasks:', error);
          Deno.exit(1);
        });
    });
}
