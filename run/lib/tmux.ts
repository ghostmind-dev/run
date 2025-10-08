/**
 * @fileoverview TMUX session management module for @ghostmind/run
 *
 * This module provides commands for managing TMUX sessions and windows
 * for development workflows.
 *
 * SSH Support:
 * Panes can now include an "sshTarget" property to execute commands remotely.
 * Example meta.json configuration:
 * {
 *   "tmux": {
 *     "sessions": [{
 *       "name": "dev",
 *       "windows": [{
 *         "name": "backend",
 *         "panes": [{
 *           "name": "server",
 *           "command": "npm start",
 *           "sshTarget": "prod-server"
 *         }]
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
} from '../utils/divers.ts';
import chalk from 'npm:chalk@5.3.0';

////////////////////////////////////////////////////////////////////////////////
// INTERFACES
////////////////////////////////////////////////////////////////////////////////

interface TmuxPane {
  name: string;
  path?: string;
  command?: string;
  sshTarget?: string;
  size?: string;
}


interface TmuxSection {
  split: 'horizontal' | 'vertical';
  size?: string;
  items: (TmuxSection | TmuxPane)[];
}

interface TmuxGrid {
  type: 'single' | 'vertical' | 'horizontal' | 'two-by-two' | 'main-side';
  panes: TmuxPane[];
}

interface TmuxWindow {
  name: string;
  layout: 'sections' | 'grid';
  section?: TmuxSection;
  grid?: TmuxGrid;
}

interface TmuxSession {
  name: string;
  root?: string;
  windows: TmuxWindow[];
}

interface TmuxConfig {
  sessions: TmuxSession[];
}

////////////////////////////////////////////////////////////////////////////////
// HELPER FUNCTIONS
////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////
// GRID LAYOUT HELPER FUNCTIONS
////////////////////////////////////////////////////////////////////////////////

// Define expected pane counts for each grid type
const GRID_PANE_COUNTS: Record<TmuxGrid['type'], number> = {
  'single': 1,
  'vertical': 2,
  'horizontal': 2,
  'two-by-two': 4,
  'main-side': 3,
};

// Auto-fill missing panes for a grid configuration
function autoFillGridPanes(grid: TmuxGrid): TmuxPane[] {
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
        `⚠️  Grid '${grid.type}' expects ${expectedCount} panes, found ${currentCount}. Auto-filling ${expectedCount - currentCount} panes.`
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
function gridToSection(grid: TmuxGrid): TmuxSection {
  const panes = autoFillGridPanes(grid);

  switch (grid.type) {
    case 'single':
      return {
        split: 'horizontal',
        items: [panes[0]]
      };

    case 'vertical':
      return {
        split: 'vertical',
        items: [
          { ...panes[0], size: '50%' },
          { ...panes[1], size: '50%' }
        ]
      };

    case 'horizontal':
      return {
        split: 'horizontal',
        items: [
          { ...panes[0], size: '50%' },
          { ...panes[1], size: '50%' }
        ]
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
              { ...panes[1], size: '50%' }
            ]
          },
          {
            split: 'horizontal',
            size: '50%',
            items: [
              { ...panes[2], size: '50%' },
              { ...panes[3], size: '50%' }
            ]
          }
        ]
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
              { ...panes[2], size: '50%' }
            ]
          }
        ]
      };

    default:
      throw new Error(`Unknown grid type: ${grid.type}`);
  }
}

////////////////////////////////////////////////////////////////////////////////
// SECTION LAYOUT HELPER FUNCTIONS
////////////////////////////////////////////////////////////////////////////////

// Section-based layout helper functions
function isPane(item: TmuxSection | TmuxPane): item is TmuxPane {
  return 'name' in item;
}

function isSection(item: TmuxSection | TmuxPane): item is TmuxSection {
  return 'split' in item;
}

// Extract all panes from a section hierarchy
function extractPanesFromSection(section: TmuxSection): TmuxPane[] {
  const panes: TmuxPane[] = [];

  for (const item of section.items) {
    if (isPane(item)) {
      panes.push(item);
    } else if (isSection(item)) {
      panes.push(...extractPanesFromSection(item));
    }
  }

  return panes;
}

// Build a plan of split operations needed for the entire layout
function buildSplitPlan(section: TmuxSection, targetPane: number = 0): Array<{
  type: 'split';
  fromPane: number;
  direction: string;
  size?: string;
  resultPane: number;
} | {
  type: 'assign';
  paneName: string;
  paneIndex: number;
}> {
  const plan: Array<any> = [];
  let nextPaneId = 1;

  function processSection(sec: TmuxSection, currentPane: number): number[] {
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
      const splitFlag = sec.split === 'horizontal' ? '-v' : '-h';
      const sizeFlag = item.size ? `-p ${item.size.replace('%', '')}` : '';
      const newPane = nextPaneId++;

      plan.push({
        type: 'split',
        fromPane: currentPane, // Always split from the original pane
        direction: splitFlag,
        size: sizeFlag,
        resultPane: newPane
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

  processSection(section, targetPane);
  return plan;
}

async function processSectionHierarchy(
  section: TmuxSection,
  sessionName: string,
  windowName: string,
  sessionRoot: string,
  paneMap: Map<string, number>,
  nextPaneIndex: number,
  isAppendMode: boolean,
  targetPaneIndex?: number
): Promise<number> {
  if (section.items.length === 0) {
    return nextPaneIndex;
  }

  // Build the complete plan first
  const plan = buildSplitPlan(section, targetPaneIndex ?? 0);

  if (!isAppendMode) {
    console.log(chalk.gray(`    📋 Execution plan:`));
    plan.forEach((op, i) => {
      if (op.type === 'split') {
        console.log(chalk.gray(`      ${i + 1}. Split pane ${op.fromPane} ${op.direction} → pane ${op.resultPane}`));
      } else {
        console.log(chalk.gray(`      ${i + 1}. Assign '${op.paneName}' → pane ${op.paneIndex}`));
      }
    });
  }

  // Map from planned pane IDs to actual tmux pane indices
  const paneMapping = new Map<number, number>();
  paneMapping.set(0, targetPaneIndex ?? 0); // Initial pane mapping

  // Execute the plan with position-based tracking
  for (const op of plan) {
    if (op.type === 'split') {
      const actualFromPane = paneMapping.get(op.fromPane) ?? 0;
      const itemPath = sessionRoot; // Default path for splits

      if (!isAppendMode) {
        console.log(
          chalk.gray(`    ➤ Splitting actual pane ${actualFromPane} ${op.direction} (planned: ${op.fromPane} → ${op.resultPane})`)
        );
      }

      // Get pane positions before split to understand the layout
      const beforeSplitResult = await $`tmux list-panes -t ${sessionName}:${windowName} -F "#{pane_index}:#{pane_left},#{pane_top},#{pane_width},#{pane_height}"`;
      const beforePanes = beforeSplitResult.stdout.trim().split('\n').map(line => {
        const [index, pos] = line.split(':');
        const [left, top, width, height] = pos.split(',').map(Number);
        return { index: parseInt(index), left, top, width, height };
      });

      // Perform the split
      await $`tmux split-window -t ${sessionName}:${windowName}.${actualFromPane} ${op.direction} ${op.size} -c ${itemPath}`;

      // Get pane positions after split to understand the new layout
      const afterSplitResult = await $`tmux list-panes -t ${sessionName}:${windowName} -F "#{pane_index}:#{pane_left},#{pane_top},#{pane_width},#{pane_height}"`;
      const afterPanes = afterSplitResult.stdout.trim().split('\n').map(line => {
        const [index, pos] = line.split(':');
        const [left, top, width, height] = pos.split(',').map(Number);
        return { index: parseInt(index), left, top, width, height };
      });

      // Find the newly created pane (highest index)
      const newActualPane = Math.max(...afterPanes.map(p => p.index));

      // Map the planned pane ID to the actual pane index
      paneMapping.set(op.resultPane, newActualPane);

      if (!isAppendMode) {
        console.log(chalk.gray(`      → Created actual pane ${newActualPane}`));
        console.log(chalk.gray(`      → Layout after split:`));
        afterPanes.forEach(p => {
          console.log(chalk.gray(`          Pane ${p.index}: ${p.width}x${p.height} at (${p.left},${p.top})`));
        });
      }

      // CRITICAL: Update existing pane mappings that may have been affected by renumbering
      // We need to track which planned panes correspond to which actual positions
      for (const [plannedId, oldActualIndex] of paneMapping.entries()) {
        if (plannedId === op.resultPane) continue; // Skip the newly created pane

        // Find the old pane's position
        const oldPane = beforePanes.find(p => p.index === oldActualIndex);
        if (!oldPane) continue;

        // Find the current pane at that position
        const currentPane = afterPanes.find(p =>
          p.left === oldPane.left && p.top === oldPane.top &&
          p.width === oldPane.width && p.height === oldPane.height
        );

        if (currentPane && currentPane.index !== oldActualIndex) {
          // The pane was renumbered
          paneMapping.set(plannedId, currentPane.index);
          if (!isAppendMode) {
            console.log(chalk.gray(`      → Remapped planned pane ${plannedId}: ${oldActualIndex} → ${currentPane.index}`));
          }
        }
      }
    } else if (op.type === 'assign') {
      const actualPane = paneMapping.get(op.paneIndex) ?? op.paneIndex;
      paneMap.set(op.paneName, actualPane);

      if (!isAppendMode) {
        console.log(chalk.gray(`    ➤ Assigned '${op.paneName}' to actual pane ${actualPane}`));
      }
    }
  }

  // Return the next available pane index
  const allActualPanes = Array.from(paneMapping.values());
  return Math.max(...allActualPanes, nextPaneIndex) + 1;
}

function findPaneInSection(
  section: TmuxSection,
  paneName: string
): TmuxPane | null {
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

// Pastel color palette for tmux windows (subtle, non-disruptive colors)
const TMUX_COLORS = [
  'colour146', // light yellow/beige
  'colour152', // pale yellow
  'colour182', // soft orange/peach
  'colour189', // light blue
  'colour219', // light pink
  'colour151', // pale green
  'colour225', // light lavender
  'colour194', // pale mint
  'colour174', // dusty rose
  'colour223', // cream
  'colour158', // sage green
  'colour195', // pale blue
];

function getRandomColor(): string {
  return TMUX_COLORS[Math.floor(Math.random() * TMUX_COLORS.length)];
}

/**
 * Build SSH command using the same logic as 'run misc ssh'
 * @param sshTarget SSH config name
 * @param command Command to run
 * @param currentPath Current working directory path
 * @returns SSH command string
 */
