import { $, cd } from 'npm:zx@8.1.0';
import * as inquirer from 'npm:inquirer@9.2.22';
import { createUUID } from '../utils/divers.ts';
import {
  verifyIfMetaJsonExists,
  recursiveDirectoriesDiscovery,
  findProjectDirectory,
} from '../utils/divers.ts';
import fs from 'node:fs';
import { Buffer } from 'node:buffer';
import dotenv from 'npm:dotenv@16.5.0';

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
    .command('session')
    .description('reset the tasks related to terminal session in tasks.json')
    .action(async () => {
      try {
        $.verbose = true;
        let currentPath = Deno.cwd();

        const projectPath = await findProjectDirectory(currentPath);

        const SRC = Deno.env.get('SRC') || projectPath;

        if (!SRC) {
          console.log(
            'SRC is not defined. If you are not running inside a run compatible devcontainer, you need to set a project folder (meta.json with type project'
          );
          Deno.exit(0);
        }

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
    .option('--mode <mode>', 'mode of the wait', 'deno')
    .action(async (target: string, options: any) => {
      let mode = options.mode || 'deno';

      async function isUrlReady() {
        if (mode === 'fetch') {
          try {
            const response = await fetch(target);
            return response.ok;
          } catch {
            return false;
          }
        } else {
          const url = new URL(target);
          const hostname = url.hostname;
          const port = parseInt(url.port) || 80;

          try {
            const conn = await Deno.connect({ hostname, port });
            conn.close();
            return true;
          } catch {
            return false;
          }
        }
      }

      let ready = await isUrlReady();
      while (!ready) {
        console.log('Waiting for the url to be ready...');
        await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait for 10 seconds before retrying
        ready = await isUrlReady();
      }

      console.log('URL is ready!');
      Deno.exit(0);
    });

  ////////////////////////////////////////////////////////////////////////////////
  // STOP A PROCESS RUNNING ON A SPECIFIC PORT
  ////////////////////////////////////////////////////////////////////////////////

  misc
    .command('stop')
    .description('stop a process running on a specific port')
    .argument('<port>', 'port to stop')
    .action(async (port: number) => {
      const processExists = (await $`lsof -ti:${port}`.exitCode) === 0;

      if (processExists) {
        console.log(`Found process on port ${port}, killing it...`);
        await $`lsof -ti:${port} | xargs kill -9`;
      } else {
        console.log(`No existing process on port ${port}`);
      }
    });

  ////////////////////////////////////////////////////////////////////////////////
  // GENERATE .env.template
  ////////////////////////////////////////////////////////////////////////////////

  misc
    .command('template')
    .description('generate .env.template')
    .argument('[env]', 'environment file to use', '.env.prod')
    .action(async (env: string) => {
      $.verbose = true;

      await $`rm -f .env.template && cp ${env} .env.template && sed -i 's/=.*/=/' .env.template`;
    });

  ////////////////////////////////////////////////////////////////////////////////
  // GENERATE MCP.JSON
  ////////////////////////////////////////////////////////////////////////////////

  misc
    .command('encode')
    .description('encode a file to base64')
    .argument('<file>', 'file to ')
    .action(async (file: string) => {
      const currentPath = Deno.cwd();

      const content = Deno.readTextFileSync(`${currentPath}/${file}`);
      const base64 = Buffer.from(content).toString('base64');
      console.log(base64);
    });

  ////////////////////////////////////////////////////////////////////////////////
  // GENERATE MCP.JSON
  ////////////////////////////////////////////////////////////////////////////////

  misc
    .command('decode')
    .description('decode a base64 string')
    .argument('<env_name>', 'env file name to decode')
    .argument('<file_name>', 'decode to this file name')
    .action(async (env_name: string, file_name: string) => {
      const currentPath = Deno.cwd();

      const env = Deno.env.get(env_name);

      if (!env) {
        console.log(`${env_name} not found`);
        Deno.exit(0);
      }

      // decode and write to file
      const decoded = Buffer.from(env, 'base64').toString('utf-8');
      Deno.writeTextFileSync(`${currentPath}/${file_name}`, decoded);
      console.log(`${file_name} decoded and written to ${currentPath}`);
    });

  ////////////////////////////////////////////////////////////////////////////////
  // RUN MCP WITH ENVIRONMENT VARIABLES INJECTED
  ////////////////////////////////////////////////////////////////////////////////

  misc
    .command('mcp')
    .description('run any command with environment variables injected')
    .argument('<command>', 'command to run (e.g., npx, deno, node)')
    .argument('[args...]', 'arguments to pass to the command')
    .option('--env <path>', 'path to environment file', '.env')
    .action(async (command: string, args: string[], options: any) => {
      try {
        const envPathInput = options.env || '.env';
        const SRC = Deno.env.get('SRC') || '';

        // Determine if path is absolute or relative
        let envPath: string;
        if (envPathInput.startsWith('/')) {
          // Absolute path - use as is
          envPath = envPathInput;
        } else {
          // Relative path - prepend with SRC
          envPath = SRC ? `${SRC}/${envPathInput}` : envPathInput;
        }

        // Check if env file exists before trying to load it
        try {
          await Deno.stat(envPath);
          console.error(`Loading environment variables from: ${envPath}`);
          dotenv.config({ path: envPath });
        } catch {
          console.error(
            `Environment file ${envPath} not found, proceeding without loading env vars`
          );
        }

        console.error(`Running: ${command} ${args.join(' ')}`);

        // Spawn the process with the specified command and arguments
        const process = new Deno.Command(command, {
          args: args,
          stdin: 'piped',
          stdout: 'piped',
          stderr: 'piped',
          env: Deno.env.toObject(), // Pass all environment variables
        });

        const child = process.spawn();

        // Forward stdin from parent to child
        Deno.stdin.readable.pipeTo(child.stdin);

        // Forward stdout from child to parent
        child.stdout.pipeTo(Deno.stdout.writable);

        // Forward stderr from child to parent
        child.stderr.pipeTo(Deno.stderr.writable);

        // Wait for the child process to complete
        const status = await child.status;

        // Exit with the same code as the child process
        Deno.exit(status.code);
      } catch (error) {
        console.error(`Error running command '${command}':`, error);
        Deno.exit(1);
      }
    });
}

////////////////////////////////////////////////////////////////////////////////
// THE END
////////////////////////////////////////////////////////////////////////////////
