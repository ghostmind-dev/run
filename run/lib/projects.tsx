/** @jsxImportSource npm:react@18.3.1 */
/**
 * @fileoverview Projects dashboard module for @ghostmind/run
 *
 * `run projects` is a full-screen terminal dashboard over every project under
 * a root folder. It lists the projects, shows which ones are live in herdr,
 * and opens or stops their herdr workspaces.
 *
 * A project is a folder whose meta.json has `type: "project"`. Folders with
 * `type: "app"` below it are its apps and never get a row of their own.
 *
 * The dashboard owns no herdr logic: opening a project runs `run herdr init`
 * in its folder, and everything else is a `herdr workspace` call.
 *
 * @module
 */

// @ts-types="npm:@types/react@18.3.12"
import React, { useEffect, useMemo, useRef, useState } from 'npm:react@18.3.1';
import { Box, render, Text, useApp, useInput, useStdout } from 'npm:ink@5.2.1';
import { dirname, join, relative } from 'node:path';
import process from 'node:process';

////////////////////////////////////////////////////////////////////////////////
// TYPE DEFINITIONS
////////////////////////////////////////////////////////////////////////////////

/**
 * A project found on disk
 */
export interface Project {
  /** The `name` of its meta.json */
  name: string;
  /** Absolute path of the folder holding its meta.json */
  path: string;
  /** Top-level folder under the root (ghostmind, labo, studio...) */
  folder: string;
  /** Herdr workspace label; null when the project defines no herdr workspace */
  label: string | null;
  /** The `color` of its herdr workspace: its mark in herdr's sidebar */
  color?: string;
  /** Names of the `type: "app"` folders below it */
  apps: string[];
  /** The routine each of its panes names, when it names one */
  routines: PaneRoutine[];
  /** Where each tab of its workspace is defined, and that folder's routines */
  tabs: TabSource[];
  /** The `tags` of its meta.json */
  tags: string[];
  /** The `groups` of its meta.json: sets of projects worked on together */
  groups: string[];
  /** Checked-out git branch; see readBranch for the other values */
  branch: string;
  /** The organization or user its repository is pushed to; empty when none */
  org: string;
  /** The name of that repository; empty when none */
  repo: string;
  /** Uncommitted files and unpushed commits; see readChanges */
  changes: string;
}

/**
 * A pane of a project's workspace that names the routine it usually runs
 */
export interface PaneRoutine {
  /** The tab's label as herdr shows it */
  tab: string;
  /** The pane's name, which is its label in herdr */
  pane: string;
  routine: string;
  /** The profiles the pane is part of: sets of routines started together */
  profiles: string[];
  /** Folder of the meta.json that defines the routine */
  path: string;
}

/**
 * The meta.json a tab of a project's workspace is defined in
 */
export interface TabSource {
  /** The tab's label as herdr shows it */
  tab: string;
  /** Folder of that meta.json */
  path: string;
  /** Names of its routines, less the ones that only manage herdr itself */
  routines: string[];
}

/**
 * A pane of an open workspace, as herdr reports it right now
 */
export interface PaneState {
  paneId: string;
  tab: string;
  name: string;
  cwd: string;
  /** The routine this pane names, when its project defines one for it */
  routine: PaneRoutine | null;
  /** The meta.json its tab comes from: the routines it could run */
  source: TabSource | null;
  /** True when nothing but the shell is in the foreground */
  isIdle: boolean;
  /** True when a coding agent occupies the pane */
  isAgent: boolean;
  /** The command in the foreground, or the agent and its state */
  running: string;
}

/**
 * A workspace as `herdr workspace list` reports it
 */
export interface HerdrWorkspaceState {
  workspace_id: string;
  label: string;
  number: number;
  tab_count: number;
  pane_count: number;
  agent_status: string;
  focused: boolean;
  /** The coding agents in its panes, each with its own state */
  agents: { kind: string; status: string }[];
}

/**
 * The state of the herdr server
 */
export interface HerdrState {
  isRunning: boolean;
  workspaces: HerdrWorkspaceState[];
}

/**
 * One line of the dashboard's table: a project, or a herdr workspace that
 * matches no project (a stray)
 */
interface Row {
  key: string;
  name: string;
  /** `local`, or the label of the saved herdr machine the project is on */
  machine: string;
  /** For a project on another machine: how to reach it, and whether it answers */
  remote?: { target: string; isReachable: boolean };
  folder: string;
  label: string | null;
  path: string;
  apps: number;
  tags: string[];
  groups: string[];
  branch: string;
  /** `none` for a project with no remote, empty for a stray */
  org: string;
  changes: string;
  project: Project | null;
  workspace: HerdrWorkspaceState | null;
}

////////////////////////////////////////////////////////////////////////////////
// DISCOVERY
////////////////////////////////////////////////////////////////////////////////

const SKIPPED_FOLDERS = ['node_modules', 'dist', 'build', 'target', 'vendor'];

const MAX_DEPTH = 4;

/**
 * The routines the panes of one herdr tab name
 */
function paneRoutines(tab: any, tabLabel: string, path: string): PaneRoutine[] {
  const found: PaneRoutine[] = [];

  const visit = (item: any) => {
    if (!item || typeof item !== 'object') return;
    if (item.name && item.routine) {
      found.push({
        tab: tabLabel,
        pane: item.name,
        routine: item.routine,
        profiles: Array.isArray(item.profiles) ? item.profiles : [],
        path,
      });
    }
    for (const child of item.items ?? []) visit(child);
  };

  for (const pane of tab.compact?.panes ?? []) visit(pane);
  for (const pane of tab.grid?.panes ?? []) visit(pane);
  visit(tab.section);

  return found;
}

/**
 * Find every project under a root folder
 *
 * @param root - Folder to scan, four levels deep
 * @returns The projects, sorted by top-level folder then name
 *
 * @example
 * ```typescript
 * const projects = await discoverProjects('/Volumes/Projects');
 * console.log(projects.map((project) => project.name));
 * ```
 */
export async function discoverProjects(root: string): Promise<Project[]> {
  const metas: { path: string; meta: any }[] = [];

  async function walk(directory: string, depth: number): Promise<void> {
    try {
      const meta = JSON.parse(
        await Deno.readTextFile(join(directory, 'meta.json'))
      );
      metas.push({ path: directory, meta });
    } catch {
      // No meta.json here, or one that does not parse
    }

    if (depth >= MAX_DEPTH) {
      return;
    }

    const children: string[] = [];

    try {
      for await (const entry of Deno.readDir(directory)) {
        const isHidden = entry.name.startsWith('.');
        if (
          entry.isDirectory &&
          !isHidden &&
          !SKIPPED_FOLDERS.includes(entry.name)
        ) {
          children.push(join(directory, entry.name));
        }
      }
    } catch {
      // Unreadable folder
    }

    await Promise.all(children.map((child) => walk(child, depth + 1)));
  }

  await walk(root, 0);

  const projects: Project[] = metas
    .filter(({ meta }) => meta.type === 'project')
    .map(({ path, meta }) => ({
      name: meta.name ?? path.split('/').pop(),
      path,
      folder: relative(root, path).split('/')[0],
      label: meta.herdr?.workspaces?.[0]?.label ?? null,
      color: meta.herdr?.workspaces?.[0]?.color,
      apps: [],
      routines: [],
      tabs: [],
      tags: Array.isArray(meta.tags) ? meta.tags : [],
      groups: Array.isArray(meta.groups) ? meta.groups : [],
      branch: '',
      org: '',
      repo: '',
      changes: '',
    }));

  await Promise.all(
    projects.map(async (project) => {
      project.branch = await readBranch(project.path);
      const remote = await readRemote(project.path);
      project.org = remote?.owner ?? '';
      project.repo = remote?.repo ?? '';
      project.changes = await readChanges(project.path);
    })
  );

  for (const { path, meta } of metas) {
    if (meta.type !== 'app') {
      continue;
    }
    const owner = projects.find((project) =>
      path.startsWith(project.path + '/')
    );
    owner?.apps.push(meta.name ?? path.split('/').pop());
  }

  // A project's workspace is assembled from its own meta.json and its apps'
  for (const { path, meta } of metas) {
    const owner = projects.find(
      (project) =>
        path === project.path || path.startsWith(project.path + '/')
    );
    if (!owner) continue;

    for (const workspace of meta.herdr?.workspaces ?? []) {
      if (workspace.label !== owner.label) continue;
      for (const tab of workspace.tabs ?? []) {
        // `run herdr init` prefixes a tab's label with its app's name
        const tabLabel =
          tab.prefix === false ? tab.label : `${meta.name}-${tab.label}`;
        owner.routines.push(...paneRoutines(tab, tabLabel, path));
        owner.tabs.push({
          tab: tabLabel,
          path,
          routines: Object.keys(meta.routines ?? {}).filter(
            (name) => !/herdr/.test(name)
          ),
        });
      }
    }
  }

  return projects.sort(
    (a, b) => a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name)
  );
}

////////////////////////////////////////////////////////////////////////////////
// GIT
////////////////////////////////////////////////////////////////////////////////

/**
 * Find the .git folder a path belongs to, looking upwards: the repository may
 * start above the project's folder
 */
async function findGitDir(path: string): Promise<string | null> {
  let folder = path;
  while (true) {
    try {
      const dotGit = join(folder, '.git');
      const info = await Deno.stat(dotGit);
      // A worktree or submodule has a .git file pointing at the real folder
      return info.isDirectory
        ? dotGit
        : join(
            folder,
            (await Deno.readTextFile(dotGit)).replace('gitdir:', '').trim()
          );
    } catch {
      const parent = dirname(folder);
      if (parent === folder) return null;
      folder = parent;
    }
  }
}

/**
 * Read who a folder's repository is pushed to: the organization or user, and
 * the repository's name, from its `origin` remote
 *
 * @param path - A project's folder
 * @returns The owner and the repository, or null when the folder is not in a
 *          repository or the repository has no `origin`
 *
 * @example
 * ```typescript
 * const remote = await readRemote('/Volumes/Projects/system/run');
 * console.log(remote); // { owner: "ghostmind-dev", repo: "run" }
 * ```
 */
