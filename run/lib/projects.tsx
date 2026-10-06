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
  /** Names of the `type: "app"` folders below it */
  apps: string[];
  /** The `tags` of its meta.json */
  tags: string[];
  /** The `groups` of its meta.json: sets of projects worked on together */
  groups: string[];
  /** Checked-out git branch; see readBranch for the other values */
  branch: string;
  /** Uncommitted files and unpushed commits; see readChanges */
  changes: string;
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
  folder: string;
  label: string | null;
  path: string;
  apps: number;
  tags: string[];
  groups: string[];
  branch: string;
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
      apps: [],
      tags: Array.isArray(meta.tags) ? meta.tags : [],
      groups: Array.isArray(meta.groups) ? meta.groups : [],
      branch: '',
      changes: '',
    }));

  await Promise.all(
    projects.map(async (project) => {
      project.branch = await readBranch(project.path);
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

  return projects.sort(
    (a, b) => a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name)
  );
}

////////////////////////////////////////////////////////////////////////////////
// GIT
////////////////////////////////////////////////////////////////////////////////

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
  // The repository may start above the project's folder
  let folder = path;
  let gitDir = '';
  while (!gitDir) {
    try {
      const dotGit = join(folder, '.git');
      const info = await Deno.stat(dotGit);
      // A worktree or submodule has a .git file pointing at the real folder
      gitDir = info.isDirectory
        ? dotGit
        : join(
            folder,
            (await Deno.readTextFile(dotGit)).replace('gitdir:', '').trim()
          );
    } catch {
      const parent = dirname(folder);
      if (parent === folder) return 'no git';
      folder = parent;
    }
  }

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
): Promise<{ isOk: boolean; output: string }> {
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
    const output = (decoder.decode(stdout) + decoder.decode(stderr)).trim();
    return { isOk: success, output };
  } catch (error) {
    return { isOk: false, output: String(error) };
  }
}

/**
 * Read the state of the herdr server
 *
 * @returns Whether the server answers, and its open workspaces
 */
export async function readHerdrState(): Promise<HerdrState> {
  const { isOk, output } = await capture('herdr', ['workspace', 'list']);

  if (!isOk) {
    return { isRunning: false, workspaces: [] };
  }

  try {
    return {
      isRunning: true,
      workspaces: JSON.parse(output).result?.workspaces ?? [],
    };
  } catch {
    return { isRunning: false, workspaces: [] };
  }
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
// ROWS
////////////////////////////////////////////////////////////////////////////////

function buildRows(projects: Project[], herdr: HerdrState): Row[] {
  const rows: Row[] = projects.map((project) => ({
    key: project.path,
    name: project.name,
    folder: project.folder,
    label: project.label,
    path: project.path,
    apps: project.apps.length,
    tags: project.tags,
    groups: project.groups,
    branch: project.branch,
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
        folder: '-',
        label: workspace.label,
        path: '',
        apps: 0,
        tags: [],
        groups: [],
        branch: '',
        changes: '',
        project: null,
        workspace,
      });
    }
  }

  return rows;
}

function statusOf(row: Row): string {
  if (row.workspace && !row.project) return 'stray';
  if (row.workspace?.workspace_id === Deno.env.get('HERDR_WORKSPACE_ID')) {
    return 'here';
  }
  if (row.workspace) return row.workspace.focused ? 'focused' : 'open';
  if (!row.label) return 'no herdr';
  return 'closed';
}

function colorOf(row: Row, theme: Theme): string | undefined {
  const status = statusOf(row);
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
    { title: 'FOLDER', width: 12, cell: (row) => row.folder },
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
      title: 'AGENT',
      width: 9,
      cell: (row) => row.workspace?.agent_status ?? '-',
    },
    { title: 'APPS', width: 6, cell: (row) => String(row.apps || '-') },
    { title: 'GROUPS', width: 18, cell: (row) => row.groups.join(',') || '-' },
  ];

