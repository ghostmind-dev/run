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

    Deno.env.set('CLOUDFLARED_TUNNEL_NAME', CLOUDFLARED_TUNNEL_NAME);

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

    // List tunnels and check if the specified tunnel exists
    try {
      const tunnelList = await $`cloudflared tunnel list`;
      const tunnelExists = tunnelList.stdout.includes(CLOUDFLARED_TUNNEL_NAME);

      if (!tunnelExists) {
        console.log(`Creating new tunnel: ${CLOUDFLARED_TUNNEL_NAME}`);
        try {
          await $`cloudflared tunnel create ${CLOUDFLARED_TUNNEL_NAME}`;
          console.log(
            `Successfully created tunnel: ${CLOUDFLARED_TUNNEL_NAME}`
          );
        } catch (createError: any) {
          console.error('Failed to create tunnel:', createError.message);
          Deno.exit(1);
        }
      } else {
        console.log(`Found existing tunnel: ${CLOUDFLARED_TUNNEL_NAME}`);
      }
    } catch (error: any) {
      console.error('Failed to list tunnels:', error.message);
      Deno.exit(1);
    }

    $.verbose = false;

    const CLOUDFLARED_TUNNEL_TOKEN =
      await $`cloudflared tunnel token ${CLOUDFLARED_TUNNEL_NAME}`;

    $.verbose = true;

    if (options.all) {
      const inADevcontainer = Deno.env.get('REMOTE_CONTAINERS');

      const directories = await withMetaMatching({
        property: 'tunnel',
        path: currentPath,
      });

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

    const HOME = Deno.env.get('HOME');

    const configFileName = `${HOME}/.cloudflared/${CLOUDFLARED_TUNNEL_NAME}.config.yaml`;

    await $`rm -f ${configFileName}`;
    const yamlStr = yaml.dump(config);

    await fs.writeFile(configFileName, yamlStr);
    await $`cloudflared tunnel --config ${configFileName} --protocol http2 run --token ${CLOUDFLARED_TUNNEL_TOKEN} ${CLOUDFLARED_TUNNEL_NAME}`;
  });
}
