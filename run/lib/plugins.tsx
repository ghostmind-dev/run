/** @jsxImportSource npm:react@18.3.1 */
/**
 * @fileoverview Plugins control panel module for @ghostmind/run
 *
 * `run kit` (alias `run plugins`) is a full-screen terminal panel over what Claude Code loads
 * into a session: plugins, the skills and agents they carry, standalone
 * skills, and MCP servers. It answers three questions: what is there (search),
 * what does it cost and do (inspect), and what is on, everywhere or in one
 * project (activate).
 *
 * It writes only Claude Code's own settings:
 * - everywhere: `~/.claude/settings.json` (`enabledPlugins`, `skillOverrides`)
 * - in a project: `<project>/.claude/settings.local.json` (the same keys; it
 *   wins over the user file and is not committed), and the project's
 *   `disabledMcpServers` entry in `~/.claude.json`.
 *
 * A plugin's own skills cannot be turned off one by one: Claude Code reads a
 * plugin skill's `skillOverrides` entry from managed settings only (tried
 * 2026-10-22 on 2.1.309). They go with their plugin.
 *
 * A running session sees a change after `/reload-plugins` (MCP: `/mcp`).
 *
 * @module
 */

// @ts-types="npm:@types/react@18.3.12"
import React, { useEffect, useState } from 'npm:react@18.3.1';
import { Box, render, Text, useApp, useInput, useStdout } from 'npm:ink@5.2.1';
import { basename, dirname, join } from 'node:path';
import process from 'node:process';
import {
  DEFAULT_THEME,
  discoverProjects,
  fit,
  paintBackground,
  readSettings,
  type Segment,
  type Theme,
  THEMES,
} from './projects.tsx';

////////////////////////////////////////////////////////////////////////////////
// TYPE DEFINITIONS
////////////////////////////////////////////////////////////////////////////////

/** What a skill override may say; see Claude Code's `skillOverrides` */
const SKILL_MODES = ['on', 'name-only', 'user-invocable-only', 'off'] as const;
type SkillMode = (typeof SKILL_MODES)[number];

/** On, off, a skill mode, or `-` when the level has no say */
type State = SkillMode | '-';

/**
 * One thing Claude Code can load
 */
export interface Item {
  kind: 'plugin' | 'skill' | 'mcp' | 'agent';
  /** What the panel shows */
  name: string;
  /** The key settings use: plugin id, qualified skill name, server name */
  id: string;
  /** The plugin it comes with, by id */
  plugin?: string;
  /** `user`, `project`, `local`, `claude.ai` or the plugin id */
  source: string;
  description: string;
  version?: string;
  /** Its file or folder, or its URL for an MCP server */
  where?: string;
  /** Tokens it adds to every session while listed, estimated */
  tokens: number | null;
  everywhere: State;
  here: State;
  /** Whether its plugin is off where the panel looks, so it is off too */
  isHeld?: boolean;
}

interface Place {
  /** Absolute path of the project, or null for "everywhere only" */
  path: string | null;
  name: string;
}

////////////////////////////////////////////////////////////////////////////////
// READING
////////////////////////////////////////////////////////////////////////////////

const HOME = Deno.env.get('HOME') ?? '.';
const USER_SETTINGS = join(HOME, '.claude', 'settings.json');
const CLAUDE_JSON = join(HOME, '.claude.json');

function readJson(path: string): any {
  try {
    return JSON.parse(Deno.readTextFileSync(path)) ?? {};
  } catch {
    return {};
  }
}

/**
 * Write JSON through a temporary file, so a session reading it at the same
 * moment never sees half of it
 */
