/**
 * @fileoverview Herdr workspace management module for @ghostmind/run
 *
 * This module provides commands for managing predefined herdr workspaces
 * (tabs and panes) for development workflows. The mapping mirrors the tmux
 * module: a project maps to ONE herdr workspace, tmux windows map to herdr
 * tabs. Everything lives in herdr's default session, so the sidebar shows one
 * workspace per project.
 *
 * A workspace can be fully defined in a single meta.json or spread across
 * multiple meta.json files (each contributing tabs to the same workspace
 * label) and assembled with --all.
 *
 * Panes define the arrangement only — no startup commands. Each pane carries
 * a description documenting how the team (or an AI agent) should use it.
 *
 * Example meta.json configuration:
 * {
 *   "herdr": {
 *     "workspaces": [{
 *       "label": "my-platform",
 *       "tabs": [{
 *         "label": "dev",
 *         "layout": "compact",
 *         "compact": {
 *           "type": "main-side",
 *           "panes": [
 *             { "name": "server", "description": "long-running dev server, do not interrupt" },
 *             "logs",
 *             { "name": "execution-shell", "description": "run ad-hoc commands here" }
 *           ]
 *         }
 *       }]
 *     }]
 *   }
 * }
 *
 * @module
 */

import { $ } from 'npm:zx@8.1.0';
import {
  verifyIfMetaJsonExists,
  recursiveDirectoriesDiscovery,
  getSrc,
} from '../utils/divers.ts';
import chalk from 'npm:chalk@5.3.0';

////////////////////////////////////////////////////////////////////////////////
// INTERFACES
////////////////////////////////////////////////////////////////////////////////

interface HerdrPane {
  name: string;
  description?: string;
  size?: string;
}

interface HerdrSection {
  split: 'horizontal' | 'vertical';
  size?: string;
  items: (HerdrSection | HerdrPane)[];
}

interface HerdrGrid {
  type: 'single' | 'vertical' | 'horizontal' | 'two-by-two' | 'main-side';
  panes: HerdrPane[];
}

interface HerdrCompact {
  type: 'single' | 'vertical' | 'horizontal' | 'two-by-two' | 'main-side';
  panes: (string | HerdrPane)[];
}

interface HerdrTab {
  label: string;
  layout: 'sections' | 'grid' | 'compact';
  path?: string;
  section?: HerdrSection;
  grid?: HerdrGrid;
  compact?: HerdrCompact;
}

interface HerdrWorkspace {
  label: string;
  cwd?: string;
  env?: Record<string, string>;
  tabs: HerdrTab[];
}

interface HerdrConfig {
  workspaces: HerdrWorkspace[];
}

////////////////////////////////////////////////////////////////////////////////
// HERDR CLI HELPERS
////////////////////////////////////////////////////////////////////////////////

const $$ = $({ verbose: false });

/**
 * Run a herdr CLI command and parse its JSON response
 */
async function herdrJson(args: string[]): Promise<any> {
  const result = await $$`herdr ${args}`.quiet();
  const output = result.stdout.trim();
  if (!output) {
    return null;
  }
  return JSON.parse(output).result;
}

/**
 * Ensure the herdr server is running, starting it headless if needed
 */
async function ensureServerRunning(): Promise<void> {
  try {
    await herdrJson(['workspace', 'list']);
    return;
  } catch {
    // Server not running, start it headless
  }

  console.log(chalk.gray(`  🖥️  Starting herdr server...`));

  // Detach fully via nohup so the server outlives this CLI process
  const starter = new Deno.Command('sh', {
    args: ['-c', 'nohup herdr server >/dev/null 2>&1 &'],
    stdin: 'null',
    stdout: 'null',
    stderr: 'null',
  }).spawn();
  await starter.status;

  for (let attempt = 0; attempt < 50; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    try {
      await herdrJson(['workspace', 'list']);
      return;
    } catch {
      // Not ready yet
    }
  }

  throw new Error(`herdr server did not become ready in time`);
}

/**
 * Find running workspaces matching a label
 */
async function findWorkspacesByLabel(label: string): Promise<any[]> {
  const list = await herdrJson(['workspace', 'list']);
  return (list?.workspaces ?? []).filter((ws: any) => ws.label === label);
}

////////////////////////////////////////////////////////////////////////////////
// HELPER FUNCTIONS
////////////////////////////////////////////////////////////////////////////////