export async function readRemote(
  path: string
): Promise<{ owner: string; repo: string } | null> {
  const gitDir = await findGitDir(path);
  if (!gitDir) return null;

  const config = await Deno.readTextFile(join(gitDir, 'config')).catch(() => '');
  const origin = config.split(/^\[/m).find((section) =>
    section.startsWith('remote "origin"]')
  );
  // https://host/owner/repo(.git), git@host:owner/repo.git, ssh://git@host/owner/repo
  const found = origin?.match(
    /^\s*url\s*=\s*\S*?[:/]([^/:\s]+)\/([^/\s]+?)(?:\.git)?\s*$/m
  );
  return found ? { owner: found[1], repo: found[2] } : null;
}

/**
 * Read which git branch a folder is on, straight from its .git folder (no
 * git process, so it is cheap enough to repeat on every refresh)
 *
 * @param path - A project's folder
 * @returns The branch name; `<sha> detached` off a branch; the name followed
 *          by ` (local)` when the repository has no remote; `no git` when the
 *          folder is not in a repository
 *
 * @example
 * ```typescript
 * const branch = await readBranch('/Volumes/Projects/system/run');
 * console.log(branch); // e.g. "dev"
 * ```
 */
export async function readBranch(path: string): Promise<string> {
  const gitDir = await findGitDir(path);
  if (!gitDir) return 'no git';

  try {
    const head = (await Deno.readTextFile(join(gitDir, 'HEAD'))).trim();
    const branch = head.startsWith('ref: ')
      ? head.replace('ref: refs/heads/', '')
      : `${head.slice(0, 7)} detached`;

    const config = await Deno.readTextFile(join(gitDir, 'config')).catch(
      () => ''
    );
    return config.includes('[remote ') ? branch : `${branch} (local)`;
  } catch {
    return 'no git';
  }
}

/**
 * Summarize what a folder's repository has not committed or pushed
 *
 * @param path - A project's folder
 * @returns `clean`; or the number of uncommitted files, then `↑n` for commits
 *          not pushed and `↓n` for commits not pulled (as of the last fetch);
 *          `-` when the folder is not in a repository
 *
 * @example
 * ```typescript
 * const changes = await readChanges('/Volumes/Projects/system/run');
 * console.log(changes); // e.g. "12 ↑1"
 * ```
 */
export async function readChanges(path: string): Promise<string> {
  const { isOk, output } = await capture('git', [
    '-C',
    path,
    'status',
    '--porcelain=v2',
    '--branch',
  ]);

  if (!isOk) return '-';

  const lines = output.split('\n').filter(Boolean);
  const files = lines.filter((line) => !line.startsWith('#')).length;
  const [, ahead, behind] =
    lines.join('\n').match(/^# branch\.ab \+(\d+) -(\d+)$/m) ?? [];

  const parts = [
    files > 0 ? String(files) : '',
    Number(ahead) > 0 ? `↑${ahead}` : '',
    Number(behind) > 0 ? `↓${behind}` : '',
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' ') : 'clean';
}

////////////////////////////////////////////////////////////////////////////////
// HERDR
////////////////////////////////////////////////////////////////////////////////

/**
 * Run a command without letting it draw over the dashboard
 */
async function capture(
  command: string,
  args: string[],
  cwd?: string
): Promise<{ isOk: boolean; output: string; stdout: string }> {
  try {
    const { success, stdout, stderr } = await new Deno.Command(command, {
      args,
      cwd,
      stdin: 'null',
      stdout: 'piped',
      stderr: 'piped',
      env: { RUN_NO_DEPRECATION: '1', NO_COLOR: '1' },
    }).output();
    const decoder = new TextDecoder();
    const out = decoder.decode(stdout);
    const output = (out + decoder.decode(stderr)).trim();
    return { isOk: success, output, stdout: out };
  } catch (error) {
    return { isOk: false, output: String(error), stdout: '' };
  }
}

/**
 * Read the state of the herdr server
 *
 * @returns Whether the server answers, and its open workspaces
 */
export async function readHerdrState(): Promise<HerdrState> {
  const [list, agentList] = await Promise.all([
    capture('herdr', ['workspace', 'list']),
    capture('herdr', ['agent', 'list']),
  ]);

  if (!list.isOk) {
    return { isRunning: false, workspaces: [] };
  }

  try {
    // A workspace's own agent_status reads "unknown" when it holds no agent
    // at all, so which workspaces have one comes from the agents themselves
    let agents: any[] = [];
    try {
      agents = JSON.parse(agentList.output).result?.agents ?? [];
    } catch {
      // No agent list: every workspace shows as having none
    }

    const workspaces: any[] = JSON.parse(list.output).result?.workspaces ?? [];
    return {
      isRunning: true,
      workspaces: workspaces.map((workspace) => ({
        ...workspace,
        agents: agents
          .filter((agent) => agent.workspace_id === workspace.workspace_id)
          .map((agent) => ({
            kind: agent.agent ?? 'agent',
            status: agent.agent_status ?? 'unknown',
          })),
      })),
    };
  } catch {
    return { isRunning: false, workspaces: [] };
  }
}

/**
 * Read what every pane of an open workspace is doing
 *
 * @param workspaceId - The herdr workspace
 * @param routines - The routines the project's panes name
 * @param sources - Where each tab of the project's workspace is defined
 * @returns One entry per pane, in herdr's order
 */
export async function readPanes(
  workspaceId: string,
  routines: PaneRoutine[],
  sources: TabSource[] = []
): Promise<PaneState[]> {
  const parse = (output: string) => {
    try {
      return JSON.parse(output).result ?? {};
    } catch {
      return {};
    }
  };

  const [tabList, paneList] = await Promise.all([
    capture('herdr', ['tab', 'list', '--workspace', workspaceId]),
    capture('herdr', ['pane', 'list', '--workspace', workspaceId]),
  ]);
  const tabs: any[] = parse(tabList.output).tabs ?? [];
  const panes: any[] = parse(paneList.output).panes ?? [];

  return await Promise.all(
    panes.map(async (pane) => {
      const tab = tabs.find((entry) => entry.tab_id === pane.tab_id);
      const tabLabel: string = tab?.label ?? pane.tab_id;
      const name: string = pane.label ?? '-';

      const info =
        parse(
          (
            await capture('herdr', [
              'pane',
              'process-info',
              '--pane',
              pane.pane_id,
            ])
          ).output
        ).process_info ?? {};
      const isIdle =
        info.foreground_process_group_id === undefined ||
        info.foreground_process_group_id === info.shell_pid;
      const leader = (info.foreground_processes ?? []).find(
        (process: any) => process.pid === info.foreground_process_group_id
      );

      return {
        paneId: pane.pane_id,
        tab: tabLabel,
        name,
        cwd: pane.cwd ?? '',
        routine:
          routines.find(
            (routine) => routine.tab === tabLabel && routine.pane === name
          ) ?? null,
        source: sources.find((source) => source.tab === tabLabel) ?? null,
        isIdle,
        isAgent: !!pane.agent,
        running: pane.agent
          ? `${pane.agent} (${pane.agent_status})`
          : isIdle
            ? ''
            : (leader?.cmdline ?? 'running'),
      };
    })
  );
}

/**
 * Run a `run` subcommand with this same CLI, from a project's folder
 */
function runSelf(args: string[], cwd: string) {
  const entry = new URL('../bin/cmd.ts', import.meta.url).href;
  return capture(Deno.execPath(), ['run', '-A', entry, ...args], cwd);
}

function lastLine(output: string): string {
  return output.split('\n').filter(Boolean).pop() ?? '';
}

////////////////////////////////////////////////////////////////////////////////
// OTHER MACHINES
////////////////////////////////////////////////////////////////////////////////

/**
 * A machine saved in herdr (`herdr machine add`): its label and SSH target
 */
export interface Machine {
  label: string;
  target: string;
}

/**
 * The saved herdr machines the dashboard also lists. None when herdr has
 * none, or when RUN_NO_MACHINES is set (which is how a machine is asked for
 * its own projects without asking further).
 */
export async function readMachines(): Promise<Machine[]> {
  if (Deno.env.get('RUN_NO_MACHINES')) return [];
  const { isOk, output } = await capture('herdr', ['machine', 'list', '--json']);
  if (!isOk) return [];
  try {
    return (JSON.parse(output) as any[])
      .filter((machine) => machine.enabled !== false && machine.target)
      .map((machine) => ({ label: machine.label, target: machine.target }));
  } catch {
    return [];
  }
}

// A command sent over SSH has a bare PATH: name where run, herdr and deno live
const REMOTE_PATH =
  'PATH="$HOME/.deno/bin:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"';

/**
 * Run a command on a saved machine, without ever asking for a password
 */
function onMachine(target: string, command: string) {
  return capture('ssh', [
    '-o',
    'BatchMode=yes',
    '-o',
    'ConnectTimeout=6',
    target,
    `${REMOTE_PATH} RUN_NO_MACHINES=1 ${command}`,
  ]);
}

/** A path or a name, quoted for the remote shell */
function quoted(text: string): string {
  return "'" + text.split("'").join("'\\''") + "'";
}

/**
 * The projects of another machine, as rows: that machine runs
 * `run projects --json` and this one reads the answer
 *
 * @returns The rows, or null when the machine does not answer
 */
async function readMachineRows(machine: Machine): Promise<Row[] | null> {
  const { isOk, stdout } = await onMachine(machine.target, 'run projects --json');
  if (!isOk) return null;

  let listed: any[];
  try {
    // Only what the command printed as its answer: warnings go to stderr
    listed = JSON.parse(stdout.slice(stdout.indexOf('{'))).projects ?? [];
  } catch {
    return null;
  }

  return listed.map((entry) => {
    // A project without a herdr workspace of its own cannot be opened
    const label: string | null =
      entry.status === 'no herdr'
        ? null
        : (entry.label ?? entry.workspace?.label ?? entry.name);
    const isProject = !!entry.path;
    return {
      key: `${machine.label}:${entry.path ?? entry.workspace?.id ?? entry.name}`,
      name: entry.name,
      machine: machine.label,
      remote: { target: machine.target, isReachable: true },
      folder: entry.folder ?? '-',
      label,
      path: entry.path ?? '',
      apps: (entry.apps ?? []).length,
      tags: entry.tags ?? [],
      groups: entry.groups ?? [],
      branch: entry.branch ?? '',
      org: isProject ? entry.org || 'none' : '',
      changes: entry.changes ?? '',
      project: isProject
        ? {
            name: entry.name,
            path: entry.path,
            folder: entry.folder ?? '',
            label,
            apps: entry.apps ?? [],
            routines: entry.routines ?? [],
            tabs: entry.tabs ?? [],
            tags: entry.tags ?? [],
            groups: entry.groups ?? [],
            branch: entry.branch ?? '',
            org: entry.org ?? '',
            repo: entry.repo ?? '',
            changes: entry.changes ?? '',
          }
        : null,
      workspace: entry.workspace
        ? {
            workspace_id: entry.workspace.id,
            label: entry.workspace.label,
            number: 0,
            tab_count: entry.workspace.tabs,
            pane_count: entry.workspace.panes,
            agent_status: '',
            focused: entry.status === 'focused',
            agents: entry.workspace.agents ?? [],
          }
        : null,
    };
  });
}

/**
 * The rows of every saved machine. A machine that does not answer keeps the
 * rows it gave last time, marked as unreachable.
 */
async function readAllMachineRows(previous: Row[] = []): Promise<Row[]> {
  const machines = await readMachines();
  const perMachine = await Promise.all(
    machines.map(async (machine) => {
      const rows = await readMachineRows(machine);
      if (rows) return rows;
      const kept = previous.filter((row) => row.machine === machine.label);
      return kept.length > 0
        ? kept.map((row) => ({
            ...row,
            remote: { target: machine.target, isReachable: false },
          }))
        : [
            {
              key: `${machine.label}:unreachable`,
              name: `(${machine.label})`,
              machine: machine.label,
              remote: { target: machine.target, isReachable: false },
              folder: '-',
              label: null,
              path: '',
              apps: 0,
              tags: [],
              groups: [],
              branch: '',
              org: '',
              changes: '',
              project: null,
              workspace: null,
            } as Row,
          ];
    })
  );
  return perMachine.flat();
}

////////////////////////////////////////////////////////////////////////////////
// ROWS
////////////////////////////////////////////////////////////////////////////////

function buildRows(projects: Project[], herdr: HerdrState): Row[] {
  const rows: Row[] = projects.map((project) => ({
    key: project.path,
    name: project.name,
    machine: 'local',
    folder: project.folder,
    label: project.label,
    path: project.path,
    apps: project.apps.length,
    tags: project.tags,
    groups: project.groups,
    branch: project.branch,
    org: project.org || 'none',
    changes: project.changes,
    project,
    workspace:
      herdr.workspaces.find(
        (workspace) => workspace.label === project.label
      ) ?? null,
  }));

  const labels = projects.map((project) => project.label);

  for (const workspace of herdr.workspaces) {
    if (!labels.includes(workspace.label)) {
      rows.push({
        key: workspace.workspace_id,
        name: workspace.label,
        machine: 'local',
        folder: '-',
        label: workspace.label,
        path: '',
        apps: 0,
        tags: [],
        groups: [],
        branch: '',
        org: '',
        changes: '',
        project: null,
        workspace,
      });
    }
  }

  return rows;
}

function statusOf(row: Row): string {
  if (row.remote && !row.remote.isReachable) return 'offline';
  if (isOwn(row)) return 'here';
  if (row.workspace && !row.project) return 'stray';
  if (row.workspace) return row.workspace.focused ? 'focused' : 'open';
  if (!row.label) return 'no herdr';
  return 'closed';
}

function colorOf(row: Row, theme: Theme): string | undefined {
  const status = statusOf(row);
  if (status === 'offline') return theme.dim;
  if (status === 'here') return theme.here;
  if (status === 'focused') return theme.focused;
  if (status === 'open') return theme.open;
  if (status === 'stray') return theme.stray;
  return theme.dim;
}

////////////////////////////////////////////////////////////////////////////////
// PLAIN LISTING
////////////////////////////////////////////////////////////////////////////////

const COLUMNS: { title: string; width: number; cell: (row: Row) => string }[] =
  [
    { title: 'NAME', width: 16, cell: (row) => row.name },
    { title: 'MACHINE', width: 9, cell: (row) => row.machine },
    { title: 'FOLDER', width: 12, cell: (row) => row.folder },
    { title: 'ORG', width: 17, cell: (row) => row.org || '-' },
    { title: 'BRANCH', width: 14, cell: (row) => row.branch || '-' },
    { title: 'CHANGES', width: 10, cell: (row) => row.changes || '-' },
    { title: 'STATUS', width: 10, cell: statusOf },
    {
      title: 'TABS',
      width: 6,
      cell: (row) => String(row.workspace?.tab_count ?? '-'),
    },
    {
      title: 'PANES',
      width: 7,
      cell: (row) => String(row.workspace?.pane_count ?? '-'),
    },
    {
      title: 'AGENTS',
      width: 9,
      // How many of the workspace's agents are working, out of how many it has
      cell: (row) => {
        const agents = row.workspace?.agents ?? [];
        if (agents.length === 0) return '-';
        const active = agents.filter(
          (agent) => agent.status === 'working'
        ).length;
        return `${active} of ${agents.length}`;
      },
    },
    { title: 'APPS', width: 6, cell: (row) => String(row.apps || '-') },
    { title: 'GROUPS', width: 18, cell: (row) => row.groups.join(', ') || '-' },
  ];

function line(
  cells: string[],
  pathCell: string,
  width: number,
  columns: typeof COLUMNS = COLUMNS
): string {
  const fixed = cells
    .map((cell, index) =>
      cell.slice(0, columns[index].width - 1).padEnd(columns[index].width)
    )
    .join('');
  return (' ' + fixed + pathCell).slice(0, width).padEnd(width);
}

/** The dashboard's screens, each with its own set of columns */
type Screen = 'projects' | 'tabs' | 'panes' | 'flat';

// The pane view's three listings: each column's title and width. A width of 0
// takes what is left. The first title of each line always shows.
const PANE_COLUMNS: Record<Exclude<Screen, 'projects'>, [string, number][]> = {
  tabs: [
    ['TAB', 24],
    ['PANES', 8],
    ['ROUTINES', 10],
    ['RUNNING', 10],
  ],
  panes: [
    ['PANE', 26],
    ['ROUTINE', 12],
    ['STATE', 9],
    ['RUNNING', 0],
  ],
  flat: [
    ['PANE', 22],
    ['TAB', 20],
    ['ROUTINE', 12],
    ['STATE', 9],
    ['RUNNING', 0],
  ],
};

/**
 * The order a screen is sorted in: by one column, upwards or downwards
 */
interface SortOrder {
  column: string;
  isDescending: boolean;
}

/**
 * Compares two cells: numbers by value, text by alphabet, empty cells last
 */
function compareCells(a: string, b: string): number {
  const isEmpty = (cell: string) => cell === '' || cell === '-';
  if (isEmpty(a) || isEmpty(b)) return Number(isEmpty(a)) - Number(isEmpty(b));
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Sorts a list by one column's cell, keeping the given order when unsorted
 */
function sortBy<T>(
  items: T[],
  order: SortOrder | undefined,
  cell: (item: T, column: string) => string
): T[] {
  if (!order) return items;
  const sorted = [...items].sort((a, b) =>
    compareCells(cell(a, order.column), cell(b, order.column))
  );
  return order.isDescending ? sorted.reverse() : sorted;
}

/** The arrow shown beside the title of the column a screen is sorted by */
function sortMark(order: SortOrder | undefined, title: string): string {
  return order?.column === title ? (order.isDescending ? '▼' : '▲') : '';
}

/**
 * The cells of one line of the pane view, by column title
 */
function paneCells(item: {
  tab: string;
  pane: PaneState | null;
  members: PaneState[];
}): Record<string, string> {
  const { pane } = item;
  if (pane) {
    return {
      TAB: pane.tab,
      PANE: pane.name,
      ROUTINE: pane.routine?.routine ?? '-',
      STATE: pane.isAgent ? 'agent' : pane.running ? 'running' : 'idle',
      RUNNING: pane.running,
    };
  }
  // A tab: its size, how many panes name a routine, how many are busy
  const busy = item.members.filter((member) => member.running).length;
  const named = item.members.filter((member) => member.routine).length;
  return {
    TAB: item.tab,
    PANES: String(item.members.length),
    ROUTINES: named > 0 ? String(named) : '-',
    RUNNING: busy > 0 ? `${busy} of ${item.members.length}` : '-',
  };
}

/** Columns kept empty between the last tag and the table's right border */
const TAGS_MARGIN = 2;

/**
 * As many whole tags as a width holds, comma-separated and in the order
 * meta.json gives them, then `+n` for the ones left out
 */
function fitTags(tags: string[], width: number): { text: string; hidden: number } {
  for (let shown = tags.length; shown >= 0; shown--) {
    const hidden = tags.length - shown;
    const text =
      tags.slice(0, shown).join(', ') +
      (hidden > 0 ? `${shown > 0 ? ', ' : ''}+${hidden}` : '');
    if (text.length <= width) return { text, hidden };
  }
  return { text: '', hidden: tags.length };
}

/** The part of a line of segments between two columns */
function cut(segments: Segment[], from: number, to: number): Segment[] {
  const out: Segment[] = [];
  let at = 0;
  for (const segment of segments) {
    const start = Math.max(from - at, 0);
    const end = Math.min(to - at, segment.text.length);
    if (end > start) out.push({ ...segment, text: segment.text.slice(start, end) });
    at += segment.text.length;
  }
  return out;
}

/** A project row's cell under a column title, TAGS included */
function rowCell(row: Row, title: string): string {
  if (title === 'TAGS') return row.tags.join(' ');
  return COLUMNS.find((column) => column.title === title)?.cell(row) ?? '';
}

/**
 * One line of a pane view listing; a missing value prints the column's title
 */
function paneLine(
  screen: Exclude<Screen, 'projects'>,
  values: Record<string, string> | null,
  width: number,
  hidden: string[],
  order?: SortOrder
): string {
  const text = PANE_COLUMNS[screen]
    .filter(([title]) => !hidden.includes(title))
    .map(([title, size]) => {
      const cell = values
        ? (values[title] ?? '')
        : title + sortMark(order, title);
      return size > 0 ? cell.slice(0, size - 1).padEnd(size) : cell;
    })
    .join('');
  return (' ' + text).slice(0, width).padEnd(width);
}

function printPlain(root: string, rows: Row[], herdr: HerdrState) {
  console.log(
    `herdr: ${herdr.isRunning ? 'running' : 'not running'}  root: ${root}`
  );
  console.log(
    line(
      COLUMNS.map((column) => column.title),
      'PATH',
      200
    ).trimEnd()
  );
  for (const row of rows) {
    console.log(
      line(
        COLUMNS.map((column) => column.cell(row)),
        row.path,
        200
      ).trimEnd()
    );
  }
}

////////////////////////////////////////////////////////////////////////////////
// DASHBOARD
////////////////////////////////////////////////////////////////////////////////

const REFRESH_MS = 2000;

/**
 * The colours of the dashboard. A colour left undefined is the terminal's own.
 */
interface Theme {
  background?: string;
  dialogBackground: string;
  dialogText?: string;
  buttonBackground: string;
  buttonOffBackground?: string;
  buttonText?: string;
  /** Body text and column titles */
  text?: string;
  /** Hints, closed projects, dimmed buttons */
  dim: string;
  /** The frame, the selected row, the focused button */
  accent: string;
  /** The frame's title */
  title: string;
  /** Header labels and the button bar's target */
  label: string;
  /** Key names in the header */
  key: string;
  /** Text drawn on the accent colour */
  selectionText: string;
  marked: string;
  danger: string;
  open: string;
  focused: string;
  here: string;
  stray: string;
}

const THEMES: Record<string, Theme> = {
  navy: {
    background: '#0f1a2b',
    dialogBackground: '#1d3557',
    dialogText: '#e6edf3',
    buttonBackground: '#27496d',
    buttonOffBackground: '#16263d',
    buttonText: '#e6edf3',
    text: '#e6edf3',
    dim: '#7d8590',
    accent: '#39c5cf',
    title: '#56d4dd',
    label: '#e3b341',
    key: '#5fafff',
    selectionText: '#0f1a2b',
    marked: '#f2cc60',
    danger: '#ff7b72',
    open: '#3fb950',
    focused: '#56d4dd',
    here: '#f2cc60',
    stray: '#d2a8ff',
  },
  paper: {
    background: '#f4ecd8',
    dialogBackground: '#e0d2ad',
    dialogText: '#3b3226',
    buttonBackground: '#d6c292',
    buttonOffBackground: '#ebe1c6',
    buttonText: '#3b3226',
    text: '#3b3226',
    dim: '#8a7d68',
    accent: '#b5651d',
    title: '#8f4a0f',
    label: '#7a5c00',
    key: '#1f6f8b',
    selectionText: '#f4ecd8',
    marked: '#a04000',
    danger: '#b3261e',
    open: '#2e7d32',
    focused: '#1f6f8b',
    here: '#a04000',
    stray: '#7b3fa0',
  },
  forest: {
    background: '#0f1f17',
    dialogBackground: '#1c3a2b',
    dialogText: '#e3efe6',
    buttonBackground: '#2a5540',
    buttonOffBackground: '#162a20',
    buttonText: '#e3efe6',
    text: '#e3efe6',
    dim: '#7a9484',
    accent: '#5fd38d',
    title: '#8ee6ad',
    label: '#e6c66a',
    key: '#7cc7e8',
    selectionText: '#0f1f17',
    marked: '#f0d77a',
    danger: '#ff8a80',
    open: '#5fd38d',
    focused: '#7cc7e8',
    here: '#f0d77a',
    stray: '#d8a6e8',
  },
  graphite: {
    background: '#1c1c1e',
    dialogBackground: '#2c2c2e',
    dialogText: '#f2f2f7',
    buttonBackground: '#3a3a3c',
    buttonOffBackground: '#242426',
    buttonText: '#f2f2f7',
    text: '#f2f2f7',
    dim: '#8e8e93',
    accent: '#d1d1d6',
    title: '#ffffff',
    label: '#ffd60a',
    key: '#64d2ff',
    selectionText: '#1c1c1e',
    marked: '#ffd60a',
    danger: '#ff453a',
    open: '#30d158',
    focused: '#64d2ff',
    here: '#ffd60a',
    stray: '#bf5af2',
  },
  // Follows the terminal: its background, its text and its 16 named colours
  terminal: {
    dialogBackground: 'blackBright',
    dialogText: 'whiteBright',
    buttonBackground: 'blue',
    buttonText: 'whiteBright',
    dim: 'gray',
    accent: 'cyan',
    title: 'cyan',
    label: 'yellow',
    key: 'blue',
    selectionText: 'black',
    marked: 'yellow',
    danger: 'red',
    open: 'green',
    focused: 'cyan',
    here: 'yellow',
    stray: 'magenta',
  },
};

const DEFAULT_THEME = 'navy';

/**
 * Where the dashboard keeps what the person chose (the theme)
 */
function settingsPath(): string {
  return join(Deno.env.get('HOME') ?? '.', '.config', 'run', 'projects.json');
}

/**
 * What the dashboard remembers between runs
 */
/**
 * A saved answer to "which projects do I want to see": a project is listed
 * when it passes every rule the view gives. A rule left out lets all through.
 */
export interface ProjectView {
  /** Has at least one of these tags */
  tags?: string[];
  /** Belongs to at least one of these groups */
  groups?: string[];
  /** Sits in one of these top-level folders */
  folders?: string[];
  /** Is on one of these machines: `local`, or a saved machine's label */
  machines?: string[];
  /**
   * Its repository is pushed to one of these organizations or users; `none`
   * takes the projects with no remote
   */
  orgs?: string[];
  /** Has a workspace open in herdr */
  openOnly?: boolean;
  /**
   * Its STATUS is one of these. `open` also takes `focused` and `here`, which
   * are open workspaces too.
   */
  status?: string[];
  /**
   * Its git state: `pending` when it has uncommitted files or commits to push
   * or pull, `clean` when it has none. A folder with no repository is neither.
   */
  changes?: 'pending' | 'clean';
}

interface Settings {
  theme?: string;
  /** Saved views, by name. Written by hand or by an agent, not by the dashboard */
  views?: Record<string, ProjectView>;
  /** The view the dashboard starts in */
  startView?: string;
  /** Titles of the columns left out, for each screen */
  hidden?: Record<string, string[]>;
  /** The column each screen is sorted by */
  sort?: Record<string, SortOrder>;
  /** How the pane view opens: by tab, or every pane at once */
  panes?: 'tabs' | 'flat';
  /** Whether projects show their colour in herdr's sidebar; on unless false */
  colors?: boolean;
}

/**
 * Whether a row is listed under a view
 */
function isInView(row: Row, view: ProjectView): boolean {
  const any = (wanted: string[] | undefined, have: string[]) =>
    !wanted?.length || wanted.some((value) => have.includes(value));
  return (
    any(view.tags, row.tags) &&
    any(view.groups, row.groups) &&
    any(view.folders, [row.folder]) &&
    any(view.machines, [row.machine]) &&
    any(view.orgs, [row.org]) &&
    any(view.status, [
      statusOf(row),
      ...(row.workspace && row.project ? ['open'] : []),
    ]) &&
    (!view.openOnly || !!row.workspace) &&
    (!view.changes ||
      (view.changes === 'clean'
        ? row.changes === 'clean'
        : !['clean', '-', ''].includes(row.changes)))
  );
}

/**
 * One line saying what a view lets through
 */
function describeView(view: ProjectView): string {
  const parts = [
    view.tags?.length ? `tags ${view.tags.join(', ')}` : '',
    view.groups?.length ? `groups ${view.groups.join(', ')}` : '',
    view.folders?.length ? `folders ${view.folders.join(', ')}` : '',
    view.machines?.length ? `machines ${view.machines.join(', ')}` : '',
    view.orgs?.length ? `orgs ${view.orgs.join(', ')}` : '',
    view.status?.length ? `status ${view.status.join(', ')}` : '',
    view.changes ? `changes ${view.changes}` : '',
    view.openOnly ? 'open only' : '',
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'everything';
}

export function readSettings(): Settings {
  try {
    return JSON.parse(Deno.readTextFileSync(settingsPath())) ?? {};
  } catch {
    return {};
  }
}

export function saveSettings(changes: Settings) {
  try {
    Deno.mkdirSync(dirname(settingsPath()), { recursive: true });
    Deno.writeTextFileSync(
      settingsPath(),
      JSON.stringify({ ...readSettings(), ...changes }, null, 2) + '\n'
    );
  } catch {
    // The choice still applies for this run
  }
}

/** Screen line of the column titles, counted from 1; the rows start below it */
const TABLE_TOP = 8;

/**
 * The button bar under the table, in order. A button is lit when its action
 * applies to the targeted rows.
 */
const BUTTONS: { kind: ActionKind; label: string }[] = [
  { kind: 'open', label: 'Open' },
  { kind: 'stop', label: 'Close' },
  { kind: 'only', label: 'Close others' },
];

// Every key, most used first: the header shows as many as fit, `?` lists them
const KEYS: [string, string][] = [
  ['<?>', 'All keys'],
  ['<enter>', 'Press'],
  ['<space>', 'Mark'],
  ['<p>', 'Panes'],
  ['<v>', 'Views'],
  ['<t>', 'Tag/group'],
  ['<a>', 'Open only'],
  ['</>', 'Filter'],
  ['<i>', 'All tags'],
  ['<o>', 'Sort'],
  ['<,>', 'Columns'],
  ['<shift+,>', 'Settings'],
  ['<[ ]>', 'Next view'],
  ['<0>', 'All projects'],
  ['<A>', 'Mark all'],
  ['<T>', 'Theme'],
  ['<r>', 'Rescan'],
  ['<R>', 'Restart'],
  ['<tab>', 'Button'],
  ['<1-3>', 'Button'],
  ['<click>', 'Select'],
  ['<esc>', 'Clear'],
  ['<q>', 'Quit'],
];

// The keys of the pane view, listed by `?` after the ones above
const PANE_KEYS: [string, string][] = [
  ['<enter>', 'Into a tab, or choose a routine for a pane'],
  ['<s>', 'Start the tab or the pane default routine'],
  ['<S>', 'Start every idle pane that names a routine'],
  ['<f>', 'All panes, or back to tabs'],
  ['<o>', 'Sort by the next column; O reverses'],
  ['<esc>', 'Back'],
];

/** Width of one key hint in the header: the key, then what it does */
const KEY_WIDTH = 11;
const HINT_WIDTH = KEY_WIDTH + 12;

type Mode =
  | 'browse'
  | 'view'
  | 'filter'
  | 'confirm'
  | 'pick'
  | 'ask'
  | 'routine'
  | 'settings'
  | 'info'
  | 'help';

/**
 * A tag or a group the table is narrowed to
 */
interface Scope {
  kind: 'group' | 'tag';
  value: string;
}

type ActionKind = 'open' | 'stop' | 'only';

/**
 * A piece of one screen line, drawn in one style
 */
interface Segment {
  text: string;
  color?: string;
  background?: string;
  bold?: boolean;
}

/**
 * Something the person can do to the targeted rows, ready to run
 */
interface Action {
  kind: ActionKind;
  title: string;
  /** Rows the action changes; what a confirmation lists */
  rows: Row[];
  /** Whether it closes workspaces, and so asks first */
  isDestructive: boolean;
}

/**
 * The herdr workspace this dashboard runs in. It is never stopped from here.
 */
const OWN_WORKSPACE = Deno.env.get('HERDR_WORKSPACE_ID');

/**
 * Fill the whole terminal with the dashboard's background colour, so the
 * cells the tree does not cover match it
 */
function paintBackground(theme: Theme) {
  let colour = '\x1b[49m';
  if (theme.background) {
    const [red, green, blue] = [1, 3, 5].map((at) =>
      parseInt(theme.background!.slice(at, at + 2), 16)
    );
    colour = `\x1b[48;2;${red};${green};${blue}m`;
  }
  Deno.stdout.writeSync(
    new TextEncoder().encode(`${colour}\x1b[2J\x1b[H\x1b[0m`)
  );
}

function isOwn(row: Row): boolean {
  // Workspace ids are per machine: another machine's `w1` is not this one
  return (
    row.machine === 'local' &&
    !!OWN_WORKSPACE &&
    row.workspace?.workspace_id === OWN_WORKSPACE
  );
}

function fit(text: string, width: number): string {
  return text.slice(0, Math.max(width, 0)).padEnd(Math.max(width, 0));
}

function names(rows: Row[], max = 6): string {
  const shown = rows.slice(0, max).map((row) => row.name);
  const rest = rows.length - shown.length;
  return shown.join(', ') + (rest > 0 ? ` +${rest} more` : '');
}

/**
 * What can be done to the targeted rows, given what is running
 */
function actionsFor(targets: Row[], allRows: Row[]): Action[] {
  const actions: Action[] = [];
  // A machine that does not answer cannot be acted on
  const reachable = targets.filter((row) => !row.remote || row.remote.isReachable);
  const stopped = reachable.filter(
    (row) => !row.workspace && row.label && row.project
  );
  const running = reachable.filter((row) => row.workspace && !isOwn(row));
  // "Others" never reaches a machine the targets are not on: closing
  // everything else here must not close what runs somewhere else
  const machines = targets.map((row) => row.machine);
  const others = allRows.filter(
    (row) =>
      row.workspace &&
      !isOwn(row) &&
      !targets.includes(row) &&
      machines.includes(row.machine)
  );

  // Open builds the workspace of each closed target and never moves the
  // focus: switching to a workspace is herdr's job
  if (stopped.length > 0) {
    actions.push({
      kind: 'open',
      title: targets.length === 1 ? 'Open' : `Open ${stopped.length} closed`,
      rows: stopped,
      isDestructive: false,
    });
  }
  if (running.length > 0) {
    actions.push({
      kind: 'stop',
      title: targets.length === 1 ? 'Stop' : `Stop ${running.length} running`,
      rows: running,
      isDestructive: true,
    });
  }
  if (others.length > 0) {
    actions.push({
      kind: 'only',
      title: `Stop everything else (${others.length})`,
      rows: others,
      isDestructive: true,
    });
  }

  return actions;
}

/** Set when the person asks for a restart; read once the dashboard has left */
let isRestartRequested = false;

function Dashboard({
  root,
  isDryRun,
  initialTheme,
  initialView,
}: {
  root: string;
  isDryRun: boolean;
  initialTheme: string;
  initialView: string | null;
}) {
  const { exit } = useApp();
  const { stdout } = useStdout();

  const [size, setSize] = useState({
    columns: stdout.columns || 100,
    rows: stdout.rows || 30,
  });
  const [projects, setProjects] = useState<Project[]>([]);
  const [herdr, setHerdr] = useState<HerdrState>({
    isRunning: false,
    workspaces: [],
  });
  const [selected, setSelected] = useState(0);
  const [mode, setMode] = useState<Mode>('browse');
  const [filter, setFilter] = useState('');
  const [isLiveOnly, setIsLiveOnly] = useState(false);
  const [marked, setMarked] = useState<string[]>([]);
  const [button, setButton] = useState(0);
  const [themeName, setThemeName] = useState(initialTheme);
  const theme = THEMES[themeName];
  const [scope, setScope] = useState<Scope | null>(null);
  // Saved views come from the settings file; the one applied, null for all
  const [views, setViews] = useState<Record<string, ProjectView>>(
    () => readSettings().views ?? {}
  );
  const [viewName, setViewName] = useState<string | null>(initialView);
  const [viewIndex, setViewIndex] = useState(0);
  const [isDeletingView, setIsDeletingView] = useState(false);
  const viewNames = Object.keys(views);
  const activeView = viewName !== null ? (views[viewName] ?? null) : null;
  // The open project whose panes are on screen, when the pane view is up
  const [viewing, setViewing] = useState<Row | null>(null);
  const [panes, setPanes] = useState<PaneState[]>([]);
  const [paneSelected, setPaneSelected] = useState(0);
  // The column each screen is sorted by; a screen left out keeps its own order
  const [sort, setSort] = useState<Record<string, SortOrder>>(
    () => readSettings().sort ?? {}
  );
  // The tab whose panes are listed; null lists the tabs themselves
  const [tabOpen, setTabOpen] = useState<string | null>(null);
  // The pane a routine is being chosen for, and the highlighted choice
  const [choosing, setChoosing] = useState<PaneState | null>(null);
  const [routineIndex, setRoutineIndex] = useState(0);
  // Lists every pane of every tab at once, in place of the two levels
  const [isFlat, setIsFlat] = useState(false);
  // Columns left out of the projects table, and the settings list's cursor
  const [hidden, setHidden] = useState<Record<string, string[]>>(() => {
    const saved = readSettings().hidden;
    // An earlier version saved one list, for the projects table
    return Array.isArray(saved) ? { projects: saved } : (saved ?? {});
  });
  const [settingIndex, setSettingIndex] = useState(0);
  const [helpTop, setHelpTop] = useState(0);
  // The project whose tags and groups are shown in full
  const [informing, setInforming] = useState<Row | null>(null);
  // Which list is up: the whole dashboard's, or the current screen's columns
  const [settingsKind, setSettingsKind] = useState<'global' | 'columns'>(
    'global'
  );
  const [, setRevision] = useState(0);
  const screenNow: Screen = !viewing
    ? 'projects'
    : isFlat
      ? 'flat'
      : tabOpen !== null
        ? 'panes'
        : 'tabs';
  const hiddenHere = hidden[screenNow] ?? [];
  const columns = COLUMNS.filter(
    (column) => !(hidden.projects ?? []).includes(column.title)
  );

  const cycleTheme = () => {
    const all = Object.keys(THEMES);
    const next = all[(all.indexOf(themeName) + 1) % all.length];
    paintBackground(THEMES[next]);
    setThemeName(next);
    saveSettings({ theme: next });
    return next;
  };

  // The titles of the current screen's columns that can be hidden: all but
  // the one that names the line
  const hideable =
    screenNow === 'projects'
      ? [...COLUMNS.slice(1).map((column) => column.title), 'TAGS']
      : PANE_COLUMNS[screenNow].slice(1).map(([title]) => title);

  // The columns the screen in view shows, in order: what sorting steps through
  const sortable = (
    screenNow === 'projects'
      ? [...COLUMNS.map((column) => column.title), 'TAGS']
      : PANE_COLUMNS[screenNow].map(([title]) => title)
  ).filter((title) => !hiddenHere.includes(title));

  const applySort = (order: SortOrder | undefined) => {
    const next = { ...sort };
    if (order) next[screenNow] = order;
    else delete next[screenNow];
    setSort(next);
    saveSettings({ sort: next });
    setMessage(
      order
        ? `sorted by ${order.column}${order.isDescending ? ', descending' : ''}`
        : 'sort removed'
    );
  };

  // Next column, then no sort at all
  const stepSort = () => {
    const title = sortable[sortable.indexOf(sort[screenNow]?.column ?? '') + 1];
    applySort(title ? { column: title, isDescending: false } : undefined);
  };

  const flipSort = () => {
    const current = sort[screenNow];
    if (current) applySort({ ...current, isDescending: !current.isDescending });
  };

  // A click on a column title: ascending, then descending, then unsorted
  const clickSort = (title: string) => {
    const current = sort[screenNow];
    if (current?.column !== title) {
      applySort({ column: title, isDescending: false });
    } else if (!current.isDescending) {
      applySort({ column: title, isDescending: true });
    } else {
      applySort(undefined);
    }
  };

  const settingItems =
    settingsKind === 'global'
      ? [
          { text: `Theme: ${themeName}`, run: () => void cycleTheme() },
          {
            text: `Pane view opens: ${
              readSettings().panes === 'flat' ? 'all panes' : 'by tab'
            }`,
            run: () =>
              saveSettings({
                panes: readSettings().panes === 'flat' ? 'tabs' : 'flat',
              }),
          },
        ]
      : hideable.map((title) => ({
          text: `${hiddenHere.includes(title) ? '[ ]' : '[x]'} ${title}`,
          run: () => {
            const next = {
              ...hidden,
              [screenNow]: hiddenHere.includes(title)
                ? hiddenHere.filter((name) => name !== title)
                : [...hiddenHere, title],
            };
            setHidden(next);
            saveSettings({ hidden: next });
          },
        }));

  // What the pane view lists: the tabs, one tab's panes, or every pane
  const paneItems = useMemo(() => {
    const ofPane = (pane: PaneState) => ({
      tab: pane.tab,
      pane: pane as PaneState | null,
      members: [pane],
    });
    const items = isFlat
      ? panes.map(ofPane)
      : tabOpen !== null
        ? panes.filter((pane) => pane.tab === tabOpen).map(ofPane)
        : [...new Set(panes.map((pane) => pane.tab))].map((tab) => ({
            tab,
            pane: null as PaneState | null,
            members: panes.filter((pane) => pane.tab === tab),
          }));
    return sortBy(
      items,
      sort[isFlat ? 'flat' : tabOpen !== null ? 'panes' : 'tabs'],
      (item, column) => paneCells(item)[column] ?? ''
    );
  }, [panes, tabOpen, isFlat, sort]);
  const viewingRef = useRef<Row | null>(null);
  viewingRef.current = viewing;
  const [pickIndex, setPickIndex] = useState(0);
  const [pending, setPending] = useState<Action | null>(null);
  // The open question: the routine under the cursor, and those unticked
  const [askIndex, setAskIndex] = useState(0);
  const [askOff, setAskOff] = useState<string[]>([]);
  // The profile the ticks were last set from: 'all', 'none' or a name
  const [askProfile, setAskProfile] = useState('all');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const isBusy = useRef(false);

  useEffect(() => {
    const onResize = () => {
      paintBackground(THEMES[themeRef.current]);
      setSize({ columns: stdout.columns || 100, rows: stdout.rows || 30 });
    };
    stdout.on('resize', onResize);
    return () => {
      stdout.off('resize', onResize);
    };
  }, [stdout]);

  const projectsRef = useRef<Project[]>([]);
  // The projects of the other saved machines, refreshed on a slower beat
  const [remoteRows, setRemoteRows] = useState<Row[]>([]);
  const remoteRef = useRef<Row[]>([]);
  const isReadingRemote = useRef(false);
  const refreshRemote = async () => {
    if (isReadingRemote.current) return;
    isReadingRemote.current = true;
    try {
      remoteRef.current = await readAllMachineRows(remoteRef.current);
      setRemoteRows(remoteRef.current);
    } finally {
      isReadingRemote.current = false;
    }
  };
  const themeRef = useRef(initialTheme);
  const ticks = useRef(0);
  themeRef.current = themeName;
  const rescan = async () => setProjects(await discoverProjects(root));
  const refreshPanes = async (row: Row | null = viewingRef.current) => {
    if (!row?.workspace) return;
    setPanes(
      await readPanes(
        row.workspace.workspace_id,
        row.project?.routines ?? [],
        row.project?.tabs ?? []
      )
    );
  };
  const refresh = async () => {
    ticks.current += 1;
    // Another machine is asked over SSH: every fifth beat, and never awaited,
    // so a slow or absent machine cannot hold the local table up
    if (ticks.current % 5 === 1) refreshRemote();
    setHerdr(await readHerdrState());
    await refreshPanes();
    // Branches change under the dashboard, so they are re-read with herdr
    setProjects(
      await Promise.all(
        projectsRef.current.map(async (project) => ({
          ...project,
          branch: await readBranch(project.path),
          // One git process per project: only every fifth refresh
          changes:
            ticks.current % 5 === 0
              ? await readChanges(project.path)
              : project.changes,
        }))
      )
    );
  };

  useEffect(() => {
    rescan();
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  projectsRef.current = projects;

  const allRows = useMemo(
    () => [...buildRows(projects, herdr), ...remoteRows],
    [projects, herdr, remoteRows]
  );

  const rows = useMemo(() => {
    const needle = filter.toLowerCase();
    const listed = allRows.filter(
      (row) =>
        (!isLiveOnly || row.workspace) &&
        (!activeView || isInView(row, activeView)) &&
        (!scope ||
          (scope.kind === 'tag' ? row.tags : row.groups).includes(
            scope.value
          )) &&
        (!needle ||
          [row.name, row.folder, ...row.tags, ...row.groups]
            .join(' ')
            .toLowerCase()
            .includes(needle))
    );
    return sortBy(listed, sort.projects, rowCell);
  }, [allRows, filter, isLiveOnly, scope, activeView, sort]);

  // What the picker offers: everything, then each group, then each tag
  const choices = useMemo(() => {
    const count = (kind: Scope['kind']) => {
      const counts = new Map<string, number>();
      for (const row of allRows) {
        for (const value of kind === 'tag' ? row.tags : row.groups) {
          counts.set(value, (counts.get(value) ?? 0) + 1);
        }
      }
      return [...counts.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([value, total]) => ({
          scope: { kind, value } as Scope | null,
          text: `${kind}: ${value}`,
          total,
        }));
    };
    return [
      { scope: null as Scope | null, text: 'all projects', total: projects.length },
      ...count('group'),
      ...count('tag'),
    ];
  }, [allRows, projects]);

  const cursor = Math.min(selected, Math.max(rows.length - 1, 0));
  const current: Row | undefined = rows[cursor];

  // Marked rows are the target when there are any; else the row under the cursor
  const markedRows = allRows.filter((row) => marked.includes(row.key));
  const targets = markedRows.length > 0 ? markedRows : current ? [current] : [];
  const actions = actionsFor(targets, allRows);

  const herdrDo = (args: string[]) =>
    isDryRun
      ? Promise.resolve({ isOk: true, output: '', stdout: '' })
      : capture('herdr', args);

  const startRow = async (
    row: Row,
    only: string[] | null
  ): Promise<string | null> => {
    if (isDryRun) return null;
    const all = row.project?.routines ?? [];
    const args = [
      'herdr',
      'init',
      row.label!,
      '--all',
      // The dashboard never moves the person to another workspace
      '--no-focus',
      // `only` holds the panes to start, as tab/pane; null starts none
      ...(only && only.length > 0 ? ['--start'] : []),
      ...(only && only.length > 0 && only.length < all.length
        ? ['--only', only.join(',')]
        : []),
    ];
    // On another machine the same command runs there, in the project's folder
    const init = row.remote
      ? await onMachine(
          row.remote.target,
          `run -p ${quoted(row.project!.path)} ${args.map(quoted).join(' ')}`
        )
      : await runSelf(args, row.project!.path);
    return init.isOk ? null : lastLine(init.output);
  };

  // `skipped` lists the routines not to start, by their key in the question;
  // null opens without starting any
  const perform = async (action: Action, skipped: string[] | null = null) => {
    const withRoutines =
      skipped !== null &&
      routinesToStart(action).some(({ key }) => !skipped.includes(key));
    if (isBusy.current) return;
    isBusy.current = true;
    setMessage('');
    const prefix = isDryRun ? 'dry run: ' : '';
    const failures: string[] = [];

    try {
      if (action.kind === 'open') {
        for (const row of action.rows) {
          if (row.workspace) continue;
          setBusy(`opening ${row.name}...`);
          const failure = await startRow(
            row,
            skipped === null
              ? null
              : (row.project?.routines ?? [])
                  .filter(
                    ({ tab, pane }) =>
                      !skipped.includes(`${row.key}/${tab}/${pane}`)
                  )
                  .map(({ tab, pane }) => `${tab}/${pane}`)
          );
          if (failure) failures.push(`${row.name}: ${failure}`);
        }
      }

      if (action.kind === 'stop' || action.kind === 'only') {
        for (const row of action.rows) {
          // The dashboard's own workspace always stays
          if (!row.workspace || isOwn(row)) continue;
          setBusy(`closing ${row.name}...`);
          const close =
            row.remote && !isDryRun
              ? await onMachine(
                  row.remote.target,
                  `herdr workspace close ${quoted(row.workspace.workspace_id)}`
                )
              : await herdrDo(['workspace', 'close', row.workspace.workspace_id]);
          if (!close.isOk) {
            failures.push(`${row.name}: ${lastLine(close.output)}`);
          }
        }
      }

      const verb = action.kind === 'open' ? 'opened' : 'closed';
      const started = !withRoutines
        ? ''
        : skipped!.length > 0
          ? ' and started the chosen routines'
          : ' and started their routines';
      setMessage(
        failures.length > 0
          ? `failed: ${failures.join('; ')}`
          : `${prefix}${verb} ${names(action.rows)}${started}`
      );
    } catch (error) {
      setMessage(String(error));
    }

    setMarked([]);
    await refresh();
    if (action.rows.some((row) => row.remote)) await refreshRemote();
    isBusy.current = false;
    setBusy('');
  };

  const targetLabel = ` ${
    markedRows.length > 0
      ? `${markedRows.length} marked`
      : (current?.name ?? 'nothing selected')
  }  `;

  // The routines an open would start: those of the closed projects it opens
  const routinesToStart = (
    action: Action
  ): { key: string; text: string; profiles: string[] }[] =>
    action.kind === 'open'
      ? action.rows
          .filter((row) => !row.workspace)
          .flatMap((row) =>
            (row.project?.routines ?? []).map(
              ({ tab, pane, routine, profiles }) => ({
                key: `${row.key}/${tab}/${pane}`,
                text: `${row.name}  ${pane}: ${routine}`,
                profiles,
              })
            )
          )
      : [];

  // What the Open question can tick in one go: everything, each profile the
  // routines name, nothing
  const profilesOf = (action: Action): string[] => [
    'all',
    ...[
      ...new Set(routinesToStart(action).flatMap(({ profiles }) => profiles)),
    ].sort(),
    'none',
  ];

  const showPanes = (row: Row) => {
    if (row.remote) {
      setMessage(
        `${row.name} runs on ${row.machine}: its panes are not listed here yet, switch to it in herdr`
      );
      return;
    }
    setPanes([]);
    setPaneSelected(0);
    setTabOpen(null);
    setIsFlat(readSettings().panes === 'flat');
    setViewing(row);
    setMessage('');
    refreshPanes(row);
  };

  // Types a pane's routine into it. Only an idle shell is typed into.
  const startPanes = async (wanted: PaneState[]) => {
    const ready = wanted.filter((pane) => pane.routine && pane.isIdle);
    const busy = wanted.filter((pane) => pane.routine && !pane.isIdle);

    if (ready.length === 0) {
      setMessage(
        busy.length > 0
          ? `${busy.map((pane) => pane.name).join(', ')} already running something`
          : wanted.length === 1
            ? `${wanted[0].name} names no routine`
            : 'no pane names a routine'
      );
      return;
    }

    for (const pane of ready) {
      const { routine, path } = pane.routine!;
      // A pane that has wandered to another folder still runs its own routine
      const command =
        pane.cwd === path
          ? `run routine ${routine}`
          : `run -p ${path} routine ${routine}`;
      if (!isDryRun) await capture('herdr', ['pane', 'run', pane.paneId, command]);
    }

    setMessage(
      `${isDryRun ? 'dry run: ' : ''}started ${ready
        .map((pane) => `${pane.name}: ${pane.routine!.routine}`)
        .join(', ')}${busy.length > 0 ? ` (${busy.length} busy, skipped)` : ''}`
    );
    await refreshPanes();
  };

  // Types one routine of the pane's own meta.json into it
  const runInPane = async (pane: PaneState, routine: string) => {
    if (!pane.isIdle) {
      setMessage(`${pane.name} is already running something`);
      return;
    }
    const path = pane.source?.path ?? pane.cwd;
    const command =
      pane.cwd === path
        ? `run routine ${routine}`
        : `run -p ${path} routine ${routine}`;
    if (!isDryRun) await capture('herdr', ['pane', 'run', pane.paneId, command]);
    setMessage(`${isDryRun ? 'dry run: ' : ''}started ${pane.name}: ${routine}`);
    await refreshPanes();
  };

  // Offers the routines of the pane's meta.json, its own one first
  const chooseRoutine = (pane: PaneState) => {
    const offered = pane.source?.routines ?? [];
    if (offered.length === 0) {
      setMessage(`${pane.name}: its folder defines no routine`);
      return;
    }
    setChoosing(pane);
    setRoutineIndex(Math.max(offered.indexOf(pane.routine?.routine ?? ''), 0));
    setMode('routine');
  };

  const press = (index: number) => {
    setButton(index);
    if (targets.length === 0) return;
    const { kind, label } = BUTTONS[index];
    const action = actions.find((candidate) => candidate.kind === kind);
    // Open on one project that is already open shows its panes
    if (!action && kind === 'open' && targets.length === 1 && targets[0].workspace) {
      showPanes(targets[0]);
      return;
    }
    if (!action) {
      setMessage(
        kind === 'open'
          ? targets.some((row) => row.workspace)
            ? `${names(targets)} already open: p shows its panes`
            : `${names(targets)} defines no herdr workspace`
          : targets.every(isOwn)
            ? 'this dashboard runs in that workspace, so it stays'
            : `${label} does not apply to ${names(targets)}`
      );
    } else if (action.isDestructive) {
      setPending(action);
      setMode('confirm');
    } else if (routinesToStart(action).length > 0) {
      // Opening builds the panes; whether their routines run is asked
      setPending(action);
      setAskIndex(0);
      setAskOff([]);
      setAskProfile('all');
      setMode('ask');
    } else {
      perform(action);
    }
  };

  // Where the TAGS column starts inside the table, after the fixed columns
  const tagsAt = 1 + columns.reduce((sum, entry) => sum + entry.width, 0);

  // A click or a wheel turn, as the terminal reports it: 1-based column and line
  const onMouse = (code: number, column: number, lineAt: number) => {
    if (code === 64 || code === 65) {
      const step = code === 64 ? -1 : 1;
      setSelected(Math.min(Math.max(cursor + step, 0), rows.length - 1));
      return;
    }
    if (code !== 0) return;

    // The column titles: sort by the one under the pointer
    if (lineAt === TABLE_TOP) {
      let edge = 2;
      const hit = columns.find((entry) => {
        edge += entry.width;
        return column <= edge;
      });
      const title = hit?.title ?? (hiddenHere.includes('TAGS') ? null : 'TAGS');
      if (title) clickSort(title);
      return;
    }

    const rowAt = first + lineAt - TABLE_TOP - 1;
    if (lineAt > TABLE_TOP && lineAt <= TABLE_TOP + bodyRows) {
      if (rowAt < rows.length) {
        setSelected(rowAt);
        // A click on the tags of a project that hides some: show them all
        const clicked = rows[rowAt];
        const inTags = column - 2 >= tagsAt && !hiddenHere.includes('TAGS');
        if (
          inTags &&
          fitTags(clicked.tags, inner - tagsAt - TAGS_MARGIN).hidden > 0
        ) {
          setInforming(clicked);
          setMode('info');
        }
      }
      return;
    }

    if (lineAt === TABLE_TOP + bodyRows + 3) {
      let start = targetLabel.length;
      BUTTONS.forEach(({ label }, index) => {
        const end = start + label.length + 4;
        if (column > start && column <= end) press(index);
        start = end + 2;
      });
    }
  };

  // The pane view answers the mouse like the table: the wheel moves the
  // cursor, a click on a column title sorts by it, a click on a line selects it
  const onPaneMouse = (code: number, column: number, lineAt: number) => {
    const last = Math.max(paneItems.length - 1, 0);
    const at = Math.min(paneSelected, last);
    if (code === 64 || code === 65) {
      setPaneSelected(Math.min(Math.max(at + (code === 64 ? -1 : 1), 0), last));
      return;
    }
    if (code !== 0) return;

    if (lineAt === TABLE_TOP && screenNow !== 'projects') {
      let edge = 2;
      const shown = PANE_COLUMNS[screenNow].filter(
        ([title]) => !hiddenHere.includes(title)
      );
      // A width of 0 takes what is left of the line
      const hit = shown.find(([, size]) => {
        edge += size;
        return size === 0 || column <= edge;
      });
      if (hit) clickSort(hit[0]);
      return;
    }

    const itemAt = first + lineAt - TABLE_TOP - 1;
    if (lineAt > TABLE_TOP && lineAt <= TABLE_TOP + bodyRows && itemAt <= last) {
      setPaneSelected(itemAt);
    }
  };

  useInput((input, key) => {
    const mouse = input.match(/\[<(\d+);(\d+);(\d+)([Mm])/);
    if (mouse) {
      if (mouse[4] === 'M' && mode === 'browse') {
        (viewing ? onPaneMouse : onMouse)(
          Number(mouse[1]),
          Number(mouse[2]),
          Number(mouse[3])
        );
      }
      return;
    }

    if (mode === 'view') {
      const picked = viewIndex === 0 ? null : viewNames[viewIndex - 1];
      if (isDeletingView) {
        if (input === 'y' && picked) {
          const { [picked]: _removed, ...kept } = views;
          setViews(kept);
          saveSettings({ views: kept });
          if (viewName === picked) setViewName(null);
          setViewIndex(0);
          setMessage(`deleted view ${picked}`);
        }
        setIsDeletingView(false);
      } else if (key.downArrow || input === 'j') {
        setViewIndex((index) => Math.min(index + 1, viewNames.length));
      } else if (key.upArrow || input === 'k') {
        setViewIndex((index) => Math.max(index - 1, 0));
      } else if (key.return) {
        setViewName(picked);
        setSelected(0);
        setMode('browse');
      } else if (input === 'd' || input === 'x') {
        if (picked) setIsDeletingView(true);
        else setMessage('the all view cannot be deleted');
      } else if (input === 'e') {
        // Views are written in the settings file: hand it to the system's
        // editor for that kind of file
        saveSettings({});
        capture('open', [settingsPath()]).then(({ isOk, output }) =>
          setMessage(
            isOk
              ? `opened ${settingsPath()} - press v or r here once it is saved`
              : `could not open ${settingsPath()}: ${lastLine(output)}`
          )
        );
        setMode('browse');
      } else {
        setMode('browse');
      }
      return;
    }

    if (mode === 'info') {
      setInforming(null);
      setMode('browse');
      return;
    }

    if (mode === 'help') {
      const total = KEYS.length + PANE_KEYS.length + 2;
      if (key.downArrow || input === 'j') {
        setHelpTop((top) => Math.min(top + 1, Math.max(total - 4, 0)));
      } else if (key.upArrow || input === 'k') {
        setHelpTop((top) => Math.max(top - 1, 0));
      } else {
        setMode('browse');
      }
      return;
    }

    if (input === '?' && mode === 'browse') {
      setHelpTop(0);
      setMode('help');
      return;
    }

    // Settings open from every screen: `,` for the screen in view (its
    // columns), shift+`,` for the whole dashboard
    if (
      (input === ',' || input === '<') &&
      (mode === 'browse' || mode === 'settings')
    ) {
      setSettingsKind(input === '<' ? 'global' : 'columns');
      setSettingIndex(0);
      setMode('settings');
      return;
    }

    if (mode === 'settings') {
      if (key.downArrow || input === 'j') {
        setSettingIndex((index) =>
          Math.min(index + 1, settingItems.length - 1)
        );
      } else if (key.upArrow || input === 'k') {
        setSettingIndex((index) => Math.max(index - 1, 0));
      } else if (key.return || input === ' ') {
        settingItems[settingIndex]?.run();
        // Some lines read the saved file: draw again
        setRevision((count) => count + 1);
      } else {
        setMode('browse');
      }
      return;
    }

    if (mode === 'routine' && choosing) {
      const offered = choosing.source?.routines ?? [];
      if (key.downArrow || input === 'j') {
        setRoutineIndex((index) => Math.min(index + 1, offered.length - 1));
      } else if (key.upArrow || input === 'k') {
        setRoutineIndex((index) => Math.max(index - 1, 0));
      } else {
        if (key.return && offered[routineIndex]) {
          runInPane(choosing, offered[routineIndex]);
        }
        setChoosing(null);
        setMode('browse');
      }
      return;
    }

    if (viewing) {
      const last = Math.max(paneItems.length - 1, 0);
      const at = Math.min(paneSelected, last);
      const tabNames = [...new Set(panes.map((pane) => pane.tab))];
      if (
        tabOpen !== null &&
        (key.escape || key.backspace || key.leftArrow || input === 'h')
      ) {
        // Back from a tab's panes to the tabs, on that tab's line
        setPaneSelected(Math.max(tabNames.indexOf(tabOpen), 0));
        setTabOpen(null);
      } else if (key.escape || input === 'q' || input === 'p' || key.backspace) {
        setViewing(null);
        setMessage('');
      } else if (key.downArrow || input === 'j') {
        setPaneSelected(Math.min(at + 1, last));
      } else if (key.upArrow || input === 'k') {
        setPaneSelected(Math.max(at - 1, 0));
      } else if (input === 'o') {
        stepSort();
      } else if (input === 'O') {
        flipSort();
      } else if (input === 'f') {
        // Every pane at once, or back to the tabs
        setIsFlat(!isFlat);
        saveSettings({ panes: isFlat ? 'tabs' : 'flat' });
        setTabOpen(null);
        setPaneSelected(0);
      } else if (
        paneItems[at] &&
        !paneItems[at].pane &&
        (key.return || key.rightArrow || input === 'l')
      ) {
        // Into a tab: its panes
        setTabOpen(paneItems[at].tab);
        setPaneSelected(0);
      } else if (
        paneItems[at]?.pane &&
        (key.return || (input === 's' && !paneItems[at].pane!.routine))
      ) {
        // enter always offers the folder's routines; s does when the pane
        // names none
        chooseRoutine(paneItems[at].pane!);
      } else if (input === 's' && paneItems[at]) {
        startPanes(paneItems[at].members);
      } else if (input === 'S') {
        startPanes(panes);
      }
      return;
    }

    if (mode === 'confirm') {
      if (input === 'y' && pending) perform(pending);
      setPending(null);
      setMode('browse');
      return;
    }

    if (mode === 'ask') {
      const asked = pending ? routinesToStart(pending) : [];
      if (key.downArrow || input === 'j') {
        setAskIndex((index) => Math.min(index + 1, asked.length - 1));
        return;
      }
      if (key.upArrow || input === 'k') {
        setAskIndex((index) => Math.max(index - 1, 0));
        return;
      }
      if (input === ' ' && asked[askIndex]) {
        // Tick or untick the routine under the cursor
        const { key: at } = asked[askIndex];
        setAskOff((off) =>
          off.includes(at) ? off.filter((key) => key !== at) : [...off, at]
        );
        return;
      }
      if (input === 'a') {
        // Tick them all, or untick them all when they all are
        setAskProfile(askOff.length === 0 ? 'none' : 'all');
        setAskOff((off) => (off.length === 0 ? asked.map(({ key }) => key) : []));
        return;
      }
      if (pending && (input === 'p' || key.rightArrow || key.leftArrow)) {
        // The next profile (or the previous one): tick exactly its routines
        const names = profilesOf(pending);
        const step = key.leftArrow ? names.length - 1 : 1;
        const next =
          names[(Math.max(names.indexOf(askProfile), 0) + step) % names.length];
        setAskProfile(next);
        setAskOff(
          asked
            .filter(
              ({ profiles }) =>
                next === 'none' || (next !== 'all' && !profiles.includes(next))
            )
            .map(({ key }) => key)
        );
        return;
      }
      // enter or y starts the ticked routines, n opens without any, anything
      // else cancels
      if (pending && (key.return || input === 'y')) {
        perform(pending, askOff);
      } else if (pending && input === 'n') {
        perform(pending, null);
      }
      setPending(null);
      setMode('browse');
      return;
    }

    if (mode === 'pick') {
      if (key.escape || input === 'q' || input === 't') {
        setMode('browse');
      } else if (key.downArrow || input === 'j') {
        setPickIndex((index) => Math.min(index + 1, choices.length - 1));
      } else if (key.upArrow || input === 'k') {
        setPickIndex((index) => Math.max(index - 1, 0));
      } else if (key.return) {
        setScope(choices[pickIndex]?.scope ?? null);
        setSelected(0);
        setMode('browse');
      } else if (input === 'o') {
        // Open every closed project of the picked group or tag in one go
        const picked = choices[pickIndex]?.scope ?? null;
        const members = allRows.filter(
          (row) =>
            row.project &&
            (!picked ||
              (picked.kind === 'tag' ? row.tags : row.groups).includes(
                picked.value
              ))
        );
        const closed = members.filter((row) => !row.workspace && row.label);
        const what = picked ? `${picked.kind} ${picked.value}` : 'all projects';

        setScope(picked);
        setSelected(0);
        setMode('browse');

        if (closed.length === 0) {
          setMessage(`${what}: nothing to open, all ${members.length} are open`);
        } else {
          const action: Action = {
            kind: 'open',
            title: `Open ${what}`,
            rows: closed,
            isDestructive: false,
          };
          if (routinesToStart(action).length > 0) {
            setPending(action);
            setAskIndex(0);
            setAskOff([]);
            setAskProfile('all');
            setMode('ask');
          } else {
            perform(action);
          }
        }
      }
      return;
    }

    if (mode === 'filter') {
      if (key.escape) {
        setFilter('');
        setMode('browse');
      } else if (key.return) {
        setMode('browse');
      } else if (key.backspace || key.delete) {
        setFilter((text) => text.slice(0, -1));
      } else if (input && !key.ctrl && !key.meta) {
        setFilter((text) => text + input);
        setSelected(0);
      }
      return;
    }

    if (input === 'q' || (key.ctrl && input === 'c')) {
      exit();
    } else if (key.downArrow || input === 'j') {
      setSelected(Math.min(cursor + 1, rows.length - 1));
    } else if (key.upArrow || input === 'k') {
      setSelected(Math.max(cursor - 1, 0));
    } else if (input === 'g') {
      setSelected(0);
    } else if (input === 'G') {
      setSelected(rows.length - 1);
    } else if (input === '/') {
      setMode('filter');
    } else if (input === 'a') {
      setIsLiveOnly((value) => !value);
      setSelected(0);
    } else if (input === ' ' && current) {
      setMarked((keys) =>
        keys.includes(current.key)
          ? keys.filter((key) => key !== current.key)
          : [...keys, current.key]
      );
      setSelected(Math.min(cursor + 1, rows.length - 1));
    } else if (input === 'p' && current) {
      if (current.workspace) {
        showPanes(current);
      } else {
        setMessage(`${current.name} is closed: it has no panes yet`);
      }
    } else if (input === 'R') {
      // Leave, then start again from the code on disk
      isRestartRequested = true;
      exit();
    } else if (input === 'i' && current) {
      setInforming(current);
      setMode('info');
    } else if (input === 'o') {
      stepSort();
    } else if (input === 'O') {
      flipSort();
    } else if (input === 'A') {
      // Mark every row in view, or clear the marks when they all are
      const inView = rows.map((row) => row.key);
      setMarked((keys) =>
        inView.every((key) => keys.includes(key)) ? [] : inView
      );
    } else if (input === 'T') {
      setMessage(`theme: ${cycleTheme()}`);
    } else if (input === 'v') {
      // The file may have been edited since: read the views again
      const saved = readSettings().views ?? {};
      setViews(saved);
      setViewIndex(
        Math.max(viewName ? Object.keys(saved).indexOf(viewName) + 1 : 0, 0)
      );
      setIsDeletingView(false);
      setMode('view');
    } else if (input === '0') {
      // Straight back to every project
      setViewName(null);
      setSelected(0);
      setMessage('view: all');
    } else if ((input === '[' || input === ']') && viewNames.length > 0) {
      // Step through: all, then each saved view
      const order: (string | null)[] = [null, ...viewNames];
      const at = order.indexOf(activeView ? viewName : null);
      const next =
        order[(at + (input === ']' ? 1 : order.length - 1)) % order.length];
      setViewName(next);
      setSelected(0);
      setMessage(`view: ${next ?? 'all'}`);
    } else if (input === 't') {
      setPickIndex(0);
      setMode('pick');
    } else if (key.escape) {
      setFilter('');
      setMarked([]);
      setScope(null);
    } else if (input === 'r') {
      setViews(readSettings().views ?? {});
      rescan().then(() => setMessage('rescanned'));
    } else if (key.return) {
      press(button);
    } else if (/^[1-3]$/.test(input)) {
      press(Number(input) - 1);
    } else if (key.tab || key.rightArrow || input === 'l') {
      const step = key.tab && key.shift ? BUTTONS.length - 1 : 1;
      setButton((index) => (index + step) % BUTTONS.length);
    } else if (key.leftArrow || input === 'h') {
      setButton((index) => (index + BUTTONS.length - 1) % BUTTONS.length);
    }
  });

  // Layout: an empty line, 5 header lines, the frame's top, the column titles, the rows, the
  // frame's bottom, a blank line, the button bar, one footer line. The terminal's last line is left alone:
  // a tree as tall as the terminal makes Ink clear and repaint the whole
  // screen on every refresh, which flickers.
  const width = size.columns;
  const inner = width - 2;
  const bodyRows = Math.max(size.rows - 13, 1);
  // The list on screen is the projects, or one project's panes
  const paneCursor = Math.min(
    paneSelected,
    Math.max(paneItems.length - 1, 0)
  );
  const listCursor = viewing ? paneCursor : cursor;
  const listLength = viewing ? paneItems.length : rows.length;
  const first = Math.min(
    Math.max(listCursor - Math.floor(bodyRows / 2), 0),
    Math.max(listLength - bodyRows, 0)
  );
  const live = allRows.filter((row) => row.workspace && row.project).length;
  const strays = allRows.filter(
    (row) => row.workspace && !row.project
  ).length;

  // The other machines and whether each answers, for the header
  const machineNote = [...new Set(remoteRows.map((row) => row.machine))]
    .map((label) => {
      const isUp = remoteRows.some(
        (row) => row.machine === label && row.remote?.isReachable
      );
      return ` · ${label} ${isUp ? 'online' : 'offline'}`;
    })
    .join('');

  const info: [string, string][] = [
    ['Root', root],
    [
      'Herdr',
      herdr.isRunning
        ? `running, ${herdr.workspaces.length} workspace${
            herdr.workspaces.length === 1 ? '' : 's'
          }${machineNote}`
        : `not running${machineNote}`,
    ],
    ['Projects', `${projects.length} (${live} open, ${strays} stray)`],
    // The view in force is always named: `all` is the one that is always there
    [
      'View',
      activeView ? `${viewName} (${describeView(activeView)})` : 'all',
    ],
  ];

  // One empty line first, so the header does not touch the pane's top edge
  const screen: Segment[][] = [[]];

  // Header
  const infoWidth = Math.min(54, Math.max(width - 44, 20));
  for (let index = 0; index < 4; index++) {
    const [name, value] = info[index];
    const segments: Segment[] = [
      { text: ' ' + (name + ':').padEnd(12), color: theme.label },
      {
        text: fit(value, infoWidth - 13),
        color:
          name === 'Herdr' && !herdr.isRunning
            ? theme.danger
            : name === 'View' && activeView
              ? theme.marked
              : theme.text,
        bold: true,
      },
    ];
    // Four lines of hints, in as many columns as the width leaves room for;
    // the rest are a `?` away
    const hintColumns = Math.max(
      Math.floor((width - infoWidth - 1) / HINT_WIDTH),
      1
    );
    // The pane view has keys of its own: the header shows those instead
    const hints: [string, string][] = viewing
      ? [
          ['<?>', 'All keys'],
          ['<enter>', tabOpen === null && !isFlat ? 'Its panes' : 'Routine'],
          ['<f>', isFlat ? 'By tab' : 'All panes'],
          ['<esc>', 'Back'],
          ['<s>', 'Start'],
          ['<S>', 'Start all'],
          ['<o>', 'Sort'],
          ['<,>', 'Columns'],
          ['<p>', 'Projects'],
          ['<click>', 'Sort/select'],
          ['<shift+,>', 'Settings'],
        ]
      : KEYS;
    for (const [key, what] of hints.slice(0, hintColumns * 4).filter(
      (_, at) => at % 4 === index
    )) {
      segments.push({
        text: '  ' + key.padEnd(KEY_WIDTH - 2),
        color: theme.key,
        bold: true,
      });
      segments.push({ text: what.padEnd(12), color: theme.dim });
    }
    screen.push(segments);
  }
  screen.push([]);

  // Table
  const view = [
    activeView ? viewName! : 'all',
    isLiveOnly ? 'open' : '',
    scope ? `${scope.kind}:${scope.value}` : '',
    filter ? '/' + filter : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const title = viewing
    ? ` ${viewing.name}${
        isFlat
          ? ` panes[${panes.length}]`
          : tabOpen !== null
            ? ` › ${tabOpen} panes[${paneItems.length}]`
            : ` tabs[${paneItems.length}]`
      }${isDryRun ? ' DRY RUN' : ''} `
    : ` projects(${view})[${rows.length}]${
        marked.length > 0 ? ` ${marked.length} marked` : ''
      }${isDryRun ? ' DRY RUN' : ''} `;
  const dashes = Math.max(inner - title.length, 0);
  screen.push([
    { text: '┌' + '─'.repeat(Math.floor(dashes / 2)), color: theme.accent },
    { text: title, color: theme.title, bold: true },
    { text: '─'.repeat(Math.ceil(dashes / 2)) + '┐', color: theme.accent },
  ]);
  screen.push([
    { text: '│', color: theme.accent },
    {
      text: viewing
        ? paneLine(screenNow as 'tabs', null, inner, hiddenHere, sort[screenNow])
        : line(
            columns.map(
              (column) => column.title + sortMark(sort.projects, column.title)
            ),
            hiddenHere.includes('TAGS')
              ? ''
              : 'TAGS' + sortMark(sort.projects, 'TAGS'),
            inner,
            columns
          ),
      color: theme.text,
      bold: true,
    },
    { text: '│', color: theme.accent },
  ]);

  // Dialog laid over the middle of the table
  const dialog: Segment[] = [];
  if (mode === 'ask' && pending) {
    const routines = routinesToStart(pending);
    const ticked = routines.filter(({ key }) => !askOff.includes(key)).length;
    const room = Math.max(bodyRows - 7, 1);
    const top = Math.min(
      Math.max(askIndex - Math.floor(room / 2), 0),
      Math.max(routines.length - room, 0)
    );
    dialog.push({
      text: ` Start the routines too? (${ticked} of ${routines.length})`,
      color: theme.label,
      bold: true,
    });
    // The profiles, when the routines name any: the one the ticks come from
    // is marked, until a tick is changed by hand
    const profileNames = profilesOf(pending);
    if (profileNames.length > 2) {
      const expected = routines
        .filter(
          ({ profiles }) =>
            askProfile === 'none' ||
            (askProfile !== 'all' && !profiles.includes(askProfile))
        )
        .map(({ key }) => key);
      const isExact =
        expected.length === askOff.length &&
        expected.every((key) => askOff.includes(key));
      dialog.push({
        text:
          ' Profile: ' +
          profileNames
            .map((name) =>
              name === askProfile && isExact ? `[${name}]` : ` ${name} `
            )
            .join(' '),
        color: theme.title,
      });
    }
    dialog.push({ text: '' });
    routines.slice(top, top + room).forEach(({ key, text }, index) => {
      const isAt = top + index === askIndex;
      const isOn = !askOff.includes(key);
      dialog.push({
        text: ` ${isOn ? '[x]' : '[ ]'} ${text} `,
        color: isAt
          ? theme.selectionText
          : isOn
            ? theme.dialogText
            : theme.dim,
        background: isAt ? theme.accent : undefined,
      });
    });
    dialog.push({ text: '' });
    dialog.push({
      text: ' space tick · p profile · a all · enter start · n open only · esc cancel',
      color: theme.dim,
    });
  } else if (mode === 'confirm' && pending) {
    dialog.push({
      text: ` Close ${pending.rows.length} workspace${
        pending.rows.length > 1 ? 's' : ''
      }?`,
      color: theme.danger,
      bold: true,
    });
    dialog.push({ text: '' });
    for (const row of pending.rows.slice(0, 10)) {
      dialog.push({
        text: ` ${row.name} (${row.workspace?.pane_count} panes)`,
        color: theme.dialogText,
      });
    }
    if (pending.rows.length > 10) {
      dialog.push({
        text: ` +${pending.rows.length - 10} more`,
        color: theme.dim,
      });
    }
    dialog.push({ text: '' });
    dialog.push({ text: ' y close them · any other key cancels', color: theme.dim });
  } else if (mode === 'view') {
    const lines = [
      {
        name: null as string | null,
        text: 'all',
        detail: 'every project (always there)',
      },
      ...viewNames.map((name) => ({
        name: name as string | null,
        text: name,
        detail: describeView(views[name]),
      })),
    ];
    dialog.push({ text: ' Views', color: theme.label, bold: true });
    dialog.push({
      text: ` read from ${settingsPath().replace(Deno.env.get('HOME') ?? '', '~')}`,
      color: theme.dim,
    });
    dialog.push({ text: '' });
    lines.forEach((line, index) => {
      const isPicked = index === viewIndex;
      const count =
        line.name === null
          ? allRows.filter((row) => row.project).length
          : allRows.filter((row) => isInView(row, views[line.name!])).length;
      dialog.push({
        text: ` ${line.text.padEnd(14)} ${String(count).padStart(3)}  ${line.detail}`,
        color: isPicked ? theme.selectionText : theme.dialogText,
        background: isPicked ? theme.accent : undefined,
      });
    });
    dialog.push({ text: '' });
    dialog.push(
      isDeletingView
        ? {
            text: ` Delete view ${viewNames[viewIndex - 1]}? y deletes`,
            color: theme.danger,
            bold: true,
          }
        : {
            text:
              viewNames.length > 0
                ? ' enter apply · d delete · e edit the file · esc close'
                : ' no saved view yet · e opens the settings file',
            color: theme.dim,
          }
    );
  } else if (mode === 'info' && informing) {
    const list = (title: string, values: string[]) => {
      dialog.push({ text: ` ${title}`, color: theme.label, bold: true });
      if (values.length === 0) dialog.push({ text: '   none', color: theme.dim });
      for (const value of values) {
        dialog.push({ text: `   ${value}`, color: theme.dialogText });
      }
    };
    dialog.push({ text: ` ${informing.name}`, color: theme.title, bold: true });
    dialog.push({ text: '' });
    list('Tags', informing.tags);
    dialog.push({ text: '' });
    list('Groups', informing.groups);
    dialog.push({ text: '' });
    dialog.push({ text: ' any key closes', color: theme.dim });
  } else if (mode === 'help') {
    const lines: Segment[] = [
      ...KEYS.map(([key, what]) => ({
        text: ` ${key.padEnd(KEY_WIDTH)}${what}`,
        color: theme.dialogText,
      })),
      { text: '' },
      { text: ' In the pane view', color: theme.label, bold: true },
      ...PANE_KEYS.map(([key, what]) => ({
        text: ` ${key.padEnd(KEY_WIDTH)}${what}`,
        color: theme.dialogText,
      })),
    ];
    const room = Math.max(bodyRows - 6, 1);
    dialog.push({ text: ' Keys', color: theme.label, bold: true });
    dialog.push({ text: '' });
    dialog.push(...lines.slice(helpTop, helpTop + room));
    dialog.push({ text: '' });
    dialog.push({
      text:
        lines.length > room
          ? ' up/down scroll · any other key closes'
          : ' any key closes',
      color: theme.dim,
    });
  } else if (mode === 'settings') {
    const room = Math.max(bodyRows - 6, 1);
    const top = Math.min(
      Math.max(settingIndex - Math.floor(room / 2), 0),
      Math.max(settingItems.length - room, 0)
    );
    dialog.push({
      text:
        settingsKind === 'global'
          ? ' Settings'
          : ` Columns of ${
              { projects: 'the projects', tabs: 'the tabs', panes: "a tab's panes", flat: 'all panes' }[
                screenNow
              ]
            }`,
      color: theme.label,
      bold: true,
    });
    dialog.push({ text: '' });
    settingItems.slice(top, top + room).forEach((item, index) => {
      const isPicked = top + index === settingIndex;
      dialog.push({
        text: ` ${item.text}`,
        color: isPicked ? theme.selectionText : theme.dialogText,
        background: isPicked ? theme.accent : undefined,
      });
    });
    dialog.push({ text: '' });
    dialog.push({ text: ' enter change · esc close', color: theme.dim });
  } else if (mode === 'routine' && choosing) {
    const offered = choosing.source?.routines ?? [];
    const room = Math.max(bodyRows - 6, 1);
    const top = Math.min(
      Math.max(routineIndex - Math.floor(room / 2), 0),
      Math.max(offered.length - room, 0)
    );
    dialog.push({
      text: ` Run in ${choosing.name}`,
      color: theme.label,
      bold: true,
    });
    dialog.push({ text: '' });
    offered.slice(top, top + room).forEach((name, index) => {
      const isPicked = top + index === routineIndex;
      const isDefault = name === choosing.routine?.routine;
      dialog.push({
        text: ` ${name}${isDefault ? '  (default)' : ''}`,
        color: isPicked ? theme.selectionText : theme.dialogText,
        background: isPicked ? theme.accent : undefined,
      });
    });
    dialog.push({ text: '' });
    dialog.push({ text: ' enter run · esc cancel', color: theme.dim });
  } else if (mode === 'pick') {
    const room = Math.max(bodyRows - 6, 1);
    const top = Math.min(
      Math.max(pickIndex - Math.floor(room / 2), 0),
      Math.max(choices.length - room, 0)
    );
    dialog.push({ text: ' Show', color: theme.label, bold: true });
    dialog.push({ text: '' });
    choices.slice(top, top + room).forEach((choice, index) => {
      const isPicked = top + index === pickIndex;
      dialog.push({
        text: ` ${choice.text.padEnd(32)} ${String(choice.total).padStart(3)}`,
        color: isPicked
          ? theme.selectionText
          : choice.scope
            ? theme.dialogText
            : theme.title,
        background: isPicked ? theme.accent : undefined,
      });
    });
    dialog.push({ text: '' });
    dialog.push({
      text: ' enter show · o open them all · esc cancel',
      color: theme.dim,
    });
  }
  const dialogWidth = Math.min(
    mode === 'ask' ? 84 : mode === 'help' || mode === 'view' ? 64 : 44,
    inner - 4
  );
  const dialogTop = Math.max(Math.floor((bodyRows - dialog.length - 2) / 2), 0);
  const dialogLeft = Math.floor((inner - dialogWidth) / 2);

  for (let index = 0; index < bodyRows; index++) {
    const row: Row | undefined = viewing ? undefined : rows[first + index];
    const item = viewing ? paneItems[first + index] : undefined;
    const pane = item?.pane ?? undefined;
    const isSelected = (!!row || !!item) && first + index === listCursor;
    const isMarked = !!row && marked.includes(row.key);
    let text = ' '.repeat(inner);
    if (item) {
      text = paneLine(
        pane ? (isFlat ? 'flat' : 'panes') : 'tabs',
        paneCells(item),
        inner,
        hiddenHere
      );
    }
    if (row) {
      text = line(
        columns.map((column) => column.cell(row)),
        hiddenHere.includes('TAGS')
          ? ''
          : fitTags(row.tags, inner - tagsAt - TAGS_MARGIN).text,
        inner,
        columns
      );
      if (isMarked) text = '●' + text.slice(1);
    }
    const style: Segment = {
      text,
      color: isSelected
        ? theme.selectionText
        : isMarked
          ? theme.marked
          : item && !pane
            ? theme.label
            : pane
              ? pane.running
                ? theme.open
                : pane.routine
                  ? theme.text
                  : theme.dim
              : row && colorOf(row, theme),
      background: isSelected ? theme.accent : undefined,
      bold: isMarked || (!!item && !pane),
    };

    const content: Segment[] = [style];

    const at = index - dialogTop;
    const hasDialog = dialog.length > 0 && at >= 0 && at < dialog.length + 2;
    if (!hasDialog) {
      screen.push([
        { text: '│', color: theme.accent },
        ...content,
        { text: '│', color: theme.accent },
      ]);
      continue;
    }

    const shownLine = dialog[at - 1];
    screen.push([
      { text: '│', color: theme.accent },
      ...cut(content, 0, dialogLeft),
      {
        text: fit(shownLine?.text ?? '', dialogWidth),
        color: shownLine?.color ?? theme.dialogText,
        bold: shownLine?.bold,
        background: shownLine?.background ?? theme.dialogBackground,
      },
      ...cut(content, dialogLeft + dialogWidth, inner),
      { text: '│', color: theme.accent },
    ]);
  }

  screen.push([{ text: '└' + '─'.repeat(inner) + '┘', color: theme.accent }]);

  // Button bar
  const bar: Segment[] = [
    { text: targetLabel, color: theme.label, bold: true },
  ];
  BUTTONS.forEach(({ kind, label }, index) => {
    const isLit = actions.some((action) => action.kind === kind);
    const isFocused = index === button;
    bar.push({
      text: `  ${label}  `,
      color: isFocused
        ? theme.selectionText
        : isLit
          ? theme.buttonText
          : theme.dim,
      background: isFocused
        ? isLit
          ? theme.accent
          : theme.dim
        : isLit
          ? theme.buttonBackground
          : theme.buttonOffBackground,
      bold: isLit,
    });
    bar.push({ text: '  ' });
  });
  screen.push([]);
  screen.push(
    viewing
      ? [
          { text: ` ${viewing.name}  `, color: theme.label, bold: true },
          { text: '<enter> ', color: theme.key, bold: true },
          {
            text:
              tabOpen === null && !isFlat ? 'Its panes   ' : 'Choose routine   ',
            color: theme.dim,
          },
          { text: '<s> ', color: theme.key, bold: true },
          {
            text:
              tabOpen === null && !isFlat
                ? 'Start tab   '
                : 'Start default   ',
            color: theme.dim,
          },
          { text: '<S> ', color: theme.key, bold: true },
          { text: 'Start all   ', color: theme.dim },
          { text: '<f> ', color: theme.key, bold: true },
          { text: isFlat ? 'By tab   ' : 'All panes   ', color: theme.dim },
          { text: '<o> ', color: theme.key, bold: true },
          { text: 'Sort   ', color: theme.dim },
          { text: '<,> ', color: theme.key, bold: true },
          { text: 'Columns   ', color: theme.dim },
          { text: '<esc> ', color: theme.key, bold: true },
          { text: 'Back', color: theme.dim },
        ]
      : bar
  );

  // Footer
  if (mode === 'filter') {
    screen.push([
      { text: ' /' + filter, color: theme.title },
      { text: ' ', background: theme.accent },
    ]);
  } else if (busy) {
    screen.push([{ text: ' ' + busy, color: theme.label }]);
  } else {
    screen.push([{ text: ' ' + message, color: theme.dim }]);
  }

  return (
    <Box flexDirection="column" width={width} height={size.rows - 1}>
      {screen.map((segments, index) => {
        const used = segments.reduce((sum, { text }) => sum + text.length, 0);
        return (
          <Text key={index} color={theme.text}
            backgroundColor={theme.background} wrap="truncate">
            {segments.map((segment, at) => (
              <Text
                key={at}
                color={segment.color}
                backgroundColor={segment.background}
                bold={segment.bold}
              >
                {segment.text}
              </Text>
            ))}
            {/* The filler is given a colour so it is never plain text: Ink drops
                plain spaces at the end of a line, and on a theme with no
                background that would leave the previous frame showing */}
            <Text color={theme.dim}>
              {' '.repeat(Math.max(width - used, 0))}
            </Text>
          </Text>
        );
      })}
    </Box>
  );
}

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function projects(program: any) {
  program
    .command('projects')
    .description('dashboard over every project and its herdr workspace')
    .option(
      '--root <path>',
      'folder holding the projects (default: $RUN_PROJECT, else the current folder)'
    )
    .option('--list', 'print the table once instead of opening the dashboard')
    .option(
      '--json',
      'print everything the dashboard knows as JSON, for scripts and agents'
    )
    .option('--panes', 'with --json: add what each pane of the open projects runs')
    .option('--dry-run', 'show what each action would do without doing it')
    .option(
      '--theme <name>',
      `colours: ${Object.keys(THEMES).join(', ')} (default: the last one chosen)`
    )
    .option(
      '--view <name>',
      'start in a saved view (default: startView in the settings file)'
    )
    .action(
      async (options: {
        root?: string;
        list?: boolean;
        dryRun?: boolean;
        theme?: string;
        view?: string;
        json?: boolean;
        panes?: boolean;
      }) => {
        const root = options.root ?? Deno.env.get('RUN_PROJECT') ?? Deno.cwd();

        if (options.list || options.json || !Deno.stdin.isTerminal()) {
          const [found, herdr] = await Promise.all([
            discoverProjects(root),
            readHerdrState(),
          ]);
          const saved = readSettings();
          const name = options.view ?? saved.startView;
          const view = name ? saved.views?.[name] : undefined;
          if (options.view && !view) {
            console.error(
              `no view named '${options.view}' in ${settingsPath()}`
            );
            Deno.exit(1);
          }
          const listed = [
            ...buildRows(found, herdr),
            ...(await readAllMachineRows()),
          ].filter((row) => !view || isInView(row, view));

          if (options.json) {
            // One object per line of the table, with what the table has no
            // room for: the path, the apps, the routines and the tabs
            const projects = await Promise.all(
              listed.map(async (row) => ({
                name: row.name,
                machine: row.machine,
                status: statusOf(row),
                label: row.label,
                path: row.path || null,
                folder: row.project ? row.folder : null,
                org: row.project?.org || null,
                repo: row.project?.repo || null,
                branch: row.branch || null,
                changes: row.changes || null,
                tags: row.tags,
                groups: row.groups,
                apps: row.project?.apps ?? [],
                routines: row.project?.routines ?? [],
                tabs: row.project?.tabs ?? [],
                workspace: row.workspace
                  ? {
                      id: row.workspace.workspace_id,
                      label: row.workspace.label,
                      tabs: row.workspace.tab_count,
                      panes: row.workspace.pane_count,
                      agents: row.workspace.agents,
                    }
                  : null,
                ...(options.panes && row.workspace && !row.remote
                  ? {
                      panes: await readPanes(
                        row.workspace.workspace_id,
                        row.project?.routines ?? [],
                        row.project?.tabs ?? []
                      ),
                    }
                  : {}),
              }))
            );
            console.log(
              JSON.stringify(
                {
                  root,
                  herdr: { isRunning: herdr.isRunning },
                  view: view ? name : 'all',
                  views: saved.views ?? {},
                  projects,
                },
                null,
                2
              )
            );
            return;
          }

          printPlain(root, listed, herdr);
          return;
        }

        const encoder = new TextEncoder();
        // Alternate screen, so the dashboard leaves the terminal as it found
        // it, plus mouse clicks and wheel turns reported as SGR sequences
        Deno.stdout.writeSync(
          encoder.encode('\x1b[?1049h\x1b[H\x1b[?1000h\x1b[?1006h')
        );
        const wanted = options.theme ?? readSettings().theme ?? DEFAULT_THEME;
        const themeName = wanted in THEMES ? wanted : DEFAULT_THEME;
        paintBackground(THEMES[themeName]);

        const settings = readSettings();
        const wantedView = options.view ?? settings.startView ?? null;
        const startView =
          wantedView && settings.views?.[wantedView] ? wantedView : null;

        // Ink redraws by erasing every line and writing the frame again, and
        // a terminal that paints between the two shows a blank flash. Every
        // line here is as wide as the screen, so the frame can simply be
        // written over the previous one: the erasing is taken out. The frame
        // is also marked as one synchronized update for terminals that
        // support it.
        const write = process.stdout.write.bind(process.stdout);
        process.stdout.write = ((chunk: any, ...rest: any[]) =>
          write(
            typeof chunk === 'string'
              ? `\x1b[?2026h${chunk.replaceAll('\x1b[2K', '')}\x1b[?2026l`
              : chunk,
            ...rest
          )) as typeof process.stdout.write;

        try {
          const app = render(
            <Dashboard
              root={root}
              isDryRun={options.dryRun ?? false}
              initialTheme={themeName}
              initialView={startView}
            />,
            { exitOnCtrlC: false }
          );
          await app.waitUntilExit();
        } finally {
          process.stdout.write = write;
          Deno.stdout.writeSync(
            encoder.encode('\x1b[?1006l\x1b[?1000l\x1b[?1049l')
          );
        }

        // A restart runs the command again in a child, so code edited since
        // this process started is picked up. This process only waits for it.
        if (isRestartRequested) {
          const entry = new URL('../bin/cmd.ts', import.meta.url).href;
          const child = new Deno.Command(Deno.execPath(), {
            args: ['run', '-A', entry, ...Deno.args],
            stdin: 'inherit',
            stdout: 'inherit',
            stderr: 'inherit',
          }).spawn();
          Deno.exit((await child.status).code);
        }
      }
    );
}

////////////////////////////////////////////////////////////////////////////////
// EXPORT COMMAND FUNCTION
////////////////////////////////////////////////////////////////////////////////

export { projects as commandProjects };

////////////////////////////////////////////////////////////////////////////////
// THE END
////////////////////////////////////////////////////////////////////////////////
