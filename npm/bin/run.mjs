#!/usr/bin/env node

// run is a Deno program, published on JSR. This npm package is its launcher:
// it runs the JSR release of the same version with the Deno on the PATH (or
// $DENO_BIN), so `npm i -g @ghostmind-dev/run` and the JSR install give the
// same command.

import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
);
const deno = process.env.DENO_BIN || 'deno';
const entry = `jsr:@ghostmind/run@${version}/cmd`;

// Recent Deno refuses a package published in the last 24 hours. This launcher
// asks for one exact release of run (whose own dependencies are pinned), so it
// lets that release through as soon as it is out; older Deno has no such flag.
// (Deno 2.9.7 accepts the flag without listing it, so ask whether it is accepted.)
const ageFlag =
  spawnSync(deno, ['run', '--minimum-dependency-age=0', '--help'], { stdio: 'ignore' })
    .status === 0
    ? ['--minimum-dependency-age=0']
    : [];

const child = spawn(deno, ['run', '--quiet', '--allow-all', ...ageFlag, entry, ...process.argv.slice(2)], {
  stdio: 'inherit',
});

child.on('error', (error) => {
  if (error.code === 'ENOENT') {
    console.error(
      'run needs Deno 2: https://docs.deno.com/runtime/getting_started/installation/\n' +
        '(or set DENO_BIN to the deno executable)'
    );
    process.exit(127);
  }
  console.error(error.message);
  process.exit(1);
});

// Ctrl-C reaches both processes; leave it to deno and exit as it does
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {});
}

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
