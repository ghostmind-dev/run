import { $, cd, fs } from 'zx';
import {
  detectScriptsDirectory,
  verifyIfMetaJsonExists,
  withMetaMatching,
} from '../utils/divers.mjs';
import * as yaml from 'js-yaml';
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
  const pipeline = program.command('pipeline');
  const tunnel = program.command('tunnel');
  tunnel.description('Run a cloudflared tunnel to a local service');

  const run = tunnel.command('run');
  run.description('Run a cloudflared tunnel to a local service');
  run.option('--all', 'Run all the services');
  run.option('--tunnel <tunnel>', 'Set the tunnel name');
  run.action(async (options) => {
    const CLOUDFLARED_TUNNEL_TOKEN = process.env.CLOUDFLARED_TUNNEL_TOKEN;
    const CLOUDFLARED_TUNNEL_NAME =
      options.tunnel || process.env.CLOUDFLARED_TUNNEL_NAME;

    let config = {
      tunnel: CLOUDFLARED_TUNNEL_NAME,
    };

    $.verbose = true;

    let ingress = [];

    if (options.all) {
      const services = await withMetaMatching({ property: 'tunnel' });

      for (const service of services) {
        await $`cloudflared tunnel route dns ${CLOUDFLARED_TUNNEL_NAME} ${service.config.tunnel.hostname}`;
        ingress.push(service.config.tunnel);
      }

      config.ingress = ingress;
    } else {
      let { tunnel } = await verifyIfMetaJsonExists(currentPath);
      await $`cloudflared tunnel route dns ${CLOUDFLARED_TUNNEL_NAME} ${tunnel.hostname}`;

      ingress.push(tunnel);
      config.ingress = ingress;
    }

    config.ingress.push({ service: 'http_status:404' });

    await $`rm -f /home/vscode/.cloudflared/config.yaml`;

    const yamlStr = yaml.dump(config);

    await fs.writeFile('/home/vscode/.cloudflared/config.yaml', yamlStr);

    await $`cloudflared tunnel --config /home/vscode/.cloudflared/config.yaml --protocol http2 run --token ${CLOUDFLARED_TUNNEL_TOKEN} ${CLOUDFLARED_TUNNEL_NAME}`;
  });
}
