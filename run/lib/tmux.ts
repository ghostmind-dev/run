/**
 * @fileoverview TMUX session management module for @ghostmind/run
 *
 * This module provides commands for managing TMUX sessions and windows
 * for development workflows.
 *
 * @module
 */

import { $ } from 'npm:zx@8.1.0';
import { verifyIfMetaJsonExists, recursiveDirectoriesDiscovery } from '../utils/divers.ts';
import chalk from 'npm:chalk@5.3.0';

////////////////////////////////////////////////////////////////////////////////
// INTERFACES
////////////////////////////////////////////////////////////////////////////////

interface TmuxPane {
  name: string;
  path?: string;
  split?: 'horizontal' | 'vertical';
  size?: string;
}

interface TmuxWindow {
  name: string;
  panes: TmuxPane[];
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

// Pastel color palette for tmux windows (subtle, non-disruptive colors)
const TMUX_COLORS = [
  'colour146',  // light yellow/beige
  'colour152',  // pale yellow
  'colour182',  // soft orange/peach
  'colour189',  // light blue
  'colour219',  // light pink
  'colour151',  // pale green
  'colour225',  // light lavender
  'colour194',  // pale mint
  'colour174',  // dusty rose
  'colour223',  // cream
  'colour158',  // sage green
  'colour195',  // pale blue
];

function getRandomColor(): string {
  return TMUX_COLORS[Math.floor(Math.random() * TMUX_COLORS.length)];
}

async function initAllTmuxSessions(
  sessionName: string,
  reset: boolean,
  useColors: boolean = false
): Promise<void> {
  $.verbose = false;
  
  // Find project root
  const SRC = Deno.env.get('SRC') || Deno.cwd();
  
  console.log(chalk.green(`🔍 Discovering all tmux configurations in ${SRC}...`));
  
  // Discover all directories
  const directories = await recursiveDirectoriesDiscovery(SRC);
  
  // Add the SRC directory itself since recursiveDirectoriesDiscovery doesn't include it
  // but there's always a meta.json file in the SRC folder
  directories.unshift(SRC);
  
  const tmuxConfigs: { path: string; meta: any }[] = [];
  
  // Find all meta.json files with tmux config
  for (const directory of directories) {
    const metaConfig = await verifyIfMetaJsonExists(directory);
    if (metaConfig?.tmux?.sessions) {
      tmuxConfigs.push({ path: directory, meta: metaConfig });
    }
  }
  
  if (tmuxConfigs.length === 0) {
    console.error(chalk.yellow('⚠️  No tmux configurations found in project'));
    Deno.exit(1);
  }
  
  console.log(chalk.blue(`📦 Found ${tmuxConfigs.length} tmux configurations`));
  
  // Handle reset if requested
  if (reset) {
    try {
      await $`tmux has-session -t ${sessionName} 2>/dev/null`;
      console.log(chalk.yellow(`🔄 Resetting existing session: ${sessionName}`));
      await $`tmux kill-session -t ${sessionName}`;
    } catch {
      // Session doesn't exist, nothing to reset
    }
  }
  
  // Process each configuration
  let windowIndex = 0;
  for (const config of tmuxConfigs) {
    console.log(chalk.gray(`📁 Processing: ${config.meta.name} (${config.path})`));
    windowIndex = await initTmuxSession(sessionName, false, config.path, true, useColors, windowIndex);
  }
  
  console.log(chalk.green(`✅ All configurations processed for session '${sessionName}'!`));
  console.log(chalk.cyan(`   To attach: tmux attach-session -t ${sessionName}`));
}

async function initTmuxSession(
  sessionName: string, 
  reset: boolean, 
  currentPath: string, 
  isAppendMode: boolean = false,
  useColors: boolean = false,
  startWindowIndex: number = 0
): Promise<number> {
  $.verbose = false;
  
  // Read meta.json from directory
  const metaConfig = await verifyIfMetaJsonExists(currentPath);
  
  if (!metaConfig) {
    console.error(chalk.red(`❌ No meta.json found in ${currentPath}`));
    return startWindowIndex;
  }
  
  if (!metaConfig.tmux || !metaConfig.tmux.sessions) {
    console.log(chalk.yellow(`⚠️  No tmux configuration found in ${metaConfig.name}`));
    return startWindowIndex;
  }
  
  const tmuxConfig: TmuxConfig = metaConfig.tmux;
  
  if (!isAppendMode) {
    console.log(chalk.green(`🚀 Initializing tmux session '${sessionName}' for ${metaConfig.name}...`));
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
  
  // Process sessions from meta.json
  let currentWindowIndex = startWindowIndex;
  for (const sessionConfig of tmuxConfig.sessions) {
    const sessionRoot = sessionConfig.root ? `${currentPath}/${sessionConfig.root}` : currentPath;
    
    // Process windows
    for (let windowIndex = 0; windowIndex < sessionConfig.windows.length; windowIndex++) {
      const window = sessionConfig.windows[windowIndex];
      const windowName = `${metaConfig.name}-${window.name}`;
      
      if (!isAppendMode) {
        console.log(chalk.gray(`  📁 Creating window: ${windowName}`));
      }
      
      // Process panes
      for (let paneIndex = 0; paneIndex < window.panes.length; paneIndex++) {
        const pane = window.panes[paneIndex];
        const panePath = pane.path ? `${sessionRoot}/${pane.path}` : sessionRoot;
        
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
          const sizeFlag = pane.size ? `-p ${pane.size.replace('%', '')}` : '';
          
          // Split the window
          await $`tmux split-window -t ${sessionName}:${windowName} ${splitFlag} ${sizeFlag} -c ${panePath}`;
          if (!isAppendMode) {
            console.log(chalk.gray(`    ➤ Created pane: ${pane.name} (${pane.split || 'vertical'} split)`));
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
    console.log(chalk.green(`✅ Session '${sessionName}' created successfully!`));
    console.log(chalk.cyan(`   To attach: tmux attach-session -t ${sessionName}`));
  }
  
  return currentWindowIndex;
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
    .action(async (sessionName: string, options: { all?: boolean; reset?: boolean; color?: boolean }) => {
      try {
        const { all, reset, color } = options;

        if (all) {
          await initAllTmuxSessions(sessionName, reset ?? false, color ?? false);
        } else {
          await initTmuxSession(sessionName, reset ?? false, Deno.cwd(), false, color ?? false);
        }
      } catch (error) {
        console.error(chalk.red('❌ Error initializing tmux session:'), error);
        Deno.exit(1);
      }
    });

  ////////////////////////////////////////////////////////////////////////////
  // ATTACH COMMAND
  ////////////////////////////////////////////////////////////////////////////

  tmux
    .command('attach')
    .description('attach to a tmux session')
    .argument('<session>', 'session name to attach to')
    .action(async (sessionName: string) => {
      try {
        $.verbose = false;
        await $`tmux attach-session -t ${sessionName}`;
      } catch (error) {
        console.error(chalk.red(`❌ Error attaching to tmux session '${sessionName}':`, error));
        Deno.exit(1);
      }
    });

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
          console.log(chalk.yellow(`⚠️  Session '${sessionName}' does not exist`));
          return;
        }
        
        // Kill the session
        await $`tmux kill-session -t ${sessionName}`;
        console.log(chalk.green(`✅ Session '${sessionName}' terminated successfully`));
        
      } catch (error) {
        console.error(chalk.red(`❌ Error terminating tmux session '${sessionName}':`, error));
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