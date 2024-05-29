import { $, cd } from 'npm:zx@8.1.0';
import Table from 'npm:cli-table3@0.6.5';
import {
  detectScriptsDirectory,
  verifyIfMetaJsonExists,
} from '../utils/divers.ts';

////////////////////////////////////////////////////////////////////////////////
// MUTE BY DEFAULT
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

////////////////////////////////////////////////////////////////////////////////
// RUNNING COMMAND LOCATION
////////////////////////////////////////////////////////////////////////////////

let currentPath = await detectScriptsDirectory(Deno.cwd());

cd(currentPath);

////////////////////////////////////////////////////////////////////////////////
// INIT
////////////////////////////////////////////////////////////////////////////////

export async function appClone(app: string) {
  // git@github.com:ghostmind-dev/templates.git
  // clone this repo in /tmp/templates

  await $`rm -rf /tmp/templates`;

  await $`git clone git@github.com:ghostmind-dev/templates.git /tmp/templates`;

  // read all meta.json in all folders contains in  /tmp/templates/templates
  // pull the name and description

  if (!app) {
    const table = new Table({
      head: ['Name', 'Description'],
    });

    for await (const entry of Deno.readDir('/tmp/templates/templates')) {
      const meta = await verifyIfMetaJsonExists(
        `/tmp/templates/templates/${entry.name}`
      );

      if (meta) {
        table.push([meta.name, meta.description]);
      }
    }

    console.log(table.toString());

    Deno.exit(0);
  }

  // copy the folder to the current directory

  await $`cp -r /tmp/templates/templates/${app} .`;

  console.log(`App ${app} has been cloned`);

  // remove the /tmp/templates

  await $`rm -rf /tmp/templates`;
}

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function app(program: any) {
  const app = program.command('app');
  app.description('init an app');

  const clone = app.command('clone');
  clone.description('clone an app');
  clone.argument('[name]', 'name of the app');
  clone.action(appClone);
}