function line(cells: string[], pathCell: string, width: number): string {
  const fixed = cells
    .map((cell, index) =>
      cell.slice(0, COLUMNS[index].width - 1).padEnd(COLUMNS[index].width)
    )
    .join('');
  return (' ' + fixed + pathCell).slice(0, width).padEnd(width);
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

function readSavedTheme(): string | undefined {
  try {
    return JSON.parse(Deno.readTextFileSync(settingsPath())).theme;
  } catch {
    return undefined;
  }
}

function saveTheme(theme: string) {
  try {
    Deno.mkdirSync(dirname(settingsPath()), { recursive: true });
    Deno.writeTextFileSync(
      settingsPath(),
      JSON.stringify({ theme }, null, 2) + '\n'
    );
  } catch {
    // The theme still applies for this run
  }
}

/** Screen line of the column titles, counted from 1; the rows start below it */
const TABLE_TOP = 7;

/**
 * The button bar under the table, in order. A button is lit when its action
 * applies to the targeted rows.
 */
const BUTTONS: { kind: ActionKind; label: string }[] = [
  { kind: 'open', label: 'Open' },
  { kind: 'start', label: 'Open in background' },
  { kind: 'stop', label: 'Close' },
  { kind: 'only', label: 'Close others' },
];

const KEYS: [string, string][] = [
  ['<enter>', 'Press'],
  ['<space>', 'Mark'],
  ['<a>', 'Open only'],
  ['<t>', 'Tag/group'],
  ['<T>', 'Theme'],
  ['</>', 'Filter'],
  ['<r>', 'Rescan'],
  ['<tab>', 'Button'],
  ['<click>', 'Select'],
  ['<1-4>', 'Button'],
  ['<esc>', 'Clear'],
  ['<q>', 'Quit'],
];

type Mode = 'browse' | 'filter' | 'confirm' | 'pick';

/**
 * A tag or a group the table is narrowed to
 */
interface Scope {
  kind: 'group' | 'tag';
  value: string;
}

type ActionKind = 'open' | 'start' | 'stop' | 'only';

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
  return !!OWN_WORKSPACE && row.workspace?.workspace_id === OWN_WORKSPACE;
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
  const stopped = targets.filter((row) => !row.workspace && row.label);
  const running = targets.filter((row) => row.workspace && !isOwn(row));
  const others = allRows.filter(
    (row) => row.workspace && !isOwn(row) && !targets.includes(row)
  );

  if (targets.length === 1 && (targets[0].workspace || targets[0].label)) {
    actions.push({
      kind: 'open',
      title: targets[0].workspace ? 'Open' : 'Start and open',
      rows: targets,
      isDestructive: false,
    });
  }
  if (stopped.length > 0) {
    actions.push({
      kind: 'start',
      title:
        targets.length === 1
          ? 'Start in the background'
          : `Start ${stopped.length} stopped`,
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

function Dashboard({
  root,
  isDryRun,
  initialTheme,
}: {
  root: string;
  isDryRun: boolean;
  initialTheme: string;
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
  const [pickIndex, setPickIndex] = useState(0);
  const [pending, setPending] = useState<Action | null>(null);
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
  const themeRef = useRef(initialTheme);
  const ticks = useRef(0);
  themeRef.current = themeName;
  const rescan = async () => setProjects(await discoverProjects(root));
  const refresh = async () => {
    ticks.current += 1;
    setHerdr(await readHerdrState());
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

  const allRows = useMemo(() => buildRows(projects, herdr), [projects, herdr]);

  const rows = useMemo(() => {
    const needle = filter.toLowerCase();
    return allRows.filter(
      (row) =>
        (!isLiveOnly || row.workspace) &&
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
  }, [allRows, filter, isLiveOnly, scope]);

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
      ? Promise.resolve({ isOk: true, output: '' })
      : capture('herdr', args);

  const startRow = async (row: Row): Promise<string | null> => {
    if (isDryRun) return null;
    const init = await runSelf(
      ['herdr', 'init', row.label!, '--all'],
      row.project!.path
    );
    return init.isOk ? null : lastLine(init.output);
  };

  const perform = async (action: Action) => {
    if (isBusy.current) return;
    isBusy.current = true;
    setMessage('');
    const prefix = isDryRun ? 'dry run: ' : '';
    const failures: string[] = [];

    try {
      if (action.kind === 'open' || action.kind === 'start') {
        for (const row of action.rows) {
          if (row.workspace) continue;
          setBusy(`opening ${row.name}...`);
          const failure = await startRow(row);
          if (failure) failures.push(`${row.name}: ${failure}`);
        }
      }

      if (action.kind === 'open' && failures.length === 0) {
        const row = action.rows[0];
        const { workspaces } = await readHerdrState();
        const workspace = workspaces.find((ws) => ws.label === row.label);
        if (workspace) {
          await herdrDo(['workspace', 'focus', workspace.workspace_id]);
        } else if (!isDryRun) {
          failures.push(`${row.name} did not come up in herdr`);
        }
      }

      if (action.kind === 'stop' || action.kind === 'only') {
        for (const row of action.rows) {
          // The dashboard's own workspace always stays
          if (!row.workspace || isOwn(row)) continue;
          setBusy(`closing ${row.name}...`);
          const close = await herdrDo([
            'workspace',
            'close',
            row.workspace.workspace_id,
          ]);
          if (!close.isOk) {
            failures.push(`${row.name}: ${lastLine(close.output)}`);
          }
        }
      }

      const verb =
        action.kind === 'open'
          ? 'opened'
          : action.kind === 'start'
            ? 'opened in the background'
            : 'closed';
      setMessage(
        failures.length > 0
          ? `failed: ${failures.join('; ')}`
          : `${prefix}${verb} ${names(action.rows)}`
      );
    } catch (error) {
      setMessage(String(error));
    }

    setMarked([]);
    await refresh();
    isBusy.current = false;
    setBusy('');
  };

  const targetLabel = ` ${
    markedRows.length > 0
      ? `${markedRows.length} marked`
      : (current?.name ?? 'nothing selected')
  }  `;

  const press = (index: number) => {
    setButton(index);
    if (targets.length === 0) return;
    const { kind, label } = BUTTONS[index];
    const action = actions.find((candidate) => candidate.kind === kind);
    if (!action) {
      setMessage(
        kind !== 'open' && targets.every(isOwn)
          ? 'this dashboard runs in that workspace, so it stays'
          : `${label} does not apply to ${names(targets)}`
      );
    } else if (action.isDestructive) {
      setPending(action);
      setMode('confirm');
    } else {
      perform(action);
    }
  };

  // A click or a wheel turn, as the terminal reports it: 1-based column and line
  const onMouse = (code: number, column: number, lineAt: number) => {
    if (code === 64 || code === 65) {
      const step = code === 64 ? -1 : 1;
      setSelected(Math.min(Math.max(cursor + step, 0), rows.length - 1));
      return;
    }
    if (code !== 0) return;

    const rowAt = first + lineAt - TABLE_TOP - 1;
    if (lineAt > TABLE_TOP && lineAt <= TABLE_TOP + bodyRows) {
      if (rowAt < rows.length) setSelected(rowAt);
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

  useInput((input, key) => {
    const mouse = input.match(/\[<(\d+);(\d+);(\d+)([Mm])/);
    if (mouse) {
      if (mouse[4] === 'M' && mode === 'browse') {
        onMouse(Number(mouse[1]), Number(mouse[2]), Number(mouse[3]));
      }
      return;
    }

    if (mode === 'confirm') {
      if (input === 'y' && pending) perform(pending);
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
    } else if (input === 'T') {
      const all = Object.keys(THEMES);
      const next = all[(all.indexOf(themeName) + 1) % all.length];
      paintBackground(THEMES[next]);
      setThemeName(next);
      saveTheme(next);
      setMessage(`theme: ${next}`);
    } else if (input === 't') {
      setPickIndex(0);
      setMode('pick');
    } else if (key.escape) {
      setFilter('');
      setMarked([]);
      setScope(null);
    } else if (input === 'r') {
      rescan().then(() => setMessage('rescanned'));
    } else if (key.return) {
      press(button);
    } else if (/^[1-4]$/.test(input)) {
      press(Number(input) - 1);
    } else if (key.tab || key.rightArrow || input === 'l') {
      const step = key.tab && key.shift ? BUTTONS.length - 1 : 1;
      setButton((index) => (index + step) % BUTTONS.length);
    } else if (key.leftArrow || input === 'h') {
      setButton((index) => (index + BUTTONS.length - 1) % BUTTONS.length);
    }
  });

  // Layout: 5 header lines, the frame's top, the column titles, the rows, the
  // frame's bottom, a blank line, the button bar, one footer line. The terminal's last line is left alone:
  // a tree as tall as the terminal makes Ink clear and repaint the whole
  // screen on every refresh, which flickers.
  const width = size.columns;
  const inner = width - 2;
  const bodyRows = Math.max(size.rows - 12, 1);
  const first = Math.min(
    Math.max(cursor - Math.floor(bodyRows / 2), 0),
    Math.max(rows.length - bodyRows, 0)
  );
  const live = allRows.filter((row) => row.workspace && row.project).length;
  const strays = allRows.filter(
    (row) => row.workspace && !row.project
  ).length;

  const info: [string, string][] = [
    ['Root', root],
    ['Herdr', herdr.isRunning ? 'running' : 'not running'],
    ['Workspaces', String(herdr.workspaces.length)],
    ['Projects', `${projects.length} (${live} open, ${strays} stray)`],
  ];

  const screen: Segment[][] = [];

  // Header
  const infoWidth = Math.min(54, Math.max(width - 44, 20));
  for (let index = 0; index < 4; index++) {
    const [name, value] = info[index];
    const segments: Segment[] = [
      { text: ' ' + (name + ':').padEnd(12), color: theme.label },
      {
        text: fit(value, infoWidth - 13),
        color: name === 'Herdr' && !herdr.isRunning ? theme.danger : theme.text,
        bold: true,
      },
    ];
    for (const [key, what] of KEYS.filter((_, at) => at % 4 === index)) {
      segments.push({ text: '  ' + key.padEnd(8), color: theme.key, bold: true });
      segments.push({ text: what.padEnd(10), color: theme.dim });
    }
    screen.push(segments);
  }
  screen.push([]);

  // Table
  const view = [
    isLiveOnly ? 'open' : scope ? '' : 'all',
    scope ? `${scope.kind}:${scope.value}` : '',
    filter ? '/' + filter : '',
  ]
    .filter(Boolean)
    .join(' ');
  const title = ` projects(${view})[${rows.length}]${
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
      text: line(
        COLUMNS.map((column) => column.title),
        'TAGS',
        inner
      ),
      color: theme.text,
      bold: true,
    },
    { text: '│', color: theme.accent },
  ]);

  // Dialog laid over the middle of the table
  const dialog: Segment[] = [];
  if (mode === 'confirm' && pending) {
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
    dialog.push({ text: ' enter show · esc cancel', color: theme.dim });
  }
  const dialogWidth = Math.min(44, inner - 4);
  const dialogTop = Math.max(Math.floor((bodyRows - dialog.length - 2) / 2), 0);
  const dialogLeft = Math.floor((inner - dialogWidth) / 2);

  for (let index = 0; index < bodyRows; index++) {
    const row: Row | undefined = rows[first + index];
    const isSelected = !!row && first + index === cursor;
    const isMarked = !!row && marked.includes(row.key);
    let text = ' '.repeat(inner);
    if (row) {
      text = line(
        COLUMNS.map((column) => column.cell(row)),
        row.tags.join(' '),
        inner
      );
      if (isMarked) text = '●' + text.slice(1);
    }
    const style: Segment = {
      text,
      color: isSelected
        ? theme.selectionText
        : isMarked
          ? theme.marked
          : row && colorOf(row, theme),
      background: isSelected ? theme.accent : undefined,
      bold: isMarked,
    };

    const at = index - dialogTop;
    const hasDialog = dialog.length > 0 && at >= 0 && at < dialog.length + 2;
    if (!hasDialog) {
      screen.push([
        { text: '│', color: theme.accent },
        style,
        { text: '│', color: theme.accent },
      ]);
      continue;
    }

    const content = dialog[at - 1];
    screen.push([
      { text: '│', color: theme.accent },
      { ...style, text: text.slice(0, dialogLeft) },
      {
        text: fit(content?.text ?? '', dialogWidth),
        color: content?.color ?? theme.dialogText,
        bold: content?.bold,
        background: content?.background ?? theme.dialogBackground,
      },
      { ...style, text: text.slice(dialogLeft + dialogWidth) },
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
  screen.push(bar);

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
            {' '.repeat(Math.max(width - used, 0))}
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
    .option('--dry-run', 'show what each action would do without doing it')
    .option(
      '--theme <name>',
      `colours: ${Object.keys(THEMES).join(', ')} (default: the last one chosen)`
    )
    .action(
      async (options: {
        root?: string;
        list?: boolean;
        dryRun?: boolean;
        theme?: string;
      }) => {
        const root = options.root ?? Deno.env.get('RUN_PROJECT') ?? Deno.cwd();

        if (options.list || !Deno.stdin.isTerminal()) {
          const [found, herdr] = await Promise.all([
            discoverProjects(root),
            readHerdrState(),
          ]);
          printPlain(root, buildRows(found, herdr), herdr);
          return;
        }

        const encoder = new TextEncoder();
        // Alternate screen, so the dashboard leaves the terminal as it found
        // it, plus mouse clicks and wheel turns reported as SGR sequences
        Deno.stdout.writeSync(
          encoder.encode('\x1b[?1049h\x1b[H\x1b[?1000h\x1b[?1006h')
        );
        const wanted = options.theme ?? readSavedTheme() ?? DEFAULT_THEME;
        const themeName = wanted in THEMES ? wanted : DEFAULT_THEME;
        paintBackground(THEMES[themeName]);

        try {
          const app = render(
            <Dashboard
              root={root}
              isDryRun={options.dryRun ?? false}
              initialTheme={themeName}
            />,
            { exitOnCtrlC: false }
          );
          await app.waitUntilExit();
        } finally {
          Deno.stdout.writeSync(
            encoder.encode('\x1b[?1006l\x1b[?1000l\x1b[?1049l')
          );
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
