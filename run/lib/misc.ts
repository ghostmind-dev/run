/**
 * @fileoverview Miscellaneous utility commands module for @ghostmind/run
 *
 * This module provides various utility commands including Git operations,
 * UUID generation, process management, file encoding/decoding, and more.
 *
 * @module
 */

import { $, cd } from 'npm:zx@8.1.0';
import * as inquirer from 'npm:inquirer@9.2.22';
import dotenv from 'npm:dotenv@16.5.0';
import { createUUID } from '../utils/divers.ts';
import {
  verifyIfMetaJsonExists,
  recursiveDirectoriesDiscovery,
  findProjectDirectory,
} from '../utils/divers.ts';
import fs from 'node:fs';
import { Buffer } from 'node:buffer';

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
  // GENERATE BEARER TOKEN
  ////////////////////////////////////////////////////////////////////////////

  misc
    .command('token')
    .description('generate a 32 bytes token')
    .action(async () => {
      $.verbose = false;
      const result = await $`openssl rand -hex 32`;
      const token = result.stdout.trim();

      console.log(token);
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
    .description('generate .env.template based on existing environment files')
    .action(async () => {
      $.verbose = true;

      const currentPath = Deno.cwd();

      // Check if meta.json exists and has secrets configuration
      let meta: any = null;
      let baseFile: string | null = null;

      try {
        const metaContent = Deno.readTextFileSync(`${currentPath}/meta.json`);
        meta = JSON.parse(metaContent);
        if (meta && meta.secrets && meta.secrets.base) {
          baseFile = `.env.${meta.secrets.base}`;
        }
      } catch (e) {
        console.log('No meta.json found or no secrets configuration');
      }

      // Helper function to parse env file into key-value pairs
      function parseEnvFile(filePath: string): Record<string, string> {
        try {
          const content = Deno.readTextFileSync(`${currentPath}/${filePath}`);
          const vars: Record<string, string> = {};

          content.split('\n').forEach((line) => {
            line = line.trim();
            if (line && !line.startsWith('#')) {
              const [key, ...valueParts] = line.split('=');
              if (key) {
                vars[key.trim()] = valueParts.join('=').trim();
              }
            }
          });

          return vars;
        } catch (e) {
          return {};
        }
      }

      // Discover all .env.* files (excluding .env.template)
      const discoveredEnvFiles: string[] = [];
      try {
        for await (const dirEntry of Deno.readDir(currentPath)) {
          if (
            dirEntry.isFile &&
            dirEntry.name.startsWith('.env.') &&
            dirEntry.name !== '.env.template'
          ) {
            discoveredEnvFiles.push(dirEntry.name);
          }
        }
      } catch (e) {
        console.log('Error reading directory:', e);
      }

      console.log(
        `Discovered environment files: ${discoveredEnvFiles.join(', ')}`
      );

      // Parse base file if it exists
      const baseVars: Record<string, string> = {};
      if (baseFile) {
        const parsedBase = parseEnvFile(baseFile);
        if (Object.keys(parsedBase).length > 0) {
          Object.assign(baseVars, parsedBase);
          console.log(`Using base secrets file: ${baseFile}`);
        } else {
          console.log(`Base file ${baseFile} not found or empty`);
          baseFile = null;
        }
      }

      // Parse all discovered environment files (excluding base file)
      const envVars: Record<string, Record<string, string>> = {};
      const nonBaseFiles = discoveredEnvFiles.filter(
        (file) => file !== baseFile
      );

      for (const envFile of nonBaseFiles) {
        const envName = envFile.replace('.env.', '');
        const parsedVars = parseEnvFile(envFile);
        if (Object.keys(parsedVars).length > 0) {
          envVars[envName] = parsedVars;
        }
      }

      // Check if we have any files to work with
      if (
        Object.keys(baseVars).length === 0 &&
        Object.keys(envVars).length === 0
      ) {
        console.log(
          'No environment files found! Please create at least one .env.* file'
        );
        Deno.exit(1);
      }

      // Find common variables (present in all environment files, excluding base)
      const allEnvKeys = Object.values(envVars).map((vars) =>
        Object.keys(vars)
      );
      let commonKeys: string[] = [];

      if (allEnvKeys.length > 1) {
        commonKeys = allEnvKeys.reduce((common, keys) => {
          return common.filter((key) => keys.includes(key));
        }, allEnvKeys[0] || []);
      }

      // Find environment-specific variables
      const envSpecificKeys: Record<string, string[]> = {};
      for (const [envName, vars] of Object.entries(envVars)) {
        envSpecificKeys[envName] = Object.keys(vars).filter(
          (key) =>
            !commonKeys.includes(key) && !Object.keys(baseVars).includes(key)
        );
      }

      // Generate the template content
      let templateContent = '';

      // Base secrets section
      if (Object.keys(baseVars).length > 0) {
        templateContent += `# ============================================================================\n`;
        templateContent += `# BASE SECRETS (from ${baseFile})\n`;
        templateContent += `# Common secrets used across all environments\n`;
        templateContent += `# ============================================================================\n\n`;

        for (const key of Object.keys(baseVars)) {
          templateContent += `${key}=\n`;
        }
        templateContent += '\n';
      }

      // Common environment variables section
      if (commonKeys.length > 0) {
        templateContent += `# ============================================================================\n`;
        templateContent += `# COMMON ENVIRONMENT VARIABLES\n`;
        templateContent += `# Variables present in all environment files\n`;
        templateContent += `# ============================================================================\n\n`;

        for (const key of commonKeys) {
          templateContent += `${key}=\n`;
        }
        templateContent += '\n';
      }

      // Environment-specific sections
      for (const [envName, keys] of Object.entries(envSpecificKeys)) {
        if (keys.length > 0) {
          templateContent += `# ============================================================================\n`;
          templateContent += `# ${envName.toUpperCase()}-SPECIFIC VARIABLES\n`;
          templateContent += `# Variables unique to the ${envName} environment\n`;
          templateContent += `# ============================================================================\n\n`;

          for (const key of keys) {
            templateContent += `${key}=\n`;
          }
          templateContent += '\n';
        }
      }

      // If we only have one environment file and no base, just create a simple template
      if (
        Object.keys(baseVars).length === 0 &&
        Object.keys(envVars).length === 1
      ) {
        const singleEnvName = Object.keys(envVars)[0];
        const singleEnvVars = envVars[singleEnvName];

        templateContent = `# ============================================================================\n`;
        templateContent += `# ENVIRONMENT VARIABLES (from .env.${singleEnvName})\n`;
        templateContent += `# ============================================================================\n\n`;

        for (const key of Object.keys(singleEnvVars)) {
          templateContent += `${key}=\n`;
        }
        templateContent += '\n';
      }

      // Add final divider comment section
      templateContent += `# ============================================================================\n`;
      templateContent += `# END OF TEMPLATE\n`;
      templateContent += `# ============================================================================\n`;

      // Write the template file
      Deno.writeTextFileSync(`${currentPath}/.env.template`, templateContent);
      console.log('Enhanced .env.template generated successfully!');

      // Log summary
      console.log(`\nTemplate Summary:`);
      if (Object.keys(baseVars).length > 0) {
        console.log(`- Base secrets: ${Object.keys(baseVars).length}`);
      }
      if (commonKeys.length > 0) {
        console.log(`- Common variables: ${commonKeys.length}`);
      }
      for (const [envName, keys] of Object.entries(envSpecificKeys)) {
        if (keys.length > 0) {
          console.log(`- ${envName}-specific: ${keys.length}`);
        }
      }

      if (
        Object.keys(envVars).length === 1 &&
        Object.keys(baseVars).length === 0
      ) {
        const singleEnvName = Object.keys(envVars)[0];
        console.log(
          `- Single environment (${singleEnvName}): ${
            Object.keys(envVars[singleEnvName]).length
          }`
        );
      }
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
  // PRINT ENVIRONMENT VARIABLE
  ////////////////////////////////////////////////////////////////////////////////

  misc
    .command('env')
    .description('print the value of an environment variable')
    .argument('<variable>', 'environment variable name')
    .action((variable: string) => {
      const value = Deno.env.get(variable);
      if (value !== undefined) {
        console.log(value);
      } else {
        console.log(`Environment variable '${variable}' is not set`);
      }
    });

  ////////////////////////////////////////////////////////////////////////////////
  // RUN NATIVE COMMAND WITH ENVIRONMENT VARIABLES INJECTED
  ////////////////////////////////////////////////////////////////////////////////

  misc
    .command('cmd')
    .description('run any native command with environment variables injected')
    .argument(
      '<command>',
      'full command to run (wrap in quotes if it contains spaces or special characters)'
    )
    .option('--env <path>', 'path to environment file', '.env')
    .action(async (commandString: string, options: any) => {
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

        console.error(`Running: ${commandString}`);

        // Parse the command string into command and arguments
        // This is a simple split - for more complex parsing, we might need a proper shell parser
        const parts = commandString
          .split(' ')
          .filter((part) => part.length > 0);
        const command = parts[0];
        const args = parts.slice(1);

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
        console.error(`Error running command '${commandString}':`, error);
        Deno.exit(1);
      }
    });
}

////////////////////////////////////////////////////////////////////////////////
// THE END
////////////////////////////////////////////////////////////////////////////////
