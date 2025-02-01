import { $, cd, fs } from 'npm:zx@8.1.0';
import {
  verifyIfMetaJsonExists,
  withMetaMatching,
  setSecretsOnLocal,
} from '../utils/divers.ts';
import yaml from 'npm:js-yaml@4.1.0';

///////////////////////////////////////////////////////////////////////////////
// MUTE BY DEFAULT
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

////////////////////////////////////////////////////////////////////////////////
// RUNNING COMMAND LOCATION
////////////////////////////////////////////////////////////////////////////////

const currentPath = Deno.cwd();

cd(currentPath);

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function tunnel(program: any) {
  const tunnel = program.command('tunnel');
  tunnel.description('Run a cloudflared tunnel to a local service');

  const run = tunnel.command('run');
  run.description('Run a cloudflared tunnel to a local service');
  run.argument('[tunnel]', 'tunnel to run', 'default');
  run.option('--all', 'Run all the services');
  run.option(
    '--name <name>',
    'tunel name (or set via CLOUDFLARED_TUNNEL_NAME) ',
    Deno.env.get('CLOUDFLARED_TUNNEL_NAME') as string
  );
  run.action(async (tunnelToRun: string, options: any) => {
    const CLOUDFLARED_TUNNEL_NAME = options.name;

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

        for (const tunnel in metaConfig.tunnel) {
          await $`cloudflared tunnel route dns ${CLOUDFLARED_TUNNEL_NAME} ${metaConfig.tunnel[tunnel].hostname}`;
          ingress.push({
            hostname: metaConfig.tunnel[tunnel].hostname,
            service: metaConfig.tunnel[tunnel].service,
          });
        }
      }

      config.ingress = ingress;
    } else {
      let { tunnel }: any = await verifyIfMetaJsonExists(currentPath);

      $.verbose = true;
      await $`cloudflared tunnel route dns ${CLOUDFLARED_TUNNEL_NAME} ${tunnel[tunnelToRun].hostname}`;
      ingress.push({
        hostname: tunnel[tunnelToRun].hostname,
        service: tunnel[tunnelToRun].service,
      });
      config.ingress = ingress;
    }
    config.ingress.push({ service: 'http_status:404' });
    console.log(config);
    await $`rm -f /home/vscode/.cloudflared/config.yaml`;
    const yamlStr = yaml.dump(config);

    const CLOUDFLARED_TUNNEL_TOKEN = Deno.env.get('CLOUDFLARED_TUNNEL_TOKEN');
    await fs.writeFile('/home/vscode/.cloudflared/config.yaml', yamlStr);
    await $`cloudflared tunnel --config /home/vscode/.cloudflared/config.yaml --protocol http2 run --token ${CLOUDFLARED_TUNNEL_TOKEN} ${CLOUDFLARED_TUNNEL_NAME}`;
  });
}
