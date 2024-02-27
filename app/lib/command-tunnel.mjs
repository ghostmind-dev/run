import { $, cd } from 'zx';
import {
  detectScriptsDirectory,
  verifyIfMetaJsonExists,
} from '../utils/divers.mjs';
import { nanoid } from 'nanoid';

////////////////////////////////////////////////////////////////////////////////
// MUTE BY DEFAULT
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

////////////////////////////////////////////////////////////////////////////////
// CONSTANTS
////////////////////////////////////////////////////////////////////////////////

const LOCALHOST_SRC =
  process.env.CODESPACES === 'true'
    ? process.env.SRC
    : process.env.LOCALHOST_SRC;

////////////////////////////////////////////////////////////////////////////////
// RUNNING COMMAND LOCATION
////////////////////////////////////////////////////////////////////////////////

let currentPath = await detectScriptsDirectory(process.cwd());

cd(currentPath);

////////////////////////////////////////////////////////////////////////////////
// CURRENT METADATA
////////////////////////////////////////////////////////////////////////////////

let metaConfig = await verifyIfMetaJsonExists(currentPath);

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function act(program) {
  const tunnel = program.command('tunnel');
  tunnel.description('Run a cloudflared tunnel to a local service');

  const run = tunnel.command('run');
  run.description('Run a cloudflared tunnel to a local service');
  run.action(async () => {
    // print a UUI for the tunnel name
    const tunnelTemporaryName = nanoid(20);
    // run the cloudflared tunnel
    $.verbose = false;

    await $`cloudflared tunnel route dns ${process.env.CLOUDFLARED_TUNNEL_NAME} ${process.env.CLOUDFLARED_TUNNEL_ROUTE} > /dev/null 2>&1`;
    $.verbose = true;

    // create the tunnel.yaml file

    await $`rm -f /home/vscode/.cloudflared/${tunnelTemporaryName}.yaml`;

    // create the tunnel.yaml file

    await $`envsubst '$CLOUDFLARED_TUNNEL_ROUTE' < tunnel.yaml > /home/vscode/.cloudflared/${tunnelTemporaryName}.yaml`;
    await $`cloudflared tunnel --config /home/vscode/.cloudflared/${tunnelTemporaryName}.yaml --protocol http2 run --token ${process.env.CLOUDFLARED_TUNNEL_TOKEN} ${process.env.CLOUDFLARED_TUNNEL_NAME}`;
  });
}
