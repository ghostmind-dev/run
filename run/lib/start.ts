/**
 * @fileoverview Start and status for the project of the current folder
 *
 * `run project start [profile]` brings the project's workspace up to what its
 * meta.json files describe and starts the routines of one profile (all of
 * them without one). It never restarts anything: a pane already running
 * something is left as it is, so starting a second profile that shares a pane
 * with the first (the database, say) only starts what is missing. A workspace
 * opened earlier without starting anything can be started later the same way.
 *
 * `run project status` shows each pane that names a routine and what it runs now.
 *
 * @module
 */

import chalk from 'npm:chalk@5.3.0';
import { getSrc } from '../utils/divers.ts';
import {
  capture,
  discoverProjects,
  readHerdrState,
  readPanes,
  runSelf,
  type PaneRoutine,
  type PaneState,
  type Project,
} from './projects.tsx';

////////////////////////////////////////////////////////////////////////////////
// PLAN
////////////////////////////////////////////////////////////////////////////////

/**
 * What `run project start` does with each routine it was asked for
 */
export interface StartPlan {
  /** Idle panes: the routine is typed into them */
  start: { routine: PaneRoutine; pane: PaneState }[];
  /** Panes already running something: left as they are */
  busy: { routine: PaneRoutine; pane: PaneState }[];
  /** Routines whose pane is not open in the workspace */
  missing: PaneRoutine[];
}

/**
 * The profiles a project's panes name, in the order they first appear
 */
export function profilesOf(routines: PaneRoutine[]): string[] {
  return [...new Set(routines.flatMap(({ profiles }) => profiles))];
}

/**
 * Decide which panes to start for a profile, or for all routines when profile
 * is null
 *
 * @param routines - The routines the project's panes name
 * @param panes - The panes of its open workspace, as they are now
 * @param profile - The profile to start; null starts every routine
 */
export function planStart(
  routines: PaneRoutine[],
  panes: PaneState[],
  profile: string | null
): StartPlan {
  const plan: StartPlan = { start: [], busy: [], missing: [] };

  for (const routine of routines) {
    if (profile && !routine.profiles.includes(profile)) continue;
    const pane = panes.find(
      (entry) => entry.tab === routine.tab && entry.name === routine.pane
    );
    if (!pane) {
      plan.missing.push(routine);
    } else if (pane.isIdle) {
      plan.start.push({ routine, pane });
    } else {
      plan.busy.push({ routine, pane });
    }
  }

  return plan;
}

////////////////////////////////////////////////////////////////////////////////
// HELPERS
////////////////////////////////////////////////////////////////////////////////

/**
 * The project the current folder belongs to, with its routines
 */
async function currentProject(): Promise<Project> {
  const root = await getSrc();
  const project = (await discoverProjects(root)).find(
    (entry) => entry.path === root
  );
  if (!project) {
    throw new Error(`no project here: no meta.json with "type": "project" above ${Deno.cwd()}`);
  }
  if (!project.label) {
    throw new Error(`${project.name} defines no herdr workspace`);
  }
  return project;
}

/**
 * The panes of the project's open workspace; null when it is not open
 */
async function openPanes(project: Project): Promise<PaneState[] | null> {
  const herdr = await readHerdrState();
  const workspace = herdr.workspaces.find(
    (entry) => entry.label === project.label
  );
  if (!workspace) return null;
  return await readPanes(workspace.workspace_id, project.routines, project.tabs);
}

const where = (routine: PaneRoutine) => `${routine.tab}/${routine.pane}`;

/**
 * What a pane runs, as it was typed: the installed `run` is a Deno shim, so
 * `deno run … /bin/cmd.ts routine dev` reads back as `run routine dev`
 */
const shown = (running: string) =>
  running.replace(/^deno run .*?\/bin\/cmd\.ts(?=\s|$)/, 'run');

////////////////////////////////////////////////////////////////////////////////
// START
////////////////////////////////////////////////////////////////////////////////

