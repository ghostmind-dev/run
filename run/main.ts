/**
 * @fileoverview Main entry point for @ghostmind/run - A comprehensive DevOps automation toolkit
 *
 * This module provides a complete set of tools for managing Docker containers, GitHub Actions,
 * Terraform infrastructure, HashiCorp Vault, SSH tunnels, and more. It supports both
 * programmatic usage and CLI operations for streamlined development workflows.
 *
 * @example
 * ```typescript
 * import { dockerBuild, dockerComposeUp, actionRunLocal } from "@ghostmind/run";
 *
 * // Build a Docker image
 * await dockerBuild("my-component");
 *
 * // Start Docker Compose services
 * await dockerComposeUp("web-service", { build: true, detach: true });
 *
 * // Run GitHub Action locally
 * await actionRunLocal("test-workflow", [], "push", false, false);
 * ```
 *
 * @module
 */

import { config } from 'npm:dotenv@16.4.5';
import { expand } from 'npm:dotenv-expand@11.0.6';

////////////////////////////////////////////////////////////////////////////////
// DOTEN
////////////////////////////////////////////////////////////////////////////////

expand(config({ override: true }));

////////////////////////////////////////////////////////////////////////////////
// STARTING PROGRAM
////////////////////////////////////////////////////////////////////////////////

export * from './lib/action.ts';
export * from './lib/custom.ts';
export * from './lib/docker.ts';
export * from './lib/machine.ts';
export * from './lib/mcp.ts';
export * from './lib/meta.ts';
export * from './lib/misc.ts';
export * from './lib/routine.ts';
export * from './lib/terraform.ts';
export * from './lib/tmux.ts';
export * from './lib/tunnel.ts';
export * from './lib/vault.ts';

////////////////////////////////////////////////////////////////////////////////
// EXPORT UTILS
////////////////////////////////////////////////////////////////////////////////

export * from './utils/divers.ts';

////////////////////////////////////////////////////////////////////////////////
// THE END
////////////////////////////////////////////////////////////////////////////////