/**
 * Resolve a path relative to a base directory
 * @param path Path to resolve (absolute if starts with /, relative otherwise)
 * @param basePath Base directory for relative paths
 * @returns Resolved absolute path
 */
function resolvePath(path: string | undefined, basePath: string): string {
  if (!path) {
    return basePath;
  }

  // If path starts with /, it's absolute
  if (path.startsWith('/')) {
    return path;
  }

  // Otherwise, it's relative to basePath
  return `${basePath}/${path}`;
}

////////////////////////////////////////////////////////////////////////////////
// GRID LAYOUT HELPER FUNCTIONS
////////////////////////////////////////////////////////////////////////////////

// Define expected pane counts for each grid type
const GRID_PANE_COUNTS: Record<HerdrGrid['type'], number> = {
  single: 1,
  vertical: 2,
  horizontal: 2,
  'two-by-two': 4,
  'main-side': 3,
};

// Auto-fill missing panes for a grid configuration
function autoFillGridPanes(grid: HerdrGrid): HerdrPane[] {
  const expectedCount = GRID_PANE_COUNTS[grid.type];
  const currentCount = grid.panes.length;

  if (currentCount > expectedCount) {
    console.log(
      chalk.yellow(
        `⚠️  Grid '${grid.type}' expects ${expectedCount} panes, but ${currentCount} were defined. Using first ${expectedCount} panes.`
      )
    );
    return grid.panes.slice(0, expectedCount);
  }

  if (currentCount < expectedCount) {
    console.log(
      chalk.yellow(
        `⚠️  Grid '${
          grid.type
        }' expects ${expectedCount} panes, found ${currentCount}. Auto-filling ${
          expectedCount - currentCount
        } panes.`
      )
    );

    const filledPanes = [...grid.panes];
    for (let i = currentCount; i < expectedCount; i++) {
      filledPanes.push({ name: `pane-${i}` });
    }
    return filledPanes;
  }

  return grid.panes;
}

// Convert grid configuration to section hierarchy for processing
function gridToSection(grid: HerdrGrid): HerdrSection {
  const panes = autoFillGridPanes(grid);

  switch (grid.type) {
    case 'single':
      return {
        split: 'horizontal',
        items: [panes[0]],
      };

    case 'vertical':
      return {
        split: 'vertical',
        items: [
          { ...panes[0], size: '50%' },
          { ...panes[1], size: '50%' },
        ],
      };

    case 'horizontal':
      return {
        split: 'horizontal',
        items: [
          { ...panes[0], size: '50%' },
          { ...panes[1], size: '50%' },
        ],
      };

    case 'two-by-two':
      return {
        split: 'vertical',
        items: [
          {
            split: 'horizontal',
            size: '50%',
            items: [
              { ...panes[0], size: '50%' },
              { ...panes[1], size: '50%' },
            ],
          },
          {
            split: 'horizontal',
            size: '50%',
            items: [
              { ...panes[2], size: '50%' },
              { ...panes[3], size: '50%' },
            ],
          },
        ],
      };

    case 'main-side':
      return {
        split: 'vertical',
        items: [
          { ...panes[0], size: '66%' },
          {
            split: 'horizontal',
            size: '34%',
            items: [
              { ...panes[1], size: '50%' },
              { ...panes[2], size: '50%' },
            ],
          },
        ],
      };

    default:
      throw new Error(`Unknown grid type: ${grid.type}`);
  }
}

// Convert compact configuration to section hierarchy for processing.
// Compact panes are an ordered array (top-left to bottom-right); each entry is
// either just a pane name, or an object with a name and a description of how
// to use the pane (documentation, not an executed command).
function compactToSection(compact: HerdrCompact): HerdrSection {
  const paneEntries = compact.panes;
  const expectedCount = GRID_PANE_COUNTS[compact.type];

  if (paneEntries.length > expectedCount) {
    console.log(
      chalk.yellow(
        `⚠️  Compact '${compact.type}' expects ${expectedCount} panes, but ${paneEntries.length} were defined. Using first ${expectedCount} panes.`
      )
    );
  }

  // Normalize entries to HerdrPane objects, taking only what's needed
  const panes: HerdrPane[] = paneEntries
    .slice(0, expectedCount)
    .map((entry) => (typeof entry === 'string' ? { name: entry } : entry));

  // Auto-fill missing panes if needed
  if (panes.length < expectedCount) {
    console.log(
      chalk.yellow(
        `⚠️  Compact '${
          compact.type
        }' expects ${expectedCount} panes, found ${panes.length}. Auto-filling ${
          expectedCount - panes.length
        } panes.`
      )
    );

    for (let i = panes.length; i < expectedCount; i++) {
      panes.push({ name: `pane-${i}` });
    }
  }

  // Convert to the appropriate grid structure and then to section
  const grid: HerdrGrid = {
    type: compact.type,
    panes: panes,
  };

  return gridToSection(grid);
}