async function start(profile: string | null, isDryRun: boolean): Promise<void> {
  const project = await currentProject();

  if (project.routines.length === 0) {
    console.log(chalk.yellow(`${project.name}: no pane names a routine`));
    return;
  }

  const profiles = profilesOf(project.routines);
  if (profile && !profiles.includes(profile)) {
    throw new Error(
      `${project.name} has no profile '${profile}'` +
        (profiles.length > 0 ? ` (profiles: ${profiles.join(', ')})` : ' (no profiles)')
    );
  }

  // Open the workspace, or add the tabs it lacks; existing tabs are untouched
  if (!isDryRun) {
    const init = await runSelf(
      ['herdr', 'init', project.label!, '--all', '--no-focus'],
      project.path
    );
    if (!init.isOk) {
      throw new Error(`could not open ${project.label}:\n${init.output}`);
    }
  }

  const panes = (await openPanes(project)) ?? [];
  const plan = planStart(project.routines, panes, profile);

  console.log(
    chalk.green(
      `${isDryRun ? 'dry run: ' : ''}${project.name}, ${profile ? `profile ${profile}` : 'all routines'}`
    )
  );

  for (const { routine, pane } of plan.start) {
    // A pane that has wandered to another folder still runs its own routine
    const command =
      pane.cwd === routine.path
        ? `run routine ${routine.routine}`
        : `run -p ${routine.path} routine ${routine.routine}`;
    if (!isDryRun) {
      const typed = await capture('herdr', ['pane', 'run', pane.paneId, command]);
      if (!typed.isOk) {
        console.log(chalk.red(`  ✗ ${where(routine)}: ${typed.output}`));
        continue;
      }
    }
    console.log(`  ${chalk.green('▶')} ${where(routine)}: ${routine.routine}`);
  }
  for (const { routine, pane } of plan.busy) {
    console.log(
      chalk.gray(`  = ${where(routine)}: already running ${shown(pane.running)}`)
    );
  }
  for (const routine of plan.missing) {
    console.log(
      chalk.yellow(
        `  ? ${where(routine)}: no pane '${routine.pane}' in tab ${routine.tab} (renamed or closed)`
      )
    );
  }

  if (plan.start.length === 0 && plan.missing.length === 0) {
    console.log(chalk.gray('  nothing to start'));
  }
}

////////////////////////////////////////////////////////////////////////////////
// STATUS
////////////////////////////////////////////////////////////////////////////////

async function status(): Promise<void> {
  const project = await currentProject();
  const panes = await openPanes(project);
  const profiles = profilesOf(project.routines);

  console.log(
    chalk.green(`${project.name}`) +
      chalk.gray(` · workspace ${project.label} ${panes ? 'open' : 'not open'}`)
  );
  if (profiles.length > 0) {
    console.log(chalk.gray(`profiles: ${profiles.join(', ')}`));
  }
  if (project.routines.length === 0) {
    console.log(chalk.yellow('no pane names a routine'));
    return;
  }

  const width = Math.max(...project.routines.map((routine) => where(routine).length));
  const routineWidth = Math.max(
    ...project.routines.map((routine) => routine.routine.length)
  );

  for (const routine of project.routines) {
    const pane = panes?.find(
      (entry) => entry.tab === routine.tab && entry.name === routine.pane
    );
    const state = !pane
      ? chalk.gray('– not open')
      : pane.isIdle
        ? chalk.yellow('○ idle    ')
        : chalk.green('● running ');
    console.log(
      `  ${state}  ${where(routine).padEnd(width)}  ${routine.routine.padEnd(routineWidth)}  ` +
        chalk.cyan((routine.profiles.join(',') || '-').padEnd(12)) +
        (pane && !pane.isIdle ? chalk.gray(`  ${shown(pane.running)}`) : '')
    );
  }
}

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function commandStart(program: any) {
  // `run project …` acts on the project of the current folder;
  // `run projects` is every project at once
  const project = program
    .command('project')
    .description("the project of the current folder: start its routines, see what runs");

  project
    .command('start')
    .description(
      "start the routines of this folder's project: one profile, or all; what already runs is left as it is"
    )
    .argument('[profile]', 'the profile to start (default: every routine)')
    .option('--dry-run', 'show what would start without typing anything')
    .action(async (profile: string | undefined, options: { dryRun?: boolean }) => {
      try {
        await start(profile ?? null, options.dryRun ?? false);
      } catch (error: any) {
        console.error(chalk.red(`❌ ${error?.message ?? error}`));
        Deno.exit(1);
      }
    });

  project
    .command('status')
    .description("show what each routine pane of this folder's project is running")
    .action(async () => {
      try {
        await status();
      } catch (error: any) {
        console.error(chalk.red(`❌ ${error?.message ?? error}`));
        Deno.exit(1);
      }
    });
}
