import { $, cd } from 'npm:zx@8.1.0';
import {
  detectScriptsDirectory,
  verifyIfMetaJsonExists,
} from '../utils/divers.ts';
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
// TYPE DEFINITIONS
////////////////////////////////////////////////////////////////////////////////

type RoutineMap = {
  [key: string]: string;
};

type ExecutionStep = {
  task?: string[];
  mode?: 'parallel' | 'sequence';
  tasks?: ExecutionStep[];
};

////////////////////////////////////////////////////////////////////////////////
// PARSING AND FLATTENING FUNCTIONS
////////////////////////////////////////////////////////////////////////////////

function deconstructCommand(command: string): ExecutionStep {
  const isParallel = command.includes('&');
  const isSequence = command.includes('&&');
  let tasks: ExecutionStep[] = [];

  if (isParallel) {
    tasks = command.split('&').map((cmd) => ({ task: [cmd.trim()] }));
    return { mode: 'parallel', tasks };
  } else if (isSequence) {
    tasks = command.split('&&').map((cmd) => ({ task: [cmd.trim()] }));
    return { mode: 'sequence', tasks };
  } else {
    return { task: [command] };
  }
}

function parseRoutine(
  routineName: string,
  routines: RoutineMap
): ExecutionStep {
  const routine = routines[routineName];
  if (!routine) {
    return { task: [routineName] }; // If it's a direct command
  }

  const parts = routine.split(' ');
  const mode = parts[0] as 'parallel' | 'sequence';
  const commands = parts.slice(1).map((part) => parseRoutine(part, routines));

  return {
    mode,
    tasks: commands,
  };
}

function flattenSteps(step: ExecutionStep): ExecutionStep[] {
  if (step.task) {
    return [step];
  }

  if (step.tasks) {
    const flattenedTasks = step.tasks.flatMap(flattenSteps);
    return flattenedTasks;
  }

  return [];
}

function generateExecutionConfig(
  routines: string[],
  mode: 'parallel' | 'sequence',
  routineMap: RoutineMap
): ExecutionStep {
  const steps = routines.map((routine) => parseRoutine(routine, routineMap));
  return {
    mode,
    tasks: steps,
  };
}

function parseUserInput(input: string): {
  routines: string[];
  mode: 'parallel' | 'sequence';
} {
  const parts = input.split(' ');
  const modeIndex = parts.findIndex(
    (part) => part === '--parallel' || part === '--sequence'
  );
  const mode =
    modeIndex !== -1
      ? (parts[modeIndex].replace('--', '') as 'parallel' | 'sequence')
      : 'parallel';
  const routines = parts.slice(2, modeIndex === -1 ? undefined : modeIndex);
  return { routines, mode };
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

      // Parse user input
      const userInput = `run routine ${scripts.join(' ')} ${
        options.parallel ? '--parallel' : '--sequence'
      }`;
      const { routines: userRoutines, mode } = parseUserInput(userInput);

      // Generate execution configuration
      const executionConfig = generateExecutionConfig(
        userRoutines,
        mode,
        routines
      );
      const flattenedExecutionConfig = flattenSteps(executionConfig);

      if (!flattenedExecutionConfig.length) {
        console.log('No valid tasks found');
        Deno.exit(0);
      }

      console.log(JSON.stringify(flattenedExecutionConfig, null, 2));

      // Execute the tasks based on the flattenedExecutionConfig
      for (const task of flattenedExecutionConfig) {
        if (task.task) {
          for (const cmd of task.task) {
            await $`${cmd}`;
          }
        } else if (task.mode === 'parallel') {
          await Promise.all(
            task.tasks!.map(async (t) => {
              if (t.task) {
                for (const cmd of t.task) {
                  await $`${cmd}`;
                }
              }
            })
          );
        } else if (task.mode === 'sequence') {
          for (const t of task.tasks!) {
            if (t.task) {
              for (const cmd of t.task) {
                await $`${cmd}`;
              }
            }
          }
        }
      }
    });
}
