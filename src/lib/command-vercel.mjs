import { $, which, sleep, cd, fs } from 'zx';
import core from '@actions/core';
import {
  detectScriptsDirectory,
  verifyIfMetaJsonExists,
} from '../utils/divers.mjs';

import { envDevcontainer } from '../main.mjs';

////////////////////////////////////////////////////////////////////////////////
// MUTE BY DEFAULT
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

////////////////////////////////////////////////////////////////////////////////
// LOGS
////////////////////////////////////////////////////////////////////////////////

async function vercelLogsDeployment(deploymentId) {
  $.verbose = true;

  await $`vercel logs ${deploymentId} --token ${process.env.VERCEL_TOKEN} --debug -f`;
}

////////////////////////////////////////////////////////////////////////////////
// LIST
////////////////////////////////////////////////////////////////////////////////

async function vercelListDeployments() {
  $.verbose = true;

  await $`vercel list --token ${process.env.VERCEL_TOKEN}`;
}

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function vercel(program) {
  const vercel = program.command('vercel');
  vercel.description('manage vercel deployments');

  const vercelList = vercel.command('list');

  vercelList.description('list all deployments').action(vercelListDeployments);

  const vercelLogs = vercel.command('logs');

  vercelLogs
    .description('get logs for a deployment')
    .argument('<deploymentId>', 'deployment id')
    .action(vercelLogsDeployment);
}
