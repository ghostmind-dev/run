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
  split?: 'horizontal' | 'vertical';
  target?: number;
  size?: string;
  command?: string;
  sshTarget?: string;
}

interface TmuxStep {
  action: 'split';
  target: string; // pane name to target
  direction: 'horizontal' | 'vertical';
  size?: string;
  newPane: string; // name of the new pane created
}

interface TmuxGridCell {
  row: number;
  col: number;
  name: string;
  path?: string;
  command?: string;
  sshTarget?: string;
}

interface TmuxGrid {
  rows: number;
  columns: number;
  cells: TmuxGridCell[];
}

interface TmuxLayout {
  type: 'rows' | 'columns';
  splits: (string | TmuxLayout)[];
}

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

interface TmuxWindow {
  name: string;
  layout?: 'grid' | 'manual' | 'steps' | 'sections' | TmuxLayout;
  grid?: TmuxGrid;
  panes?: TmuxPane[];
  steps?: TmuxStep[];
  section?: TmuxSection; // For section-based layout
  paneDefinitions?: Record<
    string,
    {
      path?: string;
      command?: string;
      sshTarget?: string;
    }
  >;
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

// Section-based layout helper functions
function isPane(item: TmuxSection | TmuxPane): item is TmuxPane {
  return 'name' in item;
}

function isSection(item: TmuxSection | TmuxPane): item is TmuxSection {
  return 'split' in item;
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

  // Process first item (no split needed for the first item)
  const firstItem = section.items[0];
  let currentPaneIndex = targetPaneIndex ?? 0;

  if (isPane(firstItem)) {
    // First item is a pane
    paneMap.set(firstItem.name, currentPaneIndex);
    if (!isAppendMode) {
      console.log(
        chalk.gray(
          `    ➤ Created pane: ${firstItem.name} (index ${currentPaneIndex})`
        )
      );
    }
    nextPaneIndex = Math.max(nextPaneIndex, currentPaneIndex + 1);
  } else if (isSection(firstItem)) {
    // First item is a section
    nextPaneIndex = await processSectionHierarchy(
      firstItem,
      sessionName,
      windowName,
      sessionRoot,
      paneMap,
      nextPaneIndex,
      isAppendMode,
      currentPaneIndex
    );
  }

  // Process remaining items with splits
  for (let i = 1; i < section.items.length; i++) {
    const item = section.items[i];
    const splitFlag = section.split === 'horizontal' ? '-v' : '-h';
    const sizeFlag = item.size ? `-p ${item.size.replace('%', '')}` : '';

    // Create the new pane by splitting from the target
    const itemPath =
      isPane(item) && item.path ? `${sessionRoot}/${item.path}` : sessionRoot;
    await $`tmux split-window -t ${sessionName}:${windowName}.${currentPaneIndex} ${splitFlag} ${sizeFlag} -c ${itemPath}`;

    const newPaneIndex = nextPaneIndex++;

    if (isPane(item)) {
      // Item is a pane
      paneMap.set(item.name, newPaneIndex);
      if (!isAppendMode) {
        console.log(
          chalk.gray(
            `    ➤ Split ${section.split}ly → created pane: ${item.name} (index ${newPaneIndex})`
          )
        );
      }
    } else if (isSection(item)) {
      // Item is a section - process recursively
      if (!isAppendMode) {
        console.log(
          chalk.gray(
            `    ➤ Split ${section.split}ly → created section (${item.split})`
          )
        );
      }
      nextPaneIndex = await processSectionHierarchy(
        item,
        sessionName,
        windowName,
        sessionRoot,
        paneMap,
        nextPaneIndex,
        isAppendMode,
        newPaneIndex
      );
    }
  }

  return nextPaneIndex;
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

      // Process panes based on layout mode
      if (window.grid) {
        // 🔥 REVOLUTIONARY GRID MODE - explicit positioning 🔥
        if (!isAppendMode) {
          console.log(
            chalk.red(
              `    🔥 Creating ${window.grid.rows}x${window.grid.columns} REVOLUTIONARY GRID 🔥`
            )
          );
        }

        // Start with the first cell
        const firstCell = window.grid.cells.find(
          (c) => c.row === 0 && c.col === 0
        );
        if (!firstCell)
          throw new Error('Grid must have a cell at position 0,0');

        const firstPath = firstCell.path
          ? `${sessionRoot}/${firstCell.path}`
          : sessionRoot;

        if (!sessionExists && windowIndex === 0) {
          await $`tmux new-session -d -s ${sessionName} -n ${windowName} -c ${firstPath}`;
          sessionExists = true;
        } else {
          await $`tmux new-window -t ${sessionName}: -n ${windowName} -c ${firstPath}`;
        }

        // For a 2x2 grid, build it with PRECISE control
        if (window.grid.rows === 2 && window.grid.columns === 2) {
          const topLeft = window.grid.cells.find(
            (c) => c.row === 0 && c.col === 0
          );
          const topRight = window.grid.cells.find(
            (c) => c.row === 0 && c.col === 1
          );
          const bottomLeft = window.grid.cells.find(
            (c) => c.row === 1 && c.col === 0
          );
          const bottomRight = window.grid.cells.find(
            (c) => c.row === 1 && c.col === 1
          );

          if (!topLeft || !topRight || !bottomLeft || !bottomRight) {
            throw new Error(
              '2x2 grid requires cells at positions (0,0), (0,1), (1,0), (1,1)'
            );
          }

          console.log(
            chalk.yellow(`    📍 Building: ${topLeft.name} | ${topRight.name}`)
          );
          console.log(
            chalk.yellow(
              `    📍           ${bottomLeft.name} | ${bottomRight.name}`
            )
          );

          // Step 1: Split horizontally first to create TOP and BOTTOM rows
          const bottomLeftPath = bottomLeft.path
            ? `${sessionRoot}/${bottomLeft.path}`
            : sessionRoot;
          await $`tmux split-window -t ${sessionName}:${windowName}.0 -v -p 50 -c ${bottomLeftPath}`;
          console.log(chalk.green(`    ✅ Created TOP and BOTTOM rows`));

          // Step 2: Split the TOP row vertically to create TOP-LEFT and TOP-RIGHT
          const topRightPath = topRight.path
            ? `${sessionRoot}/${topRight.path}`
            : sessionRoot;
          await $`tmux split-window -t ${sessionName}:${windowName}.0 -h -p 50 -c ${topRightPath}`;
          console.log(
            chalk.green(
              `    ✅ Split TOP row: ${topLeft.name} | ${topRight.name}`
            )
          );

          // Step 3: Split the BOTTOM row vertically to create BOTTOM-LEFT and BOTTOM-RIGHT
          const bottomRightPath = bottomRight.path
            ? `${sessionRoot}/${bottomRight.path}`
            : sessionRoot;
          await $`tmux split-window -t ${sessionName}:${windowName}.2 -h -p 50 -c ${bottomRightPath}`;
          console.log(
            chalk.green(
              `    ✅ Split BOTTOM row: ${bottomLeft.name} | ${bottomRight.name}`
            )
          );

          // Execute commands in the CORRECT positions
          if (runCommand) {
            // After our splits: pane 0=top-left, pane 1=top-right, pane 2=bottom-left, pane 3=bottom-right
            const cellMapping = [
              { cell: topLeft, pane: 0 },
              { cell: topRight, pane: 1 },
              { cell: bottomLeft, pane: 2 },
              { cell: bottomRight, pane: 3 },
            ];

            for (const { cell, pane } of cellMapping) {
              if (cell.command) {
                let commandToExecute = cell.command;
                if (cell.sshTarget) {
                  const cellPath = cell.path
                    ? `${sessionRoot}/${cell.path}`
                    : sessionRoot;
                  commandToExecute = buildSSHCommand(
                    cell.sshTarget,
                    cell.command,
                    cellPath
                  );
                }
                await $`tmux send-keys -t ${sessionName}:${windowName}.${pane} ${commandToExecute} Enter`;
                console.log(
                  chalk.cyan(
                    `    🎯 ${cell.name} (${cell.row},${cell.col}) -> pane ${pane}: ${commandToExecute}`
                  )
                );
              }
            }
          }
        }

        console.log(
          chalk.green(`    🎉 REVOLUTIONARY GRID CREATED SUCCESSFULLY! 🎉`)
        );
      } else if (
        typeof window.layout === 'object' &&
        window.layout.type &&
        window.panes
      ) {
        // Hierarchical layout mode
        if (!isAppendMode) {
          console.log(chalk.gray(`    📐 Creating hierarchical layout`));
        }

        // Create first window/pane
        const firstPane = window.panes[0];
        const firstPanePath = firstPane.path
          ? `${sessionRoot}/${firstPane.path}`
          : sessionRoot;

        if (!sessionExists && windowIndex === 0) {
          await $`tmux new-session -d -s ${sessionName} -n ${windowName} -c ${firstPanePath}`;
          sessionExists = true;
        } else {
          await $`tmux new-window -t ${sessionName}: -n ${windowName} -c ${firstPanePath}`;
        }

        // Helper function to create layout recursively
        const createLayout = async (
          layout: TmuxLayout | string,
          targetPane: string = ''
        ) => {
          if (typeof layout === 'string') {
            // It's a pane name, find and create it
            const pane = window.panes?.find((p) => p.name === layout);
            if (pane && window.panes && window.panes.indexOf(pane) > 0) {
              const panePath = pane.path
                ? `${sessionRoot}/${pane.path}`
                : sessionRoot;
              const splitFlag = layout === 'rows' ? '-v' : '-h';
              await $`tmux split-window -t ${sessionName}:${windowName}${targetPane} ${splitFlag} -p 50 -c ${panePath}`;
            }
          } else if (layout.type === 'rows') {
            // Horizontal splits (rows stacked vertically)
            for (let i = 0; i < layout.splits.length; i++) {
              if (i === 0) {
                // First split is already created, just process its children if any
                if (typeof layout.splits[i] === 'object') {
                  await createLayout(layout.splits[i] as TmuxLayout, '.0');
                }
              } else {
                // Create horizontal split
                if (typeof layout.splits[i] === 'string') {
                  const pane = window.panes?.find(
                    (p) => p.name === layout.splits[i]
                  );
                  if (pane) {
                    const panePath = pane.path
                      ? `${sessionRoot}/${pane.path}`
                      : sessionRoot;
                    await $`tmux split-window -t ${sessionName}:${windowName} -v -p ${Math.floor(
                      100 / (layout.splits.length - i)
                    )} -c ${panePath}`;
                  }
                } else {
                  // Complex nested layout
                  await $`tmux split-window -t ${sessionName}:${windowName} -v -p ${Math.floor(
                    100 / (layout.splits.length - i)
                  )}`;
                  await createLayout(layout.splits[i] as TmuxLayout);
                }
              }
            }
          } else if (layout.type === 'columns') {
            // Vertical splits (columns side by side)
            for (let i = 0; i < layout.splits.length; i++) {
              if (i === 0) {
                // First split is already created, just process its children if any
                if (typeof layout.splits[i] === 'object') {
                  await createLayout(layout.splits[i] as TmuxLayout, '.0');
                }
              } else {
                // Create vertical split
                if (typeof layout.splits[i] === 'string') {
                  const pane = window.panes?.find(
                    (p) => p.name === layout.splits[i]
                  );
                  if (pane) {
                    const panePath = pane.path
                      ? `${sessionRoot}/${pane.path}`
                      : sessionRoot;
                    await $`tmux split-window -t ${sessionName}:${windowName} -h -p ${Math.floor(
                      100 / (layout.splits.length - i)
                    )} -c ${panePath}`;
                  }
                } else {
                  // Complex nested layout
                  await $`tmux split-window -t ${sessionName}:${windowName} -h -p ${Math.floor(
                    100 / (layout.splits.length - i)
                  )}`;
                  await createLayout(layout.splits[i] as TmuxLayout);
                }
              }
            }
          }
        };

        // Create the layout structure
        await createLayout(window.layout as TmuxLayout);
      } else if (
        window.layout === 'steps' &&
        window.steps &&
        window.paneDefinitions
      ) {
        // Step-by-step layout mode - human-like approach
        if (!isAppendMode) {
          console.log(chalk.gray(`    🎯 Creating step-by-step layout`));
        }

        // Start with the first pane (always called 'root' or first step target)
        const firstPaneName = Object.keys(window.paneDefinitions)[0];
        const firstPaneConfig = window.paneDefinitions[firstPaneName];
        const firstPanePath = firstPaneConfig?.path
          ? `${sessionRoot}/${firstPaneConfig.path}`
          : sessionRoot;

        if (!sessionExists && windowIndex === 0) {
          await $`tmux new-session -d -s ${sessionName} -n ${windowName} -c ${firstPanePath}`;
          sessionExists = true;
        } else {
          await $`tmux new-window -t ${sessionName}: -n ${windowName} -c ${firstPanePath}`;
        }

        // Keep track of created panes by name
        const paneMap = new Map<string, number>();
        paneMap.set(firstPaneName, 0);
        let nextPaneIndex = 1;

        if (!isAppendMode) {
          console.log(
            chalk.gray(`    ➤ Created initial pane: ${firstPaneName}`)
          );
        }

        // Execute each step
        for (const step of window.steps) {
          if (step.action === 'split') {
            const targetPaneIndex = paneMap.get(step.target);
            if (targetPaneIndex === undefined) {
              throw new Error(
                `Target pane '${
                  step.target
                }' not found. Available panes: ${Array.from(
                  paneMap.keys()
                ).join(', ')}`
              );
            }

            const newPaneConfig = window.paneDefinitions[step.newPane];
            const newPanePath = newPaneConfig?.path
              ? `${sessionRoot}/${newPaneConfig.path}`
              : sessionRoot;

            const splitFlag = step.direction === 'horizontal' ? '-v' : '-h';
            const sizeFlag = step.size
              ? `-p ${step.size.replace('%', '')}`
              : '';

            await $`tmux split-window -t ${sessionName}:${windowName}.${targetPaneIndex} ${splitFlag} ${sizeFlag} -c ${newPanePath}`;

            // Add new pane to map
            paneMap.set(step.newPane, nextPaneIndex);
            nextPaneIndex++;

            if (!isAppendMode) {
              console.log(
                chalk.gray(
                  `    ➤ Split ${step.target} ${step.direction}ly → created ${
                    step.newPane
                  } (pane ${nextPaneIndex - 1})`
                )
              );
            }
          }
        }

        // Execute commands if needed
        if (runCommand) {
          for (const [paneName, paneIndex] of paneMap.entries()) {
            const paneConfig = window.paneDefinitions[paneName];
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
                  chalk.cyan(
                    `    🚀 Executed in ${paneName} (${paneIndex}): ${commandToExecute}`
                  )
                );
              }
            }
          }
        }

        // Execute commands if needed
        if (runCommand && window.panes) {
          for (
            let paneIndex = 0;
            paneIndex < window.panes.length;
            paneIndex++
          ) {
            const pane = window.panes[paneIndex];
            if (pane.command) {
              const panePath = pane.path
                ? `${sessionRoot}/${pane.path}`
                : sessionRoot;
              let commandToExecute = pane.command;
              if (pane.sshTarget) {
                commandToExecute = buildSSHCommand(
                  pane.sshTarget,
                  pane.command,
                  panePath
                );
              }
              await $`tmux send-keys -t ${sessionName}:${windowName}.${paneIndex} ${commandToExecute} Enter`;
              if (!isAppendMode) {
                console.log(
                  chalk.gray(
                    `    🚀 Executed command in ${pane.name}: ${commandToExecute}`
                  )
                );
              }
            }
          }
        }
      } else if (window.layout === 'sections' && window.section) {
        // Hierarchical section-based layout mode
        if (!isAppendMode) {
          console.log(
            chalk.gray(`    🏗️  Creating hierarchical section layout`)
          );
        }

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

        await processSectionHierarchy(
          window.section,
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
            const paneConfig = findPaneInSection(window.section, paneName);
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
      } else if (window.layout === 'grid' && window.panes) {
        // Enforce exactly 4 panes for grid layout
        if (window.panes.length !== 4) {
          console.log(
            chalk.red(
              `    ❌ Grid layout requires exactly 4 panes, found ${window.panes.length}`
            )
          );
          console.log(
            chalk.yellow(
              '       Please update meta.json to define exactly 4 panes for grid layout'
            )
          );
          continue; // Skip this window
        }

        // Simple grid mode - proper 2x2 implementation
        if (!isAppendMode) {
          console.log(chalk.gray(`    📐 Creating 2x2 grid layout`));
        }

        // Create first pane
        const pane0 = window.panes[0];
        const panePath0 = pane0.path
          ? `${sessionRoot}/${pane0.path}`
          : sessionRoot;

        if (!sessionExists && windowIndex === 0) {
          await $`tmux new-session -d -s ${sessionName} -n ${windowName} -c ${panePath0}`;
          sessionExists = true;
        } else {
          await $`tmux new-window -t ${sessionName}: -n ${windowName} -c ${panePath0}`;
        }

        // Create top-right by splitting the first (top-left) pane vertically
        const pane1 = window.panes[1];
        const panePath1 = pane1.path
          ? `${sessionRoot}/${pane1.path}`
          : sessionRoot;
        await $`tmux split-window -t ${sessionName}:${windowName}.0 -h -p 50 -c ${panePath1}`;

        // Create bottom-left by splitting the original top-left pane horizontally
        const pane2 = window.panes[2];
        const panePath2 = pane2.path
          ? `${sessionRoot}/${pane2.path}`
          : sessionRoot;
        await $`tmux split-window -t ${sessionName}:${windowName}.0 -v -p 50 -c ${panePath2}`;

        // Create bottom-right by splitting the bottom-left pane vertically
        const pane3 = window.panes[3];
        const panePath3 = pane3.path
          ? `${sessionRoot}/${pane3.path}`
          : sessionRoot;
        await $`tmux split-window -t ${sessionName}:${windowName}.2 -h -p 50 -c ${panePath3}`;

        // Equalize panes to exact quarters
        await $`tmux select-layout -t ${sessionName}:${windowName} tiled`;
        if (!isAppendMode) {
          console.log(
            chalk.gray(`    ➤ Created 2x2 grid with 4 panes (equal sizes)`)
          );
        }

        // Execute commands - panes are now: 0=top-left, 1=top-right, 2=bottom-left, 3=bottom-right
        if (runCommand) {
          const paneMapping = [0, 1, 2, 3]; // 0=top-left, 1=top-right, 2=bottom-left, 3=bottom-right
          for (let i = 0; i < window.panes.length; i++) {
            const pane = window.panes[i];
            if (pane.command) {
              const panePath = pane.path
                ? `${sessionRoot}/${pane.path}`
                : sessionRoot;
              let commandToExecute = pane.command;
              if (pane.sshTarget) {
                commandToExecute = buildSSHCommand(
                  pane.sshTarget,
                  pane.command,
                  panePath
                );
              }
              await $`tmux send-keys -t ${sessionName}:${windowName}.${paneMapping[i]} ${commandToExecute} Enter`;
              if (!isAppendMode) {
                console.log(
                  chalk.gray(
                    `    🚀 Executed command in ${pane.name}: ${commandToExecute}`
                  )
                );
              }
            }
          }
        }
      } else if (window.panes) {
        // Manual layout mode - use the existing sequential splitting logic
        for (let paneIndex = 0; paneIndex < window.panes.length; paneIndex++) {
          const pane = window.panes[paneIndex];
          const panePath = pane.path
            ? `${sessionRoot}/${pane.path}`
            : sessionRoot;

          if (!sessionExists && windowIndex === 0 && paneIndex === 0) {
            // Create new session with first window and pane
            await $`tmux new-session -d -s ${sessionName} -n ${windowName} -c ${panePath}`;
            sessionExists = true;
            if (!isAppendMode) {
              console.log(chalk.gray(`    ➤ Created pane: ${pane.name}`));
            }
          } else if (paneIndex === 0) {
            // Create new window with first pane
            await $`tmux new-window -t ${sessionName}: -n ${windowName} -c ${panePath}`;
            if (!isAppendMode) {
              console.log(chalk.gray(`    ➤ Created pane: ${pane.name}`));
            }
          } else {
            // Split existing pane
            const splitFlag = pane.split === 'horizontal' ? '-v' : '-h';
            const sizeFlag = pane.size
              ? `-p ${pane.size.replace('%', '')}`
              : '';

            // Determine target pane - use specified target or default to last created
            const targetPane =
              pane.target !== undefined ? `.${pane.target}` : '';

            // Special handling for five-pane layouts - optimize bottom row splits
            let finalSizeFlag = sizeFlag;
            if (window.panes.length === 5 && paneIndex >= 3) {
              // For 5-pane layouts, ensure bottom panes are equal
              if (paneIndex === 3) {
                // bottom-center: split bottom row in half
                finalSizeFlag = '-p 50';
              } else if (paneIndex === 4) {
                // bottom-right: split the right half in half again
                finalSizeFlag = '-p 50';
              }
            }

            // Split the window from target pane
            await $`tmux split-window -t ${sessionName}:${windowName}${targetPane} ${splitFlag} ${finalSizeFlag} -c ${panePath}`;
            if (!isAppendMode) {
              console.log(
                chalk.gray(
                  `    ➤ Created pane: ${pane.name} (${
                    pane.split || 'vertical'
                  } split${
                    pane.target !== undefined ? ` from pane ${pane.target}` : ''
                  })`
                )
              );
            }
          }

          // Execute command if defined for this pane and runCommand flag is true
          if (pane.command && runCommand) {
            let commandToExecute = pane.command;

            // If sshTarget is specified, wrap the command in SSH
            if (pane.sshTarget) {
              commandToExecute = buildSSHCommand(
                pane.sshTarget,
                pane.command,
                panePath
              );
              if (!isAppendMode) {
                console.log(chalk.gray(`    🔗 SSH target: ${pane.sshTarget}`));
              }
            }

            await $`tmux send-keys -t ${sessionName}:${windowName}.${paneIndex} ${commandToExecute} Enter`;
            if (!isAppendMode) {
              console.log(
                chalk.gray(`    🚀 Executed command: ${commandToExecute}`)
              );
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

        for (
          let paneIndex = 0;
          paneIndex < (window.panes?.length ?? 0);
          paneIndex++
        ) {
          const pane = window.panes![paneIndex];

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
