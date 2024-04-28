import { $, cd, fs } from 'npm:zx';
import {
  detectScriptsDirectory,
  verifyIfMetaJsonExists,
  withMetaMatching,
} from '../utils/divers.ts';
import yaml from 'npm:js-yaml';

////////////////////////////////////////////////////////////////////////////////
// MUTE BY DEFAULT
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

////////////////////////////////////////////////////////////////////////////////
// CONSTANTS
////////////////////////////////////////////////////////////////////////////////

const LOCALHOST_SRC =
  Deno.env.get('CODESPACES') === 'true'
    ? Deno.env.get('SRC')
    : Deno.env.get('LOCALHOST_SRC');

////////////////////////////////////////////////////////////////////////////////
// RUNNING COMMAND LOCATION
////////////////////////////////////////////////////////////////////////////////

const currentPath = await detectScriptsDirectory(Deno.cwd());

cd(currentPath);

////////////////////////////////////////////////////////////////////////////////
// CURRENT METADATA
////////////////////////////////////////////////////////////////////////////////

let metaConfig = await verifyIfMetaJsonExists(currentPath);

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function act(program: any) {
  const tunnel = program.command('tunnel');
  tunnel.description('Run a cloudflared tunnel to a local service');

  const run = tunnel.command('run');
  run.description('Run a cloudflared tunnel to a local service');
  run.option('--all', 'Run all the services');
  run.option('--tunnel <tunnel>', 'Set the tunnel name');
  run.action(async (options: any) => {
    const CLOUDFLARED_TUNNEL_TOKEN = Deno.env.get('CLOUDFLARED_TUNNEL_TOKEN');
    const CLOUDFLARED_TUNNEL_NAME =
      options.tunnel || Deno.env.get('CLOUDFLARED_TUNNEL_NAME');

    const CLOUDFLARED_TUNNEL_URL = Deno.env.get('CLOUDFLARED_TUNNEL_URL') || '';

    let tunnelUrl = CLOUDFLARED_TUNNEL_URL.replace('https://', '');

    interface Ingress {
      // add hostname (optional)
      hostname?: string;
      service: string;
    }

    interface Tunnel {
      tunnel: string;
      ingress: Ingress[];
    }

    let config: Tunnel = {
      tunnel: CLOUDFLARED_TUNNEL_NAME,
      ingress: [],
    };

    $.verbose = true;

    let ingress = [];

    if (options.all) {
      const services = await withMetaMatching({ property: 'tunnel' });

      for (const service of services) {
        const subdomain = service.config.tunnel.hostname;
        const hostname = `${subdomain}.${tunnelUrl}`;

        await $`cloudflared tunnel route dns ${CLOUDFLARED_TUNNEL_NAME} ${hostname}`;
        ingress.push(service.config.tunnel);
      }

      config.ingress = ingress;
    } else {
      let { tunnel } = await verifyIfMetaJsonExists(currentPath);
      let hostname = `${tunnel.hostname}.${tunnelUrl}`;
      await $`cloudflared tunnel route dns ${CLOUDFLARED_TUNNEL_NAME} ${hostname}`;
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
