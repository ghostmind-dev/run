import { $, which, fs } from 'zx';
import { config } from 'dotenv';

////////////////////////////////////////////////////////////////////////////////
// DOTENV
////////////////////////////////////////////////////////////////////////////////

config({ override: true });

////////////////////////////////////////////////////////////////////////////////
// STARTING PROGRAM
////////////////////////////////////////////////////////////////////////////////

export * from './lib/command-cluster.mjs';
export * from './lib/command-action.mjs';
export * from './lib/command-compose.mjs';
export * from './lib/command-custom.mjs';
export * from './lib/command-db.mjs';
export * from './lib/command-github.mjs';
export * from './lib/command-docker.mjs';
export * from './lib/command-utils.mjs';
export * from './utils/divers.mjs';