////////////////////////////////////////////////////////////////////////////////
// SECTION LAYOUT HELPER FUNCTIONS
////////////////////////////////////////////////////////////////////////////////

// Section-based layout helper functions
function isPane(item: HerdrSection | HerdrPane): item is HerdrPane {
  return 'name' in item;
}

function isSection(item: HerdrSection | HerdrPane): item is HerdrSection {
  return 'split' in item;
}

// Build a plan of split operations needed for the entire layout.
// Section split semantics: 'horizontal' = top/bottom (herdr direction 'down'),
// 'vertical' = left/right (herdr direction 'right').
// Size semantics: item.size is the percentage the NEW pane should occupy;
// herdr's --ratio is the fraction kept by the ORIGINAL pane, so ratio = 1 - size.
function buildSplitPlan(section: HerdrSection): Array<
  | {
      type: 'split';
      fromPane: number;
      direction: 'right' | 'down';
      ratio?: number;
      resultPane: number;
    }
  | {
      type: 'assign';
      paneName: string;
      paneIndex: number;
    }
> {
  const plan: Array<any> = [];
  let nextPaneId = 1;

  function processSection(sec: HerdrSection, currentPane: number): number[] {
    const sectionPanes: number[] = [];

    if (sec.items.length === 0) {
      return sectionPanes;
    }

    // For sections, we first create all the splits for the section
    // then process each item's content in its allocated pane
    const itemPanes: number[] = [];

    // First item uses the current pane
    itemPanes.push(currentPane);

    // Create splits for remaining items
    for (let i = 1; i < sec.items.length; i++) {
      const item = sec.items[i];
      const direction = sec.split === 'horizontal' ? 'down' : 'right';
      const newPane = nextPaneId++;

      let ratio: number | undefined;
      if (item.size) {
        const newPaneFraction = parseInt(item.size.replace('%', ''), 10) / 100;
        ratio = Math.min(Math.max(1 - newPaneFraction, 0.05), 0.95);
      }

      plan.push({
        type: 'split',
        fromPane: currentPane, // Always split from the original pane
        direction,
        ratio,
        resultPane: newPane,
      });

      itemPanes.push(newPane);
    }

    // Now process each item's content in its allocated pane
    for (let i = 0; i < sec.items.length; i++) {
      const item = sec.items[i];
      const itemPane = itemPanes[i];

      if (isPane(item)) {
        plan.push({ type: 'assign', paneName: item.name, paneIndex: itemPane });
        sectionPanes.push(itemPane);
      } else if (isSection(item)) {
        const nestedPanes = processSection(item, itemPane);
        sectionPanes.push(...nestedPanes);
      }
    }

    return sectionPanes;
  }

  processSection(section, 0);
  return plan;
}