function buildSSHCommand(
  sshTarget: string,
  command: string,
  currentPath: string
): string {
  const SRC = Deno.env.get('SRC') || '';
  const LOCALHOST_SRC = Deno.env.get('LOCALHOST_SRC') || '';

  const relativePath = currentPath.replace(SRC, '').replace(/^\//, '');
  const targetPath = `${LOCALHOST_SRC}/${relativePath}`;

  return `ssh ${sshTarget} -t "cd ${targetPath}; ${command}; exec \\$SHELL -l"`;
}

async function initAllTmuxSessions(
  sessionName: string,
  reset: boolean,
  useColors: boolean = false
): Promise<void> {
  $.verbose = false;

  // Find project root
  const SRC = Deno.env.get('SRC') || Deno.cwd();

  console.log(
    chalk.green(`🔍 Discovering all tmux configurations in ${SRC}...`)
  );

  // Discover all directories
  const directories = await recursiveDirectoriesDiscovery(SRC);

  // Add the SRC directory itself since recursiveDirectoriesDiscovery doesn't include it
  // but there's always a meta.json file in the SRC folder
  directories.unshift(SRC);

  const tmuxConfigs: { path: string; meta: any }[] = [];

  // Find all meta.json files with tmux config AND filter for the requested session
  for (const directory of directories) {
    const metaConfig = await verifyIfMetaJsonExists(directory);
    if (metaConfig?.tmux?.sessions) {
      // Check if this meta.json contains the requested session
      const hasRequestedSession = metaConfig.tmux.sessions.some(
        (session: any) => session.name === sessionName
      );
      if (hasRequestedSession) {
        tmuxConfigs.push({ path: directory, meta: metaConfig });
      }
    }
  }

  if (tmuxConfigs.length === 0) {
    console.error(
      chalk.yellow(
        `⚠️  No tmux configurations found for session '${sessionName}' in project`
      )
    );
    Deno.exit(1);
  }

  console.log(
    chalk.blue(
      `📦 Found ${tmuxConfigs.length} tmux configurations with session '${sessionName}'`
    )
  );

  // Handle reset if requested
  if (reset) {
    try {
      await $`tmux has-session -t ${sessionName} 2>/dev/null`;
      console.log(
        chalk.yellow(`🔄 Resetting existing session: ${sessionName}`)
      );
      await $`tmux kill-session -t ${sessionName}`;
    } catch {
      // Session doesn't exist, nothing to reset
    }
  }

  // Process each configuration
  let windowIndex = 0;
  for (const config of tmuxConfigs) {
    console.log(
      chalk.gray(`📁 Processing: ${config.meta.name} (${config.path})`)
    );
    windowIndex = await initTmuxSession(
      sessionName,
      false,
      config.path,
      true,
      useColors,
      windowIndex
    );
  }

  console.log(
    chalk.green(`✅ All configurations processed for session '${sessionName}'!`)
  );
  console.log(
    chalk.cyan(`   To attach: tmux attach-session -t ${sessionName}`)
  );
}

async function initTmuxSession(
  sessionName: string,
  reset: boolean,
  currentPath: string,
  isAppendMode: boolean = false,
  useColors: boolean = false,
  startWindowIndex: number = 0,
  runCommand: boolean = false
): Promise<number> {
  $.verbose = false;

  // Read meta.json from directory
  const metaConfig = await verifyIfMetaJsonExists(currentPath);

  if (!metaConfig) {
    console.error(chalk.red(`❌ No meta.json found in ${currentPath}`));
    return startWindowIndex;
  }

  if (!metaConfig.tmux || !metaConfig.tmux.sessions) {
    console.log(
      chalk.yellow(`⚠️  No tmux configuration found in ${metaConfig.name}`)
    );
    return startWindowIndex;
  }

  const tmuxConfig: TmuxConfig = metaConfig.tmux;

  // Check if sessions array exists
  if (!tmuxConfig.sessions) {
    console.error(chalk.red(`❌ No sessions defined in tmux configuration`));
    return startWindowIndex;
  }

  if (!isAppendMode) {
    console.log(
      chalk.green(
        `🚀 Initializing tmux session '${sessionName}' for ${metaConfig.name}...`
      )
    );
  }

  // Check if session exists
  let sessionExists = false;
  try {
    await $`tmux has-session -t ${sessionName} 2>/dev/null`;
    sessionExists = true;
  } catch {
    // Session doesn't exist
  }

  // Handle reset
  if (reset && sessionExists) {
    console.log(chalk.yellow(`🔄 Resetting session: ${sessionName}`));
    await $`tmux kill-session -t ${sessionName}`;
    sessionExists = false;
  }

  // Process sessions from meta.json - filter to only the requested session
  let currentWindowIndex = startWindowIndex;
  const filteredSessions = tmuxConfig.sessions.filter(
    (session: any) => session.name === sessionName
  );

  for (const sessionConfig of filteredSessions) {
    const sessionRoot = sessionConfig.root
      ? `${currentPath}/${sessionConfig.root}`
      : currentPath;

    // Process windows
    for (
      let windowIndex = 0;
      windowIndex < sessionConfig.windows.length;
      windowIndex++
    ) {
      const window = sessionConfig.windows[windowIndex];
      const windowName = `${metaConfig.name}-${window.name}`;

      if (!isAppendMode) {
        console.log(chalk.gray(`  📁 Creating window: ${windowName}`));
      }

      // Determine the section to process based on layout type
      let sectionToProcess: TmuxSection | null = null;

      if (window.layout === 'grid' && window.grid) {
        // Grid layout mode - convert to section
        if (!isAppendMode) {
          console.log(
            chalk.gray(`    📐 Creating grid layout: ${window.grid.type}`)
          );
        }
        sectionToProcess = gridToSection(window.grid);
      } else if (window.layout === 'sections' && window.section) {
        // Hierarchical section-based layout mode
        if (!isAppendMode) {
          console.log(
            chalk.gray(`    🏗️  Creating hierarchical section layout`)
          );
        }
        sectionToProcess = window.section;
      }

      // Process window layout if we have a section
      if (sectionToProcess) {
        // Create initial session/window
        if (!sessionExists && windowIndex === 0) {
          await $`tmux new-session -d -s ${sessionName} -n ${windowName} -c ${sessionRoot}`;
          sessionExists = true;
        } else {
          await $`tmux new-window -t ${sessionName}: -n ${windowName} -c ${sessionRoot}`;
        }

        // Process the section hierarchy
        const paneMap = new Map<string, number>();
        let nextPaneIndex = 0;

        // Use the recursive algorithm for all patterns
        await processSectionHierarchy(
          sectionToProcess,
          sessionName,
          windowName,
          sessionRoot,
          paneMap,
          nextPaneIndex,
          isAppendMode
        );

        // Execute commands if needed
        if (runCommand) {
          for (const [paneName, paneIndex] of paneMap.entries()) {
            // Find the pane config by traversing the section tree
            const paneConfig = findPaneInSection(sectionToProcess, paneName);
            if (paneConfig?.command) {
              let commandToExecute = paneConfig.command;
              if (paneConfig.sshTarget) {
                const panePath = paneConfig.path
                  ? `${sessionRoot}/${paneConfig.path}`
                  : sessionRoot;
                commandToExecute = buildSSHCommand(
                  paneConfig.sshTarget,
                  paneConfig.command,
                  panePath
                );
              }
              await $`tmux send-keys -t ${sessionName}:${windowName}.${paneIndex} ${commandToExecute} Enter`;
              if (!isAppendMode) {
                console.log(
                  chalk.gray(
                    `    🚀 Executed command in ${paneName}: ${commandToExecute}`
                  )
                );
              }
            }
          }
        }
      }

      // Apply color to window if colors are enabled
      if (useColors) {
        const windowColor = getRandomColor();
        await $`tmux set-window-option -t ${sessionName}:${windowName} window-status-style "bg=${windowColor}"`;
        if (!isAppendMode) {
          console.log(chalk.gray(`    🎨 Applied color: ${windowColor}`));
        }
      }

      currentWindowIndex++;
    }
  }

  // Select first window and first pane
  await $`tmux select-window -t ${sessionName}:0`;
  await $`tmux select-pane -t ${sessionName}:0.0`;

  if (!isAppendMode) {
    console.log(
      chalk.green(`✅ Session '${sessionName}' created successfully!`)
    );
    console.log(
      chalk.cyan(`   To attach: tmux attach-session -t ${sessionName}`)
    );
  }

  return currentWindowIndex;
}

async function executeSessionCommands(
  sessionName: string,
  runAll: boolean = false,
  targets?: string[]
): Promise<void> {
  $.verbose = false;

  // Check if session exists
  try {
    await $`tmux has-session -t ${sessionName} 2>/dev/null`;
  } catch {
    console.error(chalk.red(`❌ Session '${sessionName}' does not exist`));
    return;
  }

  console.log(
    chalk.green(`🚀 Executing commands in session '${sessionName}'...`)
  );

  // Find project root and discover configurations
  const SRC = Deno.env.get('SRC') || Deno.cwd();
  const directories = await recursiveDirectoriesDiscovery(SRC);
  directories.unshift(SRC);

  const tmuxConfigs: { path: string; meta: any }[] = [];

  // Find all meta.json files with tmux config
  for (const directory of directories) {
    const metaConfig = await verifyIfMetaJsonExists(directory);
    if (metaConfig?.tmux?.sessions) {
      const matchingSessions = metaConfig.tmux.sessions.filter(
        (session: any) => session.name === sessionName
      );
      if (matchingSessions.length > 0) {
        tmuxConfigs.push({ path: directory, meta: metaConfig });
      }
    }
  }

  if (tmuxConfigs.length === 0) {
    console.log(
      chalk.yellow(
        `⚠️  No tmux configurations found for session '${sessionName}'`
      )
    );
    return;
  }

  // Process each configuration
  for (const config of tmuxConfigs) {
    const tmuxConfig: TmuxConfig = config.meta.tmux;
    const filteredSessions = tmuxConfig.sessions.filter(
      (session: any) => session.name === sessionName
    );

    for (const sessionConfig of filteredSessions) {
      for (const window of sessionConfig.windows) {
        const windowName = `${config.meta.name}-${window.name}`;

        // Extract panes based on layout type
        let panes: TmuxPane[] = [];
        if (window.layout === 'grid' && window.grid) {
          panes = autoFillGridPanes(window.grid);
        } else if (window.section) {
          panes = extractPanesFromSection(window.section);
        }

        for (let paneIndex = 0; paneIndex < panes.length; paneIndex++) {
          const pane = panes[paneIndex];

          // Check if we should process this specific pane
          let shouldProcessPane = runAll;

          if (targets && targets.length > 0 && !runAll) {
            shouldProcessPane = false;

            // Check each target to see if this pane matches
            for (const target of targets) {
              const targetParts = target.split('.');
              const targetWindow = targetParts[0];

              if (targetWindow === windowName) {
                if (targetParts.length === 1) {
                  // Target is just the window, run all panes in this window
                  shouldProcessPane = true;
                  break;
                } else if (targetParts.length === 2) {
                  // Target is window.pane
                  const targetPane = targetParts[1];

                  // Check if it's an index format like pane[0]
                  const indexMatch = targetPane.match(/pane\[(\d+)\]/);
                  if (indexMatch) {
                    const targetIndex = parseInt(indexMatch[1]);
                    if (targetIndex === paneIndex) {
                      shouldProcessPane = true;
                      break;
                    }
                  } else {
                    // Direct pane name match
                    if (targetPane === pane.name) {
                      shouldProcessPane = true;
                      break;
                    }
                  }
                }
              }
            }
          }

          if (shouldProcessPane && pane.command) {
            let commandToExecute = pane.command;
            let displayCommand = pane.command;

            // If sshTarget is specified, wrap the command in SSH
            if (pane.sshTarget) {
              // For executeSessionCommands, we need to get the pane path
              const sessionRoot = sessionConfig.root
                ? `${config.path}/${sessionConfig.root}`
                : config.path;
              const panePath = pane.path
                ? `${sessionRoot}/${pane.path}`
                : sessionRoot;

              commandToExecute = buildSSHCommand(
                pane.sshTarget,
                pane.command,
                panePath
              );
              displayCommand = `${pane.command} (via SSH: ${pane.sshTarget})`;
            }

            console.log(
              chalk.blue(
                `  🔧 Executing in ${windowName}.${pane.name}: ${displayCommand}`
              )
            );
            try {
              await $`tmux send-keys -t ${sessionName}:${windowName}.${paneIndex} ${commandToExecute} Enter`;
              console.log(chalk.gray(`    ✅ Command sent successfully`));

              // Add a small pause between command executions
              await new Promise((resolve) => setTimeout(resolve, 500));
            } catch (error) {
              console.log(
                chalk.red(`    ❌ Failed to execute command: ${error}`)
              );
            }
          } else if (shouldProcessPane && !pane.command) {
            console.log(
              chalk.gray(
                `  ⏭️  No command defined for ${windowName}.${pane.name}`
              )
            );
          }
        }
      }
    }
  }

  console.log(
    chalk.green(`✅ Command execution completed for session '${sessionName}'`)
  );
}

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function tmux(program: any) {
  const tmux = program.command('tmux');
  tmux.description('tmux session management commands');

  ////////////////////////////////////////////////////////////////////////////
  // INIT COMMAND
  ////////////////////////////////////////////////////////////////////////////

  tmux
    .command('init')
    .description('initialize tmux session from meta.json configurations')
    .argument('<session>', 'session name to create/append to')
    .option('--all', 'process all tmux configurations found in the project')
    .option('--reset', 'reset existing session if it exists')
    .option('--color', 'set random colors for each window when using --all')
    .option('--command', 'run default commands defined in meta.json panes')
    .action(
      async (
        sessionName: string,
        options: {
          all?: boolean;
          reset?: boolean;
          color?: boolean;
          command?: boolean;
        }
      ) => {
        try {
          const { all, reset, color, command } = options;

          if (all) {
            await initAllTmuxSessions(
              sessionName,
              reset ?? false,
              color ?? false
            );
          } else {
            await initTmuxSession(
              sessionName,
              reset ?? false,
              Deno.cwd(),
              false,
              color ?? false,
              0,
              command ?? false
            );
          }
        } catch (error) {
          console.error(
            chalk.red('❌ Error initializing tmux session:'),
            error
          );
          Deno.exit(1);
        }
      }
    );

  ////////////////////////////////////////////////////////////////////////////
  // ATTACH COMMAND
  ////////////////////////////////////////////////////////////////////////////

  tmux
    .command('attach')
    .description('attach to a tmux session')
    .argument('<session>', 'session name to attach to')
    .option('--run-all', 'execute all default commands defined in panes')
    .option(
      '--run <target...>',
      'execute commands for specific targets (format: app-window or app-window.pane[index]). Can be used multiple times.'
    )
    .action(
      async (
        sessionName: string,
        options: { runAll?: boolean; run?: string[] }
      ) => {
        try {
          $.verbose = false;

          const { runAll, run } = options;

          // Execute commands if requested
          if (runAll || (run && run.length > 0)) {
            await executeSessionCommands(sessionName, runAll, run);
          }

          await $`tmux attach-session -t ${sessionName}`;
        } catch (error) {
          console.error(
            chalk.red(
              `❌ Error attaching to tmux session '${sessionName}':`,
              error
            )
          );
          Deno.exit(1);
        }
      }
    );

  ////////////////////////////////////////////////////////////////////////////
  // TERMINATE COMMAND
  ////////////////////////////////////////////////////////////////////////////

  tmux
    .command('terminate')
    .description('terminate a tmux session')
    .argument('<session>', 'session name to terminate')
    .action(async (sessionName: string) => {
      try {
        $.verbose = false;

        // Check if session exists
        try {
          await $`tmux has-session -t ${sessionName} 2>/dev/null`;
        } catch {
          console.log(
            chalk.yellow(`⚠️  Session '${sessionName}' does not exist`)
          );
          return;
        }

        // Kill the session
        await $`tmux kill-session -t ${sessionName}`;
        console.log(
          chalk.green(`✅ Session '${sessionName}' terminated successfully`)
        );
      } catch (error) {
        console.error(
          chalk.red(
            `❌ Error terminating tmux session '${sessionName}':`,
            error
          )
        );
        Deno.exit(1);
      }
    });

  ////////////////////////////////////////////////////////////////////////////
  // LIST COMMAND
  ////////////////////////////////////////////////////////////////////////////

  tmux
    .command('list')
    .description('list all tmux sessions')
    .action(async () => {
      try {
        $.verbose = true;
        await $`tmux list-sessions`;
      } catch (error) {
        console.log(chalk.yellow('No tmux sessions found'));
      }
    });
}

////////////////////////////////////////////////////////////////////////////////
// EXPORT COMMAND FUNCTION
////////////////////////////////////////////////////////////////////////////////

export { tmux as commandTmux };

////////////////////////////////////////////////////////////////////////////////
// THE END
////////////////////////////////////////////////////////////////////////////////
