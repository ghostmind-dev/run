import { $, cd, fs } from 'npm:zx';
import {
  detectScriptsDirectory,
  verifyIfMetaJsonExists,
  withMetaMatching,
  setSecretsOnLocal,
} from '../utils/divers.ts';
import yaml from 'npm:js-yaml';

///////////////////////////////////////////////////////////////////////////////
// MUTE BY DEFAULT
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

////////////////////////////////////////////////////////////////////////////////
// RUNNING COMMAND LOCATION
////////////////////////////////////////////////////////////////////////////////

const currentPath = await detectScriptsDirectory(Deno.cwd());

cd(currentPath);

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
      const directories = await withMetaMatching({ property: 'tunnel' });

      for (const directory of directories) {
        cd(directory);
        await setSecretsOnLocal('local');
        const metaConfig: any = await verifyIfMetaJsonExists(directory);

        const subdomain = metaConfig.tunnel.subdomain;

        let hostname = '';
        if (subdomain) {
          hostname = `${subdomain}.${CLOUDFLARED_TUNNEL_URL}`;
        } else {
          hostname = `${CLOUDFLARED_TUNNEL_URL}`;
        }
        // await $`cloudflared tunnel route dns ${CLOUDFLARED_TUNNEL_NAME} ${hostname}`;

        ingress.push({
          hostname,
          service: metaConfig.tunnel.service,
        });
      }

      config.ingress = ingress;
    } else {
      let { tunnel }: any = await verifyIfMetaJsonExists(currentPath);

      let hostname = '';

      let subdomain = tunnel.subdomain;

      if (subdomain) {
        hostname = `${subdomain}.${CLOUDFLARED_TUNNEL_URL}`;
      } else {
        hostname = `${CLOUDFLARED_TUNNEL_URL}`;
      }

      $.verbose = true;

      await $`cloudflared tunnel route dns ${CLOUDFLARED_TUNNEL_NAME} ${hostname}`;
      ingress.push({ hostname, service: tunnel.service });
      config.ingress = ingress;
    }

    config.ingress.push({ service: 'http_status:404' });

    console.log(config);

    await $`rm -f /home/vscode/.cloudflared/config.yaml`;

    const yamlStr = yaml.dump(config);

    await fs.writeFile('/home/vscode/.cloudflared/config.yaml', yamlStr);

    await $`cloudflared tunnel --config /home/vscode/.cloudflared/config.yaml --protocol http2 run --token ${CLOUDFLARED_TUNNEL_TOKEN} ${CLOUDFLARED_TUNNEL_NAME}`;
  });
}