function findPaneInSection(
  section: HerdrSection,
  paneName: string
): HerdrPane | null {
  for (const item of section.items) {
    if (isPane(item) && item.name === paneName) {
      return item;
    }
    if (isSection(item)) {
      const found = findPaneInSection(item, paneName);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Resolve the section to process for a tab based on its layout mode
 */
function sectionForTab(tab: HerdrTab): HerdrSection | null {
  if (tab.layout === 'grid' && tab.grid) {
    return gridToSection(tab.grid);
  }
  if (tab.layout === 'compact' && tab.compact) {
    return compactToSection(tab.compact);
  }
  if (tab.layout === 'sections' && tab.section) {
    return tab.section;
  }
  return null;
}

////////////////////////////////////////////////////////////////////////////////
// WORKSPACE BUILDER
////////////////////////////////////////////////////////////////////////////////

/**
 * Create one tab (with its panes) inside a workspace
 */
async function createTab(
  workspaceId: string,
  tabLabel: string,
  tab: HerdrTab,
  basePath: string,
  isAppendMode: boolean
): Promise<void> {
  const tabPath = resolvePath(tab.path, basePath);

  if (!isAppendMode) {
    console.log(chalk.gray(`    📁 Creating tab: ${tabLabel}`));
  }

  const tabResult = await herdrJson([
    'tab',
    'create',
    '--workspace',
    workspaceId,
    '--cwd',
    tabPath,
    '--label',
    tabLabel,
    '--no-focus',
  ]);
  const rootPaneId = tabResult.root_pane.pane_id;

  const sectionToProcess = sectionForTab(tab);
  if (!sectionToProcess) {
    return;
  }

  if (!isAppendMode && tab.layout !== 'sections') {
    const layoutType =
      tab.layout === 'grid' ? tab.grid?.type : tab.compact?.type;
    console.log(
      chalk.gray(`      📐 Creating ${tab.layout} layout: ${layoutType}`)
    );
  }

  // Build and execute the split plan. herdr pane ids are stable strings,
  // so planned pane ids map directly to real ids with no renumbering.
  const plan = buildSplitPlan(sectionToProcess);
  const paneIds = new Map<number, string>();
  paneIds.set(0, rootPaneId);
  const paneMap = new Map<string, string>();

  for (const op of plan) {
    if (op.type === 'split') {
      const fromPaneId = paneIds.get(op.fromPane);
      if (!fromPaneId) {
        throw new Error(`Split plan referenced unknown pane ${op.fromPane}`);
      }

      const splitArgs = [
        'pane',
        'split',
        fromPaneId,
        '--direction',
        op.direction,
        '--cwd',
        tabPath,
        '--no-focus',
      ];
      if (op.ratio !== undefined) {
        splitArgs.push('--ratio', op.ratio.toFixed(2));
      }

      const splitResult = await herdrJson(splitArgs);
      paneIds.set(op.resultPane, splitResult.pane.pane_id);
    } else if (op.type === 'assign') {
      const paneId = paneIds.get(op.paneIndex);
      if (paneId) {
        paneMap.set(op.paneName, paneId);
      }
    }
  }

  // Label panes with their configured names and surface their descriptions
  for (const [paneName, paneId] of paneMap.entries()) {
    try {
      await herdrJson(['pane', 'rename', paneId, paneName]);
    } catch (error) {
      if (!isAppendMode) {
        console.log(
          chalk.yellow(`      ⚠️  Failed to label pane ${paneId}: ${error}`)
        );
      }
    }

    if (!isAppendMode) {
      const paneConfig = findPaneInSection(sectionToProcess, paneName);
      if (paneConfig?.description) {
        console.log(
          chalk.gray(`      🏷️  ${paneName}: ${paneConfig.description}`)
        );
      }
    }
  }
}

/**
 * Initialize the tabs a single meta.json contributes to a workspace.
 * Reuses the workspace when one with the same label already exists, and
 * skips tabs whose label already exists (idempotent by default).
 */
async function initHerdrWorkspace(
  workspaceName: string,
  reset: boolean,
  currentPath: string,
  isAppendMode: boolean = false
): Promise<void> {
  $.verbose = false;

  // Read meta.json from directory
  const metaConfig = await verifyIfMetaJsonExists(currentPath);

  if (!metaConfig) {
    console.error(chalk.red(`❌ No meta.json found in ${currentPath}`));
    return;
  }

  if (!metaConfig.herdr || !metaConfig.herdr.workspaces) {
    console.log(
      chalk.yellow(`⚠️  No herdr configuration found in ${metaConfig.name}`)
    );
    return;
  }

  const herdrConfig: HerdrConfig = metaConfig.herdr;

  const filteredWorkspaces = herdrConfig.workspaces.filter(
    (workspace: HerdrWorkspace) => workspace.label === workspaceName
  );

  if (filteredWorkspaces.length === 0) {
    console.log(
      chalk.yellow(
        `⚠️  Workspace '${workspaceName}' not defined in ${metaConfig.name}`
      )
    );
    return;
  }

  if (!isAppendMode) {
    console.log(
      chalk.green(
        `🚀 Initializing herdr workspace '${workspaceName}' for ${metaConfig.name}...`
      )
    );
  }

  await ensureServerRunning();

  // Handle reset (only once, in the non-append entry path; initAllHerdrWorkspaces
  // handles reset itself before looping)
  if (reset && !isAppendMode) {
    await closeWorkspacesByLabel(workspaceName, true);
  }

  for (const workspaceConfig of filteredWorkspaces) {
    const basePath = resolvePath(workspaceConfig.cwd, currentPath);

    // Reuse the existing workspace if one with this label is already open
    const existing = await findWorkspacesByLabel(workspaceName);
    let workspaceId: string;
    let autoTabId: string | null = null;

    if (existing.length > 0) {
      workspaceId = existing[0].workspace_id;
      if (!isAppendMode) {
        console.log(
          chalk.gray(`  🗂️  Reusing workspace: ${workspaceName} (${workspaceId})`)
        );
      }
    } else {
      if (!isAppendMode) {
        console.log(
          chalk.gray(`  🗂️  Creating workspace: ${workspaceName} (${basePath})`)
        );
      }

      const createArgs = [
        'workspace',
        'create',
        '--cwd',
        basePath,
        '--label',
        workspaceName,
        '--no-focus',
      ];
      for (const [key, value] of Object.entries(workspaceConfig.env ?? {})) {
        createArgs.push('--env', `${key}=${value}`);
      }

      const created = await herdrJson(createArgs);
      workspaceId = created.workspace.workspace_id;
      autoTabId = created.tab.tab_id;
    }

    // Existing tab labels, to skip tabs that are already present
    const tabList = await herdrJson([
      'tab',
      'list',
      '--workspace',
      workspaceId,
    ]);
    const existingTabLabels = new Set(
      (tabList?.tabs ?? []).map((tab: any) => tab.label)
    );

    let createdTabs = 0;
    for (const tab of workspaceConfig.tabs ?? []) {
      // Prefix tab labels with the app name, mirroring tmux window naming
      const tabLabel = `${metaConfig.name}-${tab.label}`;

      if (existingTabLabels.has(tabLabel)) {
        console.log(chalk.gray(`    ⏭️  Tab '${tabLabel}' already exists`));
        continue;
      }

      await createTab(workspaceId, tabLabel, tab, basePath, isAppendMode);
      createdTabs++;
    }

    // A freshly created workspace comes with an automatic first tab; close it
    // once the configured tabs exist so only defined tabs remain
    if (autoTabId && createdTabs > 0) {
      await herdrJson(['tab', 'close', autoTabId]);
    }
  }

  if (!isAppendMode) {
    console.log(
      chalk.green(`✅ Workspace '${workspaceName}' initialized successfully!`)
    );
    console.log(chalk.cyan(`   To attach: run herdr attach`));
  }
}

/**
 * Initialize a workspace from all meta.json files in the project that
 * contribute tabs to it
 */
async function initAllHerdrWorkspaces(
  workspaceName: string,
  reset: boolean
): Promise<void> {
  $.verbose = false;

  // Find project root
  const SRC = await getSrc();

  console.log(
    chalk.green(`🔍 Discovering all herdr configurations in ${SRC}...`)
  );

  // Discover all directories
  const directories = await recursiveDirectoriesDiscovery(SRC);

  // Add the SRC directory itself since recursiveDirectoriesDiscovery doesn't
  // include it but there's always a meta.json file in the SRC folder
  directories.unshift(SRC);

  const herdrConfigs: { path: string; meta: any }[] = [];

  // Find all meta.json files with herdr config AND filter for the requested workspace
  for (const directory of directories) {
    const metaConfig = await verifyIfMetaJsonExists(directory);
    if (metaConfig?.herdr?.workspaces) {
      const hasRequestedWorkspace = metaConfig.herdr.workspaces.some(
        (workspace: any) => workspace.label === workspaceName
      );
      if (hasRequestedWorkspace) {
        herdrConfigs.push({ path: directory, meta: metaConfig });
      }
    }
  }

  if (herdrConfigs.length === 0) {
    console.error(
      chalk.yellow(
        `⚠️  No herdr configurations found for workspace '${workspaceName}' in project`
      )
    );
    Deno.exit(1);
  }

  console.log(
    chalk.blue(
      `📦 Found ${herdrConfigs.length} herdr configurations with workspace '${workspaceName}'`
    )
  );

  await ensureServerRunning();

  // Handle reset if requested
  if (reset) {
    await closeWorkspacesByLabel(workspaceName, true);
  }

  // Process each configuration
  for (const config of herdrConfigs) {
    console.log(
      chalk.gray(`📁 Processing: ${config.meta.name} (${config.path})`)
    );
    await initHerdrWorkspace(workspaceName, false, config.path, true);
  }

  console.log(
    chalk.green(
      `✅ All configurations processed for workspace '${workspaceName}'!`
    )
  );
  console.log(chalk.cyan(`   To attach: run herdr attach`));
}

/**
 * Close all workspaces matching a label
 */
async function closeWorkspacesByLabel(
  label: string,
  quiet: boolean = false
): Promise<void> {
  let matches: any[] = [];
  try {
    matches = await findWorkspacesByLabel(label);
  } catch {
    if (!quiet) {
      console.log(chalk.yellow(`⚠️  herdr server is not running`));
    }
    return;
  }

  if (matches.length === 0) {
    if (!quiet) {
      console.log(chalk.yellow(`⚠️  Workspace '${label}' not found`));
    }
    return;
  }

  for (const workspace of matches) {
    await herdrJson(['workspace', 'close', workspace.workspace_id]);
    if (!quiet) {
      console.log(
        chalk.green(
          `✅ Workspace '${label}' (${workspace.workspace_id}) closed`
        )
      );
    }
  }
}

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function herdr(program: any) {
  const herdr = program.command('herdr');
  herdr.description('herdr workspace management commands');

  ////////////////////////////////////////////////////////////////////////////
  // INIT COMMAND
  ////////////////////////////////////////////////////////////////////////////

  herdr
    .command('init')
    .description('initialize herdr workspace from meta.json configurations')
    .argument('<workspace>', 'workspace label to create/append to')
    .option('--all', 'process all herdr configurations found in the project')
    .option('--reset', 'close and rebuild the workspace if it exists')
    .action(
      async (
        workspaceName: string,
        options: {
          all?: boolean;
          reset?: boolean;
        }
      ) => {
        try {
          const { all, reset } = options;

          if (all) {
            await initAllHerdrWorkspaces(workspaceName, reset ?? false);
          } else {
            await initHerdrWorkspace(
              workspaceName,
              reset ?? false,
              Deno.cwd(),
              false
            );
          }
        } catch (error) {
          console.error(
            chalk.red('❌ Error initializing herdr workspace:'),
            error
          );
          Deno.exit(1);
        }
      }
    );

  ////////////////////////////////////////////////////////////////////////////
  // ATTACH COMMAND
  ////////////////////////////////////////////////////////////////////////////

  herdr
    .command('attach')
    .description('attach to herdr (optionally focusing a workspace)')
    .argument('[workspace]', 'workspace label to focus after attaching')
    .action(async (workspaceName?: string) => {
      try {
        $.verbose = false;

        if (workspaceName) {
          try {
            const matches = await findWorkspacesByLabel(workspaceName);
            if (matches.length > 0) {
              await herdrJson([
                'workspace',
                'focus',
                matches[0].workspace_id,
              ]);
            }
          } catch {
            // Server not running yet; plain attach below will start it
          }
        }

        const attach = new Deno.Command('herdr', {
          stdin: 'inherit',
          stdout: 'inherit',
          stderr: 'inherit',
        }).spawn();
        await attach.status;
      } catch (error) {
        console.error(chalk.red(`❌ Error attaching to herdr:`, error));
        Deno.exit(1);
      }
    });

  ////////////////////////////////////////////////////////////////////////////
  // TERMINATE COMMAND
  ////////////////////////////////////////////////////////////////////////////

  herdr
    .command('terminate')
    .description('close a herdr workspace')
    .argument('<workspace>', 'workspace label to close')
    .action(async (workspaceName: string) => {
      try {
        $.verbose = false;
        await closeWorkspacesByLabel(workspaceName);
      } catch (error) {
        console.error(
          chalk.red(
            `❌ Error terminating herdr workspace '${workspaceName}':`,
            error
          )
        );
        Deno.exit(1);
      }
    });

  ////////////////////////////////////////////////////////////////////////////
  // LIST COMMAND
  ////////////////////////////////////////////////////////////////////////////

  herdr
    .command('list')
    .description('list open herdr workspaces')
    .action(async () => {
      try {
        $.verbose = false;
        const list = await herdrJson(['workspace', 'list']);
        const workspaces: any[] = list?.workspaces ?? [];

        if (workspaces.length === 0) {
          console.log(chalk.yellow('No herdr workspaces open'));
          return;
        }

        for (const workspace of workspaces) {
          console.log(
            `${workspace.workspace_id}  ${workspace.label}  (${workspace.tab_count} tabs, ${workspace.pane_count} panes)`
          );
        }
      } catch {
        console.log(chalk.yellow('herdr server is not running'));
      }
    });
}

////////////////////////////////////////////////////////////////////////////////
// EXPORT COMMAND FUNCTION
////////////////////////////////////////////////////////////////////////////////

export { herdr as commandHerdr };

////////////////////////////////////////////////////////////////////////////////
// THE END
////////////////////////////////////////////////////////////////////////////////
