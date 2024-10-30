import { $ } from 'npm:zx@8.1.0';
import * as inquirer from 'npm:inquirer@9.2.22';
import { createUUID } from '../utils/divers.ts';
import {
  verifyIfMetaJsonExists,
  recursiveDirectoriesDiscovery,
  detectScriptsDirectory,
} from '../utils/divers.ts';
import fs from 'node:fs';

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function misc(program: any) {
  const misc = program.command('misc');
  misc.description('miscellaneous commands');

  ////////////////////////////////////////////////////////////////////////////
  // GIT AWAYE
  ////////////////////////////////////////////////////////////////////////////

  misc
    .command('commit')
    .description('git add,commit,push')
    .action(async () => {
      $.verbose = true;

      const prompt = inquirer.createPromptModule();

      // ask for the commit message

      const { message } = await prompt([
        {
          type: 'input',
          name: 'message',
          message: 'Enter commit message',
        },
      ]);

      const branchRaw = await $`git branch --show-current`;

      const branch = branchRaw.stdout.trim();

      try {
        await $`git add .`;
        await $`git commit -m ${message}`;
        await $`git push origin ${branch}`;
      } catch (e) {
        Deno.exit(0);
        return;
      }

      Deno.exit(0);
    });

  ////////////////////////////////////////////////////////////////////////////
  // GENERATE A UUID
  ////////////////////////////////////////////////////////////////////////////

  misc
    .command('uuid')
    .description('generate a random UUID')
    .argument('[length]', 'length of the UUID')
    .action(async (length: number) => {
      let uuid: string;

      if (length) {
        uuid = await createUUID(length);
        console.log(uuid);
        return;
      }

      uuid = await createUUID();
      console.log(uuid);
    });

  ////////////////////////////////////////////////////////////////////////////
  // ID COLLISION
  ////////////////////////////////////////////////////////////////////////////

  misc
    .command('collision')
    .description('verify if all ids are unique')
    .action(async () => {
      const SRC = Deno.env.get('SRC') || '';

      const folders = await recursiveDirectoriesDiscovery(SRC);

      let ids: string[] = [];

      for (let folder of folders) {
        let meta = await verifyIfMetaJsonExists(folder);

        if (!meta) {
          continue;
        }

        if (ids.includes(meta.id)) {
          console.log(`id collision in ${folder}`);
          Deno.exit(0);
        }

        ids.push(meta.id);
      }

      console.log('No id collision');
    });

  ////////////////////////////////////////////////////////////////////////////
  // GENERATE A UUID
  ////////////////////////////////////////////////////////////////////////////

  misc
    .command('exec')
    .description('initiate an interactive shell in a running devcontainer')

    .argument('[name]', 'name of the devcontainer')
    .action(async (container: string) => {
      try {
        $.verbose = true;

        const meta = await verifyIfMetaJsonExists(Deno.cwd());

        if (!meta && !container) {
          console.log('No meta.json found');
          Deno.exit(0);
        }

        const name = container || meta?.name;

        await $`docker exec -it ${name} /bin/zsh -c "cd /workspaces/${name} && export PROMPT_EOL_MARK='' && zsh"`;
      } catch (e) {
        console.log("Are you sure in the the path of the project's root?");
        Deno.exit(0);
      }
    });

  ////////////////////////////////////////////////////////////////////////////
  // GENERATE A UUID
  ////////////////////////////////////////////////////////////////////////////

  misc
    .command('session')
    .description('reset the tasks related to terminal session in tasks.json')
    .action(async () => {
      try {
        $.verbose = true;

        // const meta = await verifyIfMetaJsonExists(Deno.cwd());

        const SRC = Deno.env.get('SRC') || '';

        const folders = await recursiveDirectoriesDiscovery(SRC);

        let tasks = [];

        tasks.push({
          label: 'home',
          type: 'shell',
          command: `cd ${SRC} && zsh`,
          isBackground: true,
          presentation: {
            reveal: 'always',
            panel: 'dedicated',
            group: 'home',
            clear: true,
          },
          problemMatcher: [],
        });

        let tasksName: string[] = [];
        let appsName: string[] = [];

        appsName.push('home');
        tasksName.push('home');

        for (let folder of folders) {
          let meta = await verifyIfMetaJsonExists(folder);

          if (!meta) {
            continue;
          }

          if (meta.type === 'project') {
            continue;
          }

          appsName.push(meta.name);

          ['run', 'test'].map((task) => {
            tasksName.push(`${meta.name}_${task}`);

            tasks.push({
              label: `${meta.name}_${task}`,
              type: 'shell',
              command: `cd ${folder} && zsh`,
              isBackground: true,
              presentation: {
                reveal: 'always',
                panel: 'dedicated',
                group: `${meta.name}`,
                clear: true,
              },
            });
          });
        }

        appsName.push('collective');

        tasks.push({
          label: 'Open All Terminals',
          type: 'shell',
          dependsOn: tasksName,
          presentation: {
            reveal: 'never',
            group: 'collective',
          },
          runOptions: {
            reevaluateOnRerun: false,
          },
        });
        const tasksJson = Deno.readTextFileSync(`${SRC}/.vscode/tasks.json`);

        let tasksJsonObj = JSON.parse(tasksJson);

        // get takss from the tasks.json file

        let tasksArray = tasksJsonObj.tasks;

        delete tasksJsonObj.tasks;

        let newTaksArray = tasksArray.filter((task: any) => {
          return !appsName.includes(task.presentation.group);
        });

        let finalNewTaksArray = newTaksArray.concat(tasks);

        // write the tasks.json file

        tasksJsonObj.tasks = finalNewTaksArray;

        const tasksJsonString = JSON.stringify(tasksJsonObj, null, 2);

        fs.writeFileSync(`${SRC}/.vscode/tasks.json`, tasksJsonString);
      } catch (e) {
        console.log(e);
        Deno.exit(0);
      }

      // read the tasks.json file
    });

  ////////////////////////////////////////////////////////////////////////////////
  //
  ////////////////////////////////////////////////////////////////////////////////

  misc
    .command('wait')
    .description('wait for a url to be ready')
    .argument('<url>', 'url to wait for')
    .action(async (target: string) => {
      async function isHasuraReady() {
        const url = new URL(target);
        const hostname = url.hostname;
        const port = parseInt(url.port) || 80; // Default to port 80 if not specified

        try {
          const conn = await Deno.connect({ hostname, port });
          conn.close();
          return true;
        } catch {
          return false;
        }
      }

      let ready = await isHasuraReady();
      while (!ready) {
        console.log('Waiting for Hasura to be ready...');
        await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait for 5 seconds before retrying
        ready = await isHasuraReady();
      }

      Deno.exit();
    });
}

////////////////////////////////////////////////////////////////////////////////
// THE END
////////////////////////////////////////////////////////////////////////////////

// Polling function to wait for Hasura to be ready
async function waitForHasura() {}
