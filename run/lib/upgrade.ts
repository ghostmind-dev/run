/**
 * @fileoverview Upgrade run to its latest release
 *
 * `run upgrade` finds how this `run` was installed and installs the latest
 * release the same way: `deno install` from JSR, or `npm install -g` for the
 * npm launcher. A `run` that runs a checkout's source is never reinstalled:
 * `git pull` in the checkout is its upgrade. The Claude plugin is updated
 * afterwards, so the skill matches the command.
 *
 * @module
 */

import chalk from 'npm:chalk@5.3.0';
import { $ } from 'npm:zx@8.1.0';
import { realpathSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import denoJson from '../../deno.json' with { type: 'json' };

////////////////////////////////////////////////////////////////////////////////
// INSTALL
////////////////////////////////////////////////////////////////////////////////

/**
 * How the running `run` was installed
 */
export type Install =
  | { kind: 'source'; folder: string }
  | { kind: 'deno' }
  | { kind: 'npm' }
  | { kind: 'unknown' };

/**
 * Find how this `run` was installed: from the module that runs, then from
 * the `run` on the PATH (a JSR release runs the same way under both installs)
 */
export function detectInstall(): Install {
  const main = Deno.mainModule;
  if (main.startsWith('file:')) {
    // run/bin/cmd.ts → the checkout's root
    return { kind: 'source', folder: dirname(dirname(dirname(fileURLToPath(main)))) };
  }

  for (const dir of (Deno.env.get('PATH') ?? '').split(':')) {
    const bin = join(dir, 'run');
    if (!dir || !existsSync(bin)) continue;
    let target: string;
    try {
      target = realpathSync(bin);
    } catch {
      continue;
    }
    if (target.includes('node_modules') || target.endsWith('.mjs')) {
      return { kind: 'npm' };
    }
    try {
      if (readFileSync(target, 'utf8').includes('deno install')) {
        return { kind: 'deno' };
      }
    } catch {
      // not readable: keep looking
    }
  }
  return { kind: 'unknown' };
}

////////////////////////////////////////////////////////////////////////////////
// VERSIONS
////////////////////////////////////////////////////////////////////////////////

/**
 * The latest release of run on JSR
 */
export async function latestVersion(): Promise<string> {
  const response = await fetch('https://jsr.io/@ghostmind/run/meta.json');
  if (!response.ok) {
    throw new Error(`JSR answered ${response.status} for @ghostmind/run`);
  }
  const { latest } = await response.json();
  if (typeof latest !== 'string') throw new Error('JSR gave no latest version');
  return latest;
}

/**
 * Compare two x.y.z versions: negative when a is older than b
 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

////////////////////////////////////////////////////////////////////////////////
// UPGRADE
////////////////////////////////////////////////////////////////////////////////

// Recent Deno refuses a package published in the last 24 hours; an exact
// release is asked for, so let it through. Deno 2.9.7 accepts the flag
// without listing it, so ask whether it is accepted (as the npm launcher does).
async function ageFlag(): Promise<string[]> {
  const probe = await $`deno run --minimum-dependency-age=0 --help`.nothrow().quiet();
  return probe.exitCode === 0 ? ['--minimum-dependency-age=0'] : [];
}

async function upgradePlugin(): Promise<void> {
  const list = await $`claude plugin list`.nothrow().quiet();
  if (list.exitCode !== 0) return;
  const id = list.stdout.match(/\brun@[\w.-]+/)?.[0];
  if (!id) return;
  console.log(chalk.gray(`claude plugin update ${id}`));
  const result = await $`claude plugin update ${id}`.nothrow();
  if (result.exitCode !== 0) {
    console.error(chalk.yellow(`⚠️  the plugin ${id} was not updated`));
    return;
  }
  console.log(chalk.gray('restart the Claude sessions (or /reload-plugins) to load it'));
}

async function upgrade(options: { check?: boolean }): Promise<void> {
  const current = denoJson.version;
  const install = detectInstall();

  if (install.kind === 'source') {
    console.log(`run ${current} runs from the source in ${install.folder}`);
    console.log(chalk.gray('its upgrade is a git pull there'));
    if (!options.check) await upgradePlugin();
    return;
  }

  const latest = await latestVersion();
  if (compareVersions(current, latest) >= 0) {
    console.log(chalk.green(`✔ run ${current} is the latest`));
  } else {
    console.log(`run ${current} → ${chalk.bold(latest)}`);
  }
  if (options.check) return;

  if (compareVersions(current, latest) < 0) {
    $.verbose = true;
    if (install.kind === 'deno') {
      const flags = await ageFlag();
      await $`deno install -g -f --allow-all ${flags} --name run jsr:@ghostmind/run@${latest}/cmd`;
    } else if (install.kind === 'npm') {
      await $`npm install -g @ghostmind-dev/run@${latest}`;
    } else {
      throw new Error(
        'cannot tell how run was installed; reinstall it with\n' +
          `  deno install -g -f --allow-all --name run jsr:@ghostmind/run@${latest}/cmd`
      );
    }
    $.verbose = false;
    console.log(chalk.green(`✔ run ${latest} installed`));
  }

  await upgradePlugin();
}

////////////////////////////////////////////////////////////////////////////////
// COMMAND
////////////////////////////////////////////////////////////////////////////////

export default async function commandUpgrade(program: any): Promise<void> {
  program
    .command('upgrade')
    .description(
      'install the latest release of run the way it was installed (JSR or npm), then update its Claude plugin'
    )
    .option('--check', 'only say whether a newer release is out')
    .action(async (options: { check?: boolean }) => {
      try {
        await upgrade(options);
      } catch (error: any) {
        console.error(chalk.red(`❌ ${error?.message ?? error}`));
        Deno.exit(1);
      }
    });
}