function writeJson(path: string, value: any) {
  Deno.mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.run-${Deno.pid}`;
  Deno.writeTextFileSync(temporary, JSON.stringify(value, null, 2) + '\n');
  Deno.renameSync(temporary, path);
}

function localSettingsOf(project: string): string {
  return join(project, '.claude', 'settings.local.json');
}

/**
 * The name and description of a SKILL.md or an agent's .md, from its
 * frontmatter. Handles inline, quoted and folded (`>`, `|`) values.
 */
export function readFrontmatter(text: string): Record<string, string> {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const fields: Record<string, string> = {};
  const lines = match[1].split(/\r?\n/);
  for (let at = 0; at < lines.length; at++) {
    const field = lines[at].match(/^([A-Za-z_-]+):\s*(.*)$/);
    if (!field) continue;
    let value = field[2].trim();
    if (/^[>|][-+]?$/.test(value) || value === '') {
      const block: string[] = [];
      while (at + 1 < lines.length && /^(\s+|$)/.test(lines[at + 1]) && lines[at + 1] !== '') {
        block.push(lines[++at].trim());
      }
      value = block.join(' ');
    }
    fields[field[1]] = value.replace(/^(["'])([\s\S]*)\1$/, '$2');
  }
  return fields;
}

/** Roughly four characters a token */
function estimate(text: string): number {
  return Math.ceil(text.length / 4) + 8;
}

function isFile(path: string): boolean {
  try {
    return Deno.statSync(path).isFile;
  } catch {
    return false;
  }
}

/**
 * The folders holding one SKILL.md each: those the plugin's manifest names
 * (a skill, or a folder of skills), else `skills/`, plus the plugin's root
 * when it is itself a skill
 */
function skillFolders(path: string, listed?: string | string[]): string[] {
  const named = listed ? [listed].flat() : ['skills'];
  const folders: string[] = isFile(join(path, 'SKILL.md')) ? [path] : [];
  for (const name of named) {
    const folder = join(path, name);
    if (isFile(join(folder, 'SKILL.md'))) {
      folders.push(folder);
      continue;
    }
    try {
      for (const entry of Deno.readDirSync(folder)) {
        if (isFile(join(folder, entry.name, 'SKILL.md'))) folders.push(join(folder, entry.name));
      }
    } catch {
      // No such folder
    }
  }
  return folders;
}

async function readSkills(
  folders: string[],
  plugin: string | undefined,
  source: string
): Promise<Item[]> {
  const items: Item[] = [];
  for (const folder of folders) {
    const file = join(folder, 'SKILL.md');
    const front = readFrontmatter(await Deno.readTextFile(file));
    const name = front.name || basename(folder);
    const description = front.description ?? '';
    // A skill only a person can call is not listed to the model
    const isHidden = front['disable-model-invocation'] === 'true';
    items.push({
      kind: 'skill',
      name,
      id: plugin ? `${plugin.split('@')[0]}:${name}` : name,
      plugin,
      source,
      description: (isHidden ? '[only by /name] ' : '') + description,
      where: file,
      tokens: isHidden ? 0 : estimate(name + description),
      everywhere: 'on',
      here: 'on',
    });
  }
  return items.sort((a, b) => a.name.localeCompare(b.name));
}

async function readAgents(folder: string, plugin: string | undefined, source: string): Promise<Item[]> {
  const items: Item[] = [];
  try {
    for await (const entry of Deno.readDir(folder)) {
      if (!entry.name.endsWith('.md')) continue;
      const file = join(folder, entry.name);
      const front = readFrontmatter(await Deno.readTextFile(file));
      const name = front.name || entry.name.replace(/\.md$/, '');
      items.push({
        kind: 'agent',
        name,
        id: plugin ? `${plugin.split('@')[0]}:${name}` : name,
        plugin,
        source,
        description: front.description ?? '',
        where: file,
        tokens: estimate(name + (front.description ?? '')),
        everywhere: plugin ? '-' : 'on',
        here: plugin ? '-' : 'on',
      });
    }
  } catch {
    // No such folder
  }
  return items;
}

function mcpItem(name: string, config: any, source: string, plugin?: string): Item {
  // Only the transport and where it points: headers and env can hold secrets
  const where = config?.url ?? [config?.command, ...(config?.args ?? [])].filter(Boolean).join(' ');
  return {
    kind: 'mcp',
    name,
    id: plugin ? `plugin:${plugin.split('@')[0]}:${name}` : name,
    plugin,
    source,
    description: `${config?.type ?? (config?.url ? 'http' : 'stdio')} server`,
    where,
    tokens: null,
    everywhere: '-',
    here: 'on',
  };
}

async function listPlugins(cwd: string): Promise<any[]> {
  try {
    const output = await new Deno.Command('claude', {
      args: ['plugin', 'list', '--json'],
      cwd,
      stdout: 'piped',
      stderr: 'null',
    }).output();
    return JSON.parse(new TextDecoder().decode(output.stdout));
  } catch {
    return [];
  }
}

/**
 * Everything Claude Code would load, with its state everywhere and in the
 * given project
 */
export async function readItems(place: Place): Promise<Item[]> {
  const user = readJson(USER_SETTINGS);
  const local = place.path ? readJson(localSettingsOf(place.path)) : {};
  const shared = place.path ? readJson(join(place.path, '.claude', 'settings.json')) : {};
  const claudeJson = readJson(CLAUDE_JSON);
  const projectEntry = place.path ? claudeJson.projects?.[place.path] ?? {} : {};
  const disabledMcp: string[] = projectEntry.disabledMcpServers ?? [];

  const pluginOn = (id: string, fallback: boolean) => {
    const everywhere = user.enabledPlugins?.[id] ?? fallback;
    const here = local.enabledPlugins?.[id] ?? shared.enabledPlugins?.[id] ?? everywhere;
    return { everywhere: !!everywhere, here: !!here };
  };
  const skillMode = (id: string) => {
    const everywhere: SkillMode = user.skillOverrides?.[id] ?? 'on';
    const here: SkillMode =
      local.skillOverrides?.[id] ?? shared.skillOverrides?.[id] ?? everywhere;
    return { everywhere, here };
  };

  const items: Item[] = [];
  for (const plugin of await listPlugins(place.path ?? HOME)) {
    const on = pluginOn(plugin.id, plugin.enabled);
    const path: string = plugin.installPath ?? '';
    const manifest = readJson(join(path, '.claude-plugin', 'plugin.json'));
    const children = [
      ...(await readSkills(skillFolders(path, manifest.skills), plugin.id, plugin.id)),
      ...(await readAgents(join(path, 'agents'), plugin.id, plugin.id)),
      ...Object.entries(plugin.mcpServers ?? {}).map(([name, config]) =>
        mcpItem(name, config, plugin.id, plugin.id)
      ),
    ];
    for (const child of children) {
      // Claude Code takes a plugin skill's override only from managed settings: it follows its plugin
      if (child.kind === 'skill') Object.assign(child, { everywhere: '-', here: '-' });
      if (child.kind === 'mcp') child.here = disabledMcp.includes(child.id) ? 'off' : 'on';
      child.isHeld = place.path ? !on.here : !on.everywhere;
    }
    const tokens = children
      .filter((child) => child.kind !== 'mcp' && child.here !== 'off')
      .reduce((sum, child) => sum + (child.tokens ?? 0), 0);
    items.push({
      kind: 'plugin',
      name: plugin.id.split('@')[0],
      id: plugin.id,
      source: plugin.id.split('@')[1] ?? '',
      description: manifest.description ?? '',
      version: plugin.version,
      where: path,
      tokens,
      everywhere: on.everywhere ? 'on' : 'off',
      here: on.here ? 'on' : 'off',
    });
    items.push(...children);
  }

  const looseSkills = [
    ...(await readSkills(skillFolders(join(HOME, '.claude', 'skills')), undefined, 'user')),
    ...(place.path ? await readSkills(skillFolders(join(place.path, '.claude', 'skills')), undefined, 'project') : []),
  ];
  for (const skill of looseSkills) Object.assign(skill, skillMode(skill.id));
  items.push(...looseSkills);

  items.push(
    ...(await readAgents(join(HOME, '.claude', 'agents'), undefined, 'user')),
    ...(place.path ? await readAgents(join(place.path, '.claude', 'agents'), undefined, 'project') : [])
  );

  const servers: [string, any, string][] = [
    ...Object.entries(claudeJson.mcpServers ?? {}).map(([n, c]) => [n, c, 'user'] as [string, any, string]),
    ...Object.entries(projectEntry.mcpServers ?? {}).map(([n, c]) => [n, c, 'local'] as [string, any, string]),
    ...(place.path
      ? Object.entries(readJson(join(place.path, '.mcp.json')).mcpServers ?? {}).map(
          ([n, c]) => [n, c, 'project'] as [string, any, string]
        )
      : []),
  ];
  // The claude.ai connectors this machine has connected to
  for (const name of claudeJson.claudeAiMcpEverConnected ?? []) {
    servers.push([name, { type: 'claude.ai connector' }, 'claude.ai']);
  }
  for (const [name, config, source] of servers) {
    const item = mcpItem(name, config, source);
    item.here = disabledMcp.includes(name) ? 'off' : 'on';
    items.push(item);
  }
  return items;
}

////////////////////////////////////////////////////////////////////////////////
// WRITING
////////////////////////////////////////////////////////////////////////////////

/**
 * Set an item's state everywhere (`level` `everywhere`) or in the project.
 * Setting a project to what everywhere says removes the project's own entry,
 * so the project follows everywhere again.
 */
export function setState(item: Item, level: 'everywhere' | 'here', state: SkillMode, place: Place) {
  if (level === 'here' && !place.path) throw new Error('No project chosen: press p');

  if (item.kind === 'mcp') {
    if (level === 'everywhere') throw new Error('An MCP server is turned off per project');
    const claudeJson = readJson(CLAUDE_JSON);
    const entry = (claudeJson.projects ??= {})[place.path!] ??= {};
    const disabled = new Set<string>(entry.disabledMcpServers ?? []);
    if (state === 'off') disabled.add(item.id);
    else disabled.delete(item.id);
    entry.disabledMcpServers = [...disabled];
    writeJson(CLAUDE_JSON, claudeJson);
    return;
  }
  if (item.kind === 'agent' || (item.kind === 'skill' && item.plugin)) {
    throw new Error(`${item.name} goes on and off with its plugin, ${item.plugin?.split('@')[0] ?? 'or by its file'}`);
  }

  const file = level === 'everywhere' ? USER_SETTINGS : localSettingsOf(place.path!);
  const settings = readJson(file);
  const user = level === 'here' ? readJson(USER_SETTINGS) : null;
  if (item.kind === 'plugin') {
    const on = state !== 'off';
    const inherited = user ? user.enabledPlugins?.[item.id] ?? true : null;
    settings.enabledPlugins ??= {};
    if (inherited === on) delete settings.enabledPlugins[item.id];
    else settings.enabledPlugins[item.id] = on;
    if (Object.keys(settings.enabledPlugins).length === 0) delete settings.enabledPlugins;
  } else {
    const inherited = user ? user.skillOverrides?.[item.id] ?? 'on' : 'on';
    settings.skillOverrides ??= {};
    if (state === inherited) delete settings.skillOverrides[item.id];
    else settings.skillOverrides[item.id] = state;
    if (Object.keys(settings.skillOverrides).length === 0) delete settings.skillOverrides;
  }
  writeJson(file, settings);
}

////////////////////////////////////////////////////////////////////////////////
// THE PANEL
////////////////////////////////////////////////////////////////////////////////

const KINDS = ['all', 'plugin', 'skill', 'mcp', 'agent'] as const;
type Kind = (typeof KINDS)[number];

const KEYS: [string, string][] = [
  ['<space>', 'On/off here'],
  ['<g>', 'On/off everywhere'],
  ['<m>', 'Skill mode here'],
  ['<M>', 'Mode everywhere'],
  ['</>', 'Search'],
  ['<tab>', 'Kind'],
  ['<enter>', 'Open plugin'],
  ['<p>', 'Project'],
  ['<o>', 'Sort by cost'],
  ['<r>', 'Rescan'],
  ['<esc>', 'Back/clear'],
  ['<q>', 'Quit'],
];

const SHORT: Record<string, string> = {
  on: 'on',
  off: 'off',
  'name-only': 'name',
  'user-invocable-only': 'user',
  '-': '·',
};

/**
 * The rows shown: plugins with the open one unfolded, or, while searching or
 * on one kind, every match flat
 */
export function visibleItems(items: Item[], kind: Kind, search: string, open: string | null, byCost: boolean): Item[] {
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (item: Item) =>
    words.every((word) =>
      `${item.name} ${item.id} ${item.description} ${item.source}`.toLowerCase().includes(word)
    );
  let rows: Item[];
  if (words.length || kind !== 'all') {
    rows = items.filter((item) => (kind === 'all' || item.kind === kind) && matches(item));
  } else {
    rows = items.filter((item) => !item.plugin || item.plugin === open);
  }
  if (byCost) {
    rows = [...rows].sort((a, b) => (b.tokens ?? -1) - (a.tokens ?? -1));
  }
  return rows;
}

function wrap(text: string, width: number, lines: number): string[] {
  const out: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/)) {
    if ((current + ' ' + word).trim().length > width) {
      out.push(current);
      current = word;
      if (out.length === lines) break;
    } else current = (current + ' ' + word).trim();
  }
  if (out.length < lines && current) out.push(current);
  return out.slice(0, lines);
}

function Panel({ initialTheme, initialPlace }: { initialTheme: string; initialPlace: Place }) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [size, setSize] = useState({ columns: stdout.columns, rows: stdout.rows });
  const [place, setPlace] = useState<Place>(initialPlace);
  const [items, setItems] = useState<Item[] | null>(null);
  const [selected, setSelected] = useState(0);
  const [kind, setKind] = useState<Kind>('all');
  const [search, setSearch] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [byCost, setByCost] = useState(false);
  const [message, setMessage] = useState('');
  const [projects, setProjects] = useState<Place[] | null>(null);
  const [pick, setPick] = useState(0);
  const theme: Theme = THEMES[initialTheme];

  const load = (where: Place = place) => readItems(where).then(setItems);
  useEffect(() => {
    load();
  }, [place]);
  useEffect(() => {
    const resize = () => setSize({ columns: stdout.columns, rows: stdout.rows });
    stdout.on('resize', resize);
    return () => {
      stdout.off('resize', resize);
    };
  }, []);

  const rows = items ? visibleItems(items, kind, search, open, byCost) : [];
  const current = rows[Math.min(selected, rows.length - 1)];

  const change = (level: 'everywhere' | 'here', next: (state: State) => SkillMode) => {
    if (!current) return;
    try {
      const state = level === 'here' ? current.here : current.everywhere;
      const to = next(state);
      setState(current, level, to, place);
      setMessage(`${current.name}: ${to} ${level === 'here' ? `in ${place.name}` : 'everywhere'}. /reload-plugins in open sessions`);
      load();
    } catch (error) {
      setMessage((error as Error).message);
    }
  };
  const toggle = (state: State): SkillMode => (state === 'off' ? 'on' : 'off');
  const cycle = (state: State): SkillMode =>
    SKILL_MODES[(SKILL_MODES.indexOf(state as SkillMode) + 1) % SKILL_MODES.length];

  useInput((input, key) => {
    if (projects) {
      if (key.escape) return setProjects(null);
      if (key.upArrow) return setPick((at) => Math.max(at - 1, 0));
      if (key.downArrow) return setPick((at) => Math.min(at + 1, projects.length - 1));
      if (key.return) {
        setPlace(projects[pick]);
        setProjects(null);
        setItems(null);
      }
      return;
    }
    if (isSearching) {
      if (key.return || key.escape) return setIsSearching(false);
      if (key.backspace || key.delete) return setSearch((text) => text.slice(0, -1));
      if (input && !key.ctrl && !key.meta) {
        setSearch((text) => text + input);
        setSelected(0);
      }
      return;
    }
    const page = Math.max(size.rows - 16, 1);
    if (input === 'q') return exit();
    if (key.upArrow || input === 'k') return setSelected((at) => Math.max(at - 1, 0));
    if (key.downArrow || input === 'j') return setSelected((at) => Math.min(at + 1, rows.length - 1));
    if (key.pageUp) return setSelected((at) => Math.max(at - page, 0));
    if (key.pageDown) return setSelected((at) => Math.min(at + page, rows.length - 1));
    if (input.startsWith('/')) {
      // Typed fast or pasted, the search can arrive with its slash
      setSearch(input.slice(1));
      setSelected(0);
      return setIsSearching(true);
    }
    if (key.tab) {
      setSelected(0);
      return setKind((now) => KINDS[(KINDS.indexOf(now) + (key.shift ? KINDS.length - 1 : 1)) % KINDS.length]);
    }
    if (key.escape) {
      if (search) return setSearch('');
      if (kind !== 'all') return setKind('all');
      if (open) return setOpen(null);
      return;
    }
    if (key.return || key.rightArrow) {
      if (current?.kind === 'plugin') {
        setOpen(open === current.id ? null : current.id);
      }
      return;
    }
    if (key.leftArrow && open) {
      setSelected(rows.findIndex((row) => row.id === open));
      return setOpen(null);
    }
    if (input === ' ') return change('here', toggle);
    if (input === 'g') return change('everywhere', toggle);
    if (input === 'm' && current?.kind === 'skill') return change('here', cycle);
    if (input === 'M' && current?.kind === 'skill') return change('everywhere', cycle);
    if (input === 'm' || input === 'M') return setMessage('A mode is for a skill: on, name only, only by /name, off');
    if (input === 'o') return setByCost((now) => !now);
    if (input === 'r') {
      setItems(null);
      return load();
    }
    if (input === 'p') {
      const root = Deno.env.get('RUN_PROJECT') ?? dirname(place.path ?? Deno.cwd());
      discoverProjects(root).then((found) => {
        const list: Place[] = [
          { path: null, name: 'everywhere only' },
          ...found.map((project) => ({ path: project.path, name: project.name })),
        ];
        setPick(Math.max(list.findIndex((one) => one.path === place.path), 0));
        setProjects(list);
      });
    }
  });

  const width = size.columns;
  const inner = width - 2;
  const screen: Segment[][] = [];

  // Header: what the panel looks at, and the keys
  const total = items?.filter((item) => item.kind === 'plugin' && item[place.path ? 'here' : 'everywhere'] === 'on')
    .reduce((sum, item) => sum + (item.tokens ?? 0), 0) ?? 0;
  const loose = items?.filter((item) => item.kind === 'skill' && !item.plugin && item.here !== 'off')
    .reduce((sum, item) => sum + (item.tokens ?? 0), 0) ?? 0;
  screen.push([
    { text: ' Project ', color: theme.label, bold: true },
    { text: place.name, color: theme.title, bold: true },
    { text: `   skills and agents listed: ~${(total + loose).toLocaleString()} tokens a session`, color: theme.dim },
  ]);
  const columns = Math.max(Math.floor(inner / 24), 1);
  for (let line = 0; line < Math.ceil(KEYS.length / columns); line++) {
    const segments: Segment[] = [];
    for (const [key, what] of KEYS.slice(line * columns, line * columns + columns)) {
      segments.push({ text: '  ' + key.padEnd(9), color: theme.key, bold: true });
      segments.push({ text: what.padEnd(13), color: theme.dim });
    }
    screen.push(segments);
  }
  screen.push([]);

  const title = ` ${kind === 'all' ? 'plugins' : kind}${search ? ' /' + search : ''}${open && !search && kind === 'all' ? ' › ' + open.split('@')[0] : ''}[${rows.length}] `;
  const dashes = Math.max(inner - title.length, 0);
  screen.push([
    { text: '┌' + '─'.repeat(Math.floor(dashes / 2)), color: theme.accent },
    { text: title, color: theme.title, bold: true },
    { text: '─'.repeat(Math.ceil(dashes / 2)) + '┐', color: theme.accent },
  ]);
  const nameWidth = Math.min(Math.max(inner - 52, 16), 40);
  const cells = (name: string, type: string, here: string, all: string, tokens: string, source: string) =>
    fit(' ' + fit(name, nameWidth - 1) + fit(type, 8) + fit(here, 7) + fit(all, 7) + tokens.padStart(7) + '  ' + source, inner);
  screen.push([
    { text: '│', color: theme.accent },
    { text: cells('NAME', 'KIND', 'HERE', 'ALL', 'TOKENS', 'SOURCE'), color: theme.text, bold: true },
    { text: '│', color: theme.accent },
  ]);

  const detailHeight = 6;
  const bodyRows = Math.max(size.rows - screen.length - detailHeight - 5, 3);
  const top = Math.min(Math.max(selected - Math.floor(bodyRows / 2), 0), Math.max(rows.length - bodyRows, 0));
  for (let index = top; index < top + bodyRows; index++) {
    const item = rows[index];
    let text = fit('', inner);
    let color = theme.text;
    if (!items && index === top) text = fit(' Reading the plugins…', inner);
    if (item) {
      const isChild = !!item.plugin && kind === 'all' && !search && !byCost;
      const name = (isChild ? '  ' : '') + (item.kind === 'plugin' ? (open === item.id ? '▾ ' : '▸ ') : '') + item.name;
      text = cells(
        name,
        item.kind,
        place.path ? SHORT[item.here] : '·',
        SHORT[item.everywhere],
        item.tokens === null ? '?' : item.tokens.toLocaleString(),
        item.plugin && isChild ? '' : item.version ? `${item.source} ${item.version}` : item.source
      );
      const state = place.path ? item.here : item.everywhere;
      color = item.isHeld || state === 'off' ? theme.dim : item.kind === 'plugin' ? theme.label : theme.text;
    }
    const isSelected = !!item && index === Math.min(selected, rows.length - 1);
    screen.push([
      { text: '│', color: theme.accent },
      { text, color: isSelected ? theme.selectionText : color, background: isSelected ? theme.accent : undefined },
      { text: '│', color: theme.accent },
    ]);
  }
  screen.push([{ text: '├' + '─'.repeat(inner) + '┤', color: theme.accent }]);

  // Inspect: the selected item in full
  const detail: Segment[][] = [];
  if (current) {
    detail.push([
      { text: ` ${current.id}`, color: theme.title, bold: true },
      { text: `  ${current.kind} from ${current.plugin ?? current.source}${current.isHeld ? ' (its plugin is off)' : ''}`, color: theme.dim },
    ]);
    for (const text of wrap(current.description || '(no description)', inner - 2, 3)) {
      detail.push([{ text: ' ' + text, color: theme.text }]);
    }
    detail.push([{ text: ' ' + (current.where ?? ''), color: theme.dim }]);
  }
  for (let at = 0; at < detailHeight; at++) {
    const line = detail[at] ?? [];
    const used = line.reduce((sum, { text }) => sum + text.length, 0);
    screen.push([
      { text: '│', color: theme.accent },
      ...line.map((segment) => ({ ...segment, text: segment.text.slice(0, Math.max(inner - (used - segment.text.length), 0)) })),
      { text: ' '.repeat(Math.max(inner - used, 0)) },
      { text: '│', color: theme.accent },
    ]);
  }
  screen.push([{ text: '└' + '─'.repeat(inner) + '┘', color: theme.accent }]);
  screen.push([
    {
      text: isSearching ? ` /${search}█` : ' ' + (message || 'here = this project (.claude/settings.local.json) · all = every session (~/.claude/settings.json)'),
      color: isSearching ? theme.key : theme.dim,
    },
  ]);

  // The project picker, drawn over the table
  if (projects) {
    const boxWidth = Math.min(40, inner - 4);
    const height = Math.min(projects.length, bodyRows - 2);
    const first = Math.min(Math.max(pick - Math.floor(height / 2), 0), Math.max(projects.length - height, 0));
    const startRow = 7;
    for (let at = 0; at < height + 1; at++) {
      const one = at === 0 ? null : projects[first + at - 1];
      const line = screen[startRow + at];
      if (!line) break;
      const isPicked = one && first + at - 1 === pick;
      line.splice(1, 0, {
        text: fit(at === 0 ? ' Look at which project?' : ' ' + one!.name, boxWidth),
        color: isPicked ? theme.selectionText : theme.dialogText,
        background: isPicked ? theme.accent : theme.dialogBackground,
        bold: at === 0,
      });
      line[2] = { ...line[2], text: line[2].text.slice(boxWidth) };
    }
  }

  return (
    <Box flexDirection="column" width={width} height={size.rows - 1}>
      {screen.slice(0, size.rows - 1).map((segments, index) => {
        const used = segments.reduce((sum, { text }) => sum + text.length, 0);
        return (
          <Text key={index} color={theme.text} backgroundColor={theme.background} wrap="truncate">
            {segments.map((segment, at) => (
              <Text key={at} color={segment.color} backgroundColor={segment.background} bold={segment.bold}>
                {segment.text}
              </Text>
            ))}
            <Text color={theme.dim}>{' '.repeat(Math.max(width - used, 0))}</Text>
          </Text>
        );
      })}
    </Box>
  );
}

/**
 * The project the panel starts on: the nearest folder above the current one
 * whose meta.json says `type: "project"`
 */
function projectAround(start: string): Place {
  let folder = start;
  while (folder !== dirname(folder)) {
    const meta = readJson(join(folder, 'meta.json'));
    if (meta.type === 'project') return { path: folder, name: meta.name ?? basename(folder) };
    folder = dirname(folder);
  }
  return { path: null, name: 'everywhere only' };
}

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function plugins(program: any) {
  program
    .command('kit')
    .alias('plugins')
    .description('control panel for Claude Code plugins, skills, agents and MCP servers')
    .option('--project <path>', 'the project to look at (default: the one around the current folder)')
    .option('--json', 'print every item and its state, and exit')
    .action(async (options: { project?: string; json?: boolean }) => {
      const place = options.project
        ? projectAround(options.project.startsWith('/') ? options.project : join(Deno.cwd(), options.project))
        : projectAround(Deno.cwd());

      if (options.json || !Deno.stdout.isTerminal()) {
        console.log(JSON.stringify({ project: place, items: await readItems(place) }, null, 2));
        return;
      }

      const encoder = new TextEncoder();
      Deno.stdout.writeSync(encoder.encode('\x1b[?1049h\x1b[H'));
      const wanted = readSettings().theme ?? DEFAULT_THEME;
      const themeName = wanted in THEMES ? wanted : DEFAULT_THEME;
      paintBackground(THEMES[themeName]);
      try {
        const app = render(<Panel initialTheme={themeName} initialPlace={place} />, { exitOnCtrlC: true });
        await app.waitUntilExit();
      } finally {
        Deno.stdout.writeSync(encoder.encode('\x1b[?1049l'));
      }
      process.exit(0);
    });
}

export { plugins as commandPlugins };
