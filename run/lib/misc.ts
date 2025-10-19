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

  ////////////////////////////////////////////////////////////////////////////////
  // INSTALL VSCODE/CURSOR EXTENSIONS
  ////////////////////////////////////////////////////////////////////////////////

  misc
    .command('extensions')
    .description(
      'install VSCode/Cursor extensions from ghostmind-dev/config repository'
    )
    .action(async () => {
      $.verbose = true;

      try {
        console.log(
          'Fetching extensions list from ghostmind-dev/config repository...'
        );

        // Fetch extensions list from GitHub
        const response = await fetch(
          'https://raw.githubusercontent.com/ghostmind-dev/config/main/config/vscode/extensions.json'
        );

        if (!response.ok) {
          console.log('Failed to fetch extensions list');
          Deno.exit(1);
        }

        const extensions = await response.json();

        if (!Array.isArray(extensions)) {
          console.log('Invalid extensions format - expected JSON array');
          Deno.exit(1);
        }

        // Determine which IDE we're using
        const homeDir = Deno.env.get('HOME') || '';
        let ideCommand = '';

        try {
          await Deno.stat(`${homeDir}/.cursor-server`);
          ideCommand = 'cursor';
          console.log('Detected Cursor IDE');
        } catch {
          try {
            await Deno.stat(`${homeDir}/.vscode-server`);
            ideCommand = 'code';
            console.log('Detected VS Code IDE');
          } catch {
            console.log('Could not detect IDE, defaulting to code');
            ideCommand = 'code';
          }
        }

        console.log(`Installing ${extensions.length} extensions...`);

        // Install each extension
        for (const extension of extensions) {
          console.log(`Installing extension: ${extension}`);
          try {
            await $`${ideCommand} --install-extension=${extension}`;
          } catch (error: any) {
            console.log(`Failed to install ${extension}: ${error.message}`);
          }
        }

        console.log('Extension installation complete!');
      } catch (error: any) {
        console.log(`Error: ${error.message}`);
        Deno.exit(1);
      }
    });

  ////////////////////////////////////////////////////////////////////////////////
  // ISOLATE CURRENT DIRECTORY
  ////////////////////////////////////////////////////////////////////////////////

  misc
    .command('isolate')
    .description(
      'isolate current directory by hiding all other directories in IDE'
    )
    .option(
      '--ignore-folders <folders>',
      'comma-separated list of folders to never exclude',
      ''
    )
    .option(
      '--ignore-files <files>',
      'comma-separated list of files to never exclude',
      ''
    )
    .action(async (options: any) => {
      try {
        const homeDir = Deno.env.get('HOME') || '';
        const currentPath = Deno.cwd();
        const SRC = Deno.env.get('SRC') || '';

        if (!SRC) {
          console.log('SRC environment variable not set');
          Deno.exit(1);
        }

        // Make sure currentPath is within SRC
        if (!currentPath.startsWith(SRC)) {
          console.log(`Current path ${currentPath} is not within SRC ${SRC}`);
          Deno.exit(1);
        }

        // Determine IDE and settings path
        let settingsPath = '';
        let ideType = '';

        try {
          await Deno.stat(`${homeDir}/.cursor-server`);
          settingsPath = `${homeDir}/.cursor-server/data/Machine/settings.json`;
          ideType = 'Cursor';
        } catch {
          try {
            await Deno.stat(`${homeDir}/.vscode-server`);
            settingsPath = `${homeDir}/.vscode-server/data/Machine/settings.json`;
            ideType = 'VS Code';
          } catch {
            console.log('Could not detect IDE (Cursor or VS Code)');
            Deno.exit(1);
          }
        }

        console.log(`Detected ${ideType} IDE`);
        console.log(`Settings path: ${settingsPath}`);

        // Read current settings
        let settings: any = {};
        try {
          const settingsContent = Deno.readTextFileSync(settingsPath);
          settings = JSON.parse(settingsContent);
        } catch (error: any) {
          console.log(`Creating new settings file...`);
          settings = {};
        }

        // Initialize files.exclude if it doesn't exist (using standard property name)
        if (!settings['files.exclude']) {
          settings['files.exclude'] = {};
        }

        // Merge files.excluded into files.exclude if it exists (handle both property names)
        if (settings['files.excluded']) {
          settings['files.exclude'] = {
            ...settings['files.exclude'],
            ...settings['files.excluded'],
          };
          delete settings['files.excluded'];
        }

        // Parse ignore options
        const ignoreFolders = options.ignoreFolders
          ? options.ignoreFolders.split(',').map((f: string) => f.trim())
          : [];
        const ignoreFiles = options.ignoreFiles
          ? options.ignoreFiles.split(',').map((f: string) => f.trim())
          : [];

        // Always ignore .vscode folder (but allow .github to be excluded)
        const defaultIgnoreFolders = ['.vscode'];
        const allIgnoreFolders = [...defaultIgnoreFolders, ...ignoreFolders];

        if (allIgnoreFolders.length > 0) {
          console.log(`Ignoring folders: ${allIgnoreFolders.join(', ')}`);
        }
        if (ignoreFiles.length > 0) {
          console.log(`Ignoring files: ${ignoreFiles.join(', ')}`);
        }

        // Get relative path from SRC to current directory
        const relativePath = currentPath.replace(SRC, '').replace(/^\//, '');
        const pathParts = relativePath
          .split('/')
          .filter((part) => part.length > 0);

        console.log(`Current path relative to SRC: ${relativePath}`);
        console.log(`Isolating path: ${pathParts.join(' -> ')}`);

        // Function to recursively exclude directories at each level
        const excludeAtLevel = async (
          basePath: string,
          currentParts: string[],
          level: number = 0
        ) => {
          try {
            for await (const entry of Deno.readDir(basePath)) {
              const entryPath = `${basePath}/${entry.name}`;
              const relativePath = entryPath.replace(SRC + '/', '');

              // First, check if this item should be ignored (protected)
              let shouldIgnore = false;

              // Check folder ignores
              if (entry.isDirectory && allIgnoreFolders.includes(entry.name)) {
                shouldIgnore = true;
              }

              // Check file ignores
              if (entry.isFile && ignoreFiles.includes(entry.name)) {
                shouldIgnore = true;
              }

              if (shouldIgnore) {
                console.log(`Ignoring: ${relativePath}`);
                continue;
              }

              // If this is part of our current path, recurse into it
              if (
                level < currentParts.length &&
                entry.name === currentParts[level]
              ) {
                if (entry.isDirectory && level < currentParts.length - 1) {
                  await excludeAtLevel(entryPath, currentParts, level + 1);
                }
              } else {
                // This is not part of our current path, so exclude it

                // Check for existing patterns that might conflict
                let shouldExclude = true;
                const existingKeys = Object.keys(settings['files.exclude']);

                for (const existingKey of existingKeys) {
                  // Check if the existing pattern would conflict with our new pattern (exact match)
                  if (existingKey === relativePath) {
                    shouldExclude = false;
                    break;
                  }
                  // Check if this path is already covered by an existing glob pattern
                  if (existingKey.includes('**/')) {
                    const globPattern = existingKey.replace('**/', '');
                    // Only match if the path ends with the glob pattern (more precise matching)
                    if (
                      relativePath === globPattern ||
                      relativePath.endsWith('/' + globPattern)
                    ) {
                      shouldExclude = false;
                      break;
                    }
                  }
                }

                if (shouldExclude) {
                  settings['files.exclude'][relativePath] = true;
                  console.log(`Excluding: ${relativePath}`);
                }
              }
            }
          } catch (error: any) {
            console.log(
              `Could not read directory ${basePath}: ${error.message}`
            );
          }
        };

        // Start exclusion process from SRC
        await excludeAtLevel(SRC, pathParts);

        // Write settings back
        const settingsJson = JSON.stringify(settings, null, 2);
        Deno.writeTextFileSync(settingsPath, settingsJson);

        console.log(`Successfully isolated current directory: ${currentPath}`);
        console.log(`Updated ${ideType} settings`);
        console.log(`Restart your IDE to see the changes`);
      } catch (error: any) {
        console.log(`Error: ${error.message}`);
        Deno.exit(1);
      }
    });

  ////////////////////////////////////////////////////////////////////////////////
  // RESTORE DEFAULT EXCLUSIONS
  ////////////////////////////////////////////////////////////////////////////////

  misc
    .command('restore')
    .description('restore default file exclusions from remote config')
    .action(async () => {
      try {
        const homeDir = Deno.env.get('HOME') || '';

        // Determine IDE and settings path
        let settingsPath = '';
        let ideType = '';

        try {
          await Deno.stat(`${homeDir}/.cursor-server`);
          settingsPath = `${homeDir}/.cursor-server/data/Machine/settings.json`;
          ideType = 'Cursor';
        } catch {
          try {
            await Deno.stat(`${homeDir}/.vscode-server`);
            settingsPath = `${homeDir}/.vscode-server/data/Machine/settings.json`;
            ideType = 'VS Code';
          } catch {
            console.log('Could not detect IDE (Cursor or VS Code)');
            Deno.exit(1);
          }
        }

        console.log(`Detected ${ideType} IDE`);
        console.log(`Settings path: ${settingsPath}`);

        // Fetch remote settings
        console.log('Fetching default exclusions from remote config...');
        const remoteUrl =
          'https://raw.githubusercontent.com/ghostmind-dev/config/main/config/vscode/settings.static.json';

        const response = await fetch(remoteUrl);
        if (!response.ok) {
          console.log(
            `Failed to fetch remote config: ${response.status} ${response.statusText}`
          );
          Deno.exit(1);
        }

        const remoteSettings = await response.json();

        if (!remoteSettings['files.exclude']) {
          console.log('No files.exclude property found in remote config');
          Deno.exit(1);
        }

        console.log(
          `Found ${
            Object.keys(remoteSettings['files.exclude']).length
          } default exclusions`
        );

        // Read current local settings
        let localSettings: any = {};
        try {
          const settingsContent = Deno.readTextFileSync(settingsPath);
          localSettings = JSON.parse(settingsContent);
        } catch (error: any) {
          console.log(`Creating new settings file...`);
          localSettings = {};
        }

        // Override files.exclude with remote version
        localSettings['files.exclude'] = remoteSettings['files.exclude'];

        // Remove any files.excluded property if it exists
        if (localSettings['files.excluded']) {
          delete localSettings['files.excluded'];
        }

        // Write settings back
        const settingsJson = JSON.stringify(localSettings, null, 2);
        Deno.writeTextFileSync(settingsPath, settingsJson);

        console.log(`Successfully restored default file exclusions`);
        console.log(`Updated ${ideType} settings`);
        console.log(`Restart your IDE to see the changes`);

        // Show what was restored
        const exclusions = Object.keys(remoteSettings['files.exclude']);
        console.log(`\nRestored exclusions:`);
        exclusions.forEach((exclusion) => {
          console.log(`  - ${exclusion}`);
        });
      } catch (error: any) {
        console.log(`Error: ${error.message}`);
        Deno.exit(1);
      }
    });

  ////////////////////////////////////////////////////////////////////////////////
  // INVERT FILE EXCLUSIONS BASED ON MAJORITY
  ////////////////////////////////////////////////////////////////////////////////

  misc
    .command('invert')
    .description('invert all file.exclude values based on majority rule')
    .option(
      '--workspace',
      'target workspace .vscode/settings.json instead of global IDE settings'
    )
    .action(async (options: any) => {
      try {
        let settingsPath = '';
        let settingsType = '';

        if (options.workspace) {
          // Target workspace settings
          const currentPath = Deno.cwd();
          settingsPath = `${currentPath}/.vscode/settings.json`;
          settingsType = 'workspace';
          console.log(`Targeting workspace settings`);
        } else {
          // Target global IDE settings (original behavior)
          const homeDir = Deno.env.get('HOME') || '';

          try {
            await Deno.stat(`${homeDir}/.cursor-server`);
            settingsPath = `${homeDir}/.cursor-server/data/Machine/settings.json`;
            settingsType = 'Cursor global';
          } catch {
            try {
              await Deno.stat(`${homeDir}/.vscode-server`);
              settingsPath = `${homeDir}/.vscode-server/data/Machine/settings.json`;
              settingsType = 'VS Code global';
            } catch {
              console.log('Could not detect IDE (Cursor or VS Code)');
              Deno.exit(1);
            }
          }
          console.log(`Targeting ${settingsType} settings`);
        }

        console.log(`Settings path: ${settingsPath}`);

        // Read current settings
        let settings: any = {};
        try {
          const settingsContent = Deno.readTextFileSync(settingsPath);
          settings = JSON.parse(settingsContent);
        } catch (error: any) {
          console.log('No settings file found - nothing to invert');
          Deno.exit(0);
        }

        // Check if files.exclude exists
        if (
          !settings['files.exclude'] ||
          Object.keys(settings['files.exclude']).length === 0
        ) {
          console.log(
            'No files.exclude property found or it is empty - nothing to invert'
          );
          Deno.exit(0);
        }

        const excludeEntries = settings['files.exclude'];
        const totalEntries = Object.keys(excludeEntries).length;

        console.log(`Found ${totalEntries} file exclusion entries`);

        // Count true and false values
        let trueCount = 0;
        let falseCount = 0;

        for (const [key, value] of Object.entries(excludeEntries)) {
          if (value === true) {
            trueCount++;
          } else if (value === false) {
            falseCount++;
          }
        }

        console.log(`True values: ${trueCount}, False values: ${falseCount}`);

        if (trueCount === 0 && falseCount === 0) {
          console.log(
            'No boolean values found in files.exclude - nothing to invert'
          );
          Deno.exit(0);
        }

        // Determine majority and what to flip to
        const majorityIsTrue = trueCount > falseCount;
        const majorityIsFalse = falseCount > trueCount;

        // If majority is false, flip all to true. If majority is true, flip all to false.
        // If tied, default to flipping all to true
        let flipToValue: boolean;
        if (majorityIsFalse) {
          flipToValue = true;
        } else if (majorityIsTrue) {
          flipToValue = false;
        } else {
          // Tie case - default to true
          flipToValue = true;
        }

        console.log(`True: ${trueCount}, False: ${falseCount}`);
        console.log(
          `Majority is ${
            majorityIsTrue ? 'true' : majorityIsFalse ? 'false' : 'tied'
          }, flipping all values to ${flipToValue}`
        );

        // Flip all values
        let changedCount = 0;
        for (const key of Object.keys(excludeEntries)) {
          const oldValue = excludeEntries[key];
          if (typeof oldValue === 'boolean') {
            excludeEntries[key] = flipToValue;
            changedCount++;
          }
        }

        // Write settings back
        const settingsJson = JSON.stringify(settings, null, 2);
        Deno.writeTextFileSync(settingsPath, settingsJson);

        console.log(
          `Successfully inverted ${changedCount} file exclusion entries`
        );
        console.log(`Updated ${settingsType} settings`);
        console.log(`Restart your IDE to see the changes`);
      } catch (error: any) {
        console.log(`Error: ${error.message}`);
        Deno.exit(1);
      }
    });

  ////////////////////////////////////////////////////////////////////////////////
  // ALIGN ALL FILE EXCLUSIONS TO OVERALL MAJORITY
  ////////////////////////////////////////////////////////////////////////////////

  misc
    .command('align')
    .description(
      'align both global and workspace file.exclude values to overall majority'
    )
    .action(async () => {
      try {
        const homeDir = Deno.env.get('HOME') || '';
        const currentPath = Deno.cwd();

        // Define settings paths
        let globalSettingsPath = '';
        let globalSettingsType = '';

        // Determine global IDE settings path
        try {
          await Deno.stat(`${homeDir}/.cursor-server`);
          globalSettingsPath = `${homeDir}/.cursor-server/data/Machine/settings.json`;
          globalSettingsType = 'Cursor global';
        } catch {
          try {
            await Deno.stat(`${homeDir}/.vscode-server`);
            globalSettingsPath = `${homeDir}/.vscode-server/data/Machine/settings.json`;
            globalSettingsType = 'VS Code global';
          } catch {
            console.log('Could not detect IDE (Cursor or VS Code)');
            Deno.exit(1);
          }
        }

        const workspaceSettingsPath = `${currentPath}/.vscode/settings.json`;

        console.log(`Global settings: ${globalSettingsPath}`);
        console.log(`Workspace settings: ${workspaceSettingsPath}`);

        // Read both settings files
        let globalSettings: any = {};
        let workspaceSettings: any = {};

        // Read global settings
        try {
          const globalContent = Deno.readTextFileSync(globalSettingsPath);
          globalSettings = JSON.parse(globalContent);
        } catch (error: any) {
          console.log('No global settings file found');
        }

        // Read workspace settings
        try {
          const workspaceContent = Deno.readTextFileSync(workspaceSettingsPath);
          workspaceSettings = JSON.parse(workspaceContent);
        } catch (error: any) {
          console.log('No workspace settings file found');
        }

        // Collect all file exclusion entries from both files
        const globalExclusions = globalSettings['files.exclude'] || {};
        const workspaceExclusions = workspaceSettings['files.exclude'] || {};

        const globalEntries = Object.keys(globalExclusions).length;
        const workspaceEntries = Object.keys(workspaceExclusions).length;
        const totalEntries = globalEntries + workspaceEntries;

        if (totalEntries === 0) {
          console.log('No files.exclude entries found in either settings file');
          Deno.exit(0);
        }

        console.log(
          `Found ${globalEntries} global exclusions, ${workspaceEntries} workspace exclusions`
        );
        console.log(`Total entries: ${totalEntries}`);

        // Count true and false values across both files
        let totalTrueCount = 0;
        let totalFalseCount = 0;

        // Count global exclusions
        for (const [key, value] of Object.entries(globalExclusions)) {
          if (value === true) {
            totalTrueCount++;
          } else if (value === false) {
            totalFalseCount++;
          }
        }

        // Count workspace exclusions
        for (const [key, value] of Object.entries(workspaceExclusions)) {
          if (value === true) {
            totalTrueCount++;
          } else if (value === false) {
            totalFalseCount++;
          }
        }

        console.log(
          `Combined totals - True: ${totalTrueCount}, False: ${totalFalseCount}`
        );

        if (totalTrueCount === 0 && totalFalseCount === 0) {
          console.log('No boolean values found in either settings file');
          Deno.exit(0);
        }

        // Determine overall majority
        const overallMajorityIsTrue = totalTrueCount > totalFalseCount;
        const alignToValue = overallMajorityIsTrue;

        console.log(
          `Overall majority is ${
            overallMajorityIsTrue ? 'true' : 'false'
          }, aligning all values to ${alignToValue}`
        );

        let globalChangedCount = 0;
        let workspaceChangedCount = 0;

        // Update global settings
        if (Object.keys(globalExclusions).length > 0) {
          for (const key of Object.keys(globalExclusions)) {
            const oldValue = globalExclusions[key];
            if (typeof oldValue === 'boolean') {
              globalExclusions[key] = alignToValue;
              globalChangedCount++;
            }
          }

          // Write global settings back
          const globalSettingsJson = JSON.stringify(globalSettings, null, 2);
          Deno.writeTextFileSync(globalSettingsPath, globalSettingsJson);
          console.log(`Updated ${globalChangedCount} global exclusions`);
        }

        // Update workspace settings
        if (Object.keys(workspaceExclusions).length > 0) {
          for (const key of Object.keys(workspaceExclusions)) {
            const oldValue = workspaceExclusions[key];
            if (typeof oldValue === 'boolean') {
              workspaceExclusions[key] = alignToValue;
              workspaceChangedCount++;
            }
          }

          // Write workspace settings back
          const workspaceSettingsJson = JSON.stringify(
            workspaceSettings,
            null,
            2
          );
          Deno.writeTextFileSync(workspaceSettingsPath, workspaceSettingsJson);
          console.log(`Updated ${workspaceChangedCount} workspace exclusions`);
        }

        console.log(
          `Successfully aligned ${
            globalChangedCount + workspaceChangedCount
          } total file exclusion entries`
        );
        console.log(
          `Updated both ${globalSettingsType} and workspace settings`
        );
        console.log(`Restart your IDE to see the changes`);
      } catch (error: any) {
        console.log(`Error: ${error.message}`);
        Deno.exit(1);
      }
    });

  ////////////////////////////////////////////////////////////////////////////////
  // SSH
  ////////////////////////////////////////////////////////////////////////////////

  misc
    .command('ssh')
    .description('remote ssh helper')
    .argument('<config>', 'SSH config name')
    .argument('<command>', 'Command to run')
    .action(async (config: string, command: string) => {
      // to simplyfy the command, we will use the following format:
      // "ssh m3 -t 'cd ${LOCALHOST_SRC}/city;run routine host_playwright; exec $SHELL -l'"

      $.verbose = true;

      const currentPath = Deno.cwd();

      // we need to run the command relative to $LOCALHOST_SRC

      // currentPath is based on $SRC

      const SRC = Deno.env.get('SRC') || '';
      const LOCALHOST_SRC = Deno.env.get('LOCALHOST_SRC') || '';

      const relativePath = currentPath.replace(SRC, '').replace(/^\//, '');
      const targetPath = `${LOCALHOST_SRC}/${relativePath}`;

      const sshCommand = `cd ${targetPath}; ${command}; exec $SHELL -l`;

      await $`ssh ${config} -t ${sshCommand}`;
    });
  ////////////////////////////////////////////////////////////////////////////////
  // MCP SERVERS
  ////////////////////////////////////////////////////////////////////////////////

  misc
    .command('mcps')
    .description(
      'synchronize MCP servers from $HOME/.claude.json to .claude/.claude.json'
    )
    .action(async () => {
      try {
        const homeDir = Deno.env.get('HOME');
        if (!homeDir) {
          console.error('❌ HOME environment variable not set');
          Deno.exit(1);
        }

        const currentPath = Deno.cwd();
        const sourceFile = `${homeDir}/.claude.json`;
        const targetFile = `${currentPath}/.claude/.claude.json`;

        console.log(`📂 Source: ${sourceFile}`);
        console.log(`📂 Target: ${targetFile}`);

        // Read source file
        let sourceConfig: any;
        try {
          const sourceContent = Deno.readTextFileSync(sourceFile);
          sourceConfig = JSON.parse(sourceContent);
        } catch (error: any) {
          console.error(`❌ Failed to read source file: ${error.message}`);
          Deno.exit(1);
        }

        // Check if mcpServers exists in source
        if (!sourceConfig.mcpServers) {
          console.log('⚠️  No mcpServers property found in source file');
          Deno.exit(0);
        }

        const mcpServersCount = Object.keys(sourceConfig.mcpServers).length;
        console.log(`🔍 Found ${mcpServersCount} MCP servers in source`);

        // Read target file
        let targetConfig: any;
        try {
          const targetContent = Deno.readTextFileSync(targetFile);
          targetConfig = JSON.parse(targetContent);
        } catch (error: any) {
          console.error(`❌ Failed to read target file: ${error.message}`);
          Deno.exit(1);
        }

        // Backup the original mcpServers if it exists
        const originalMcpServers = targetConfig.mcpServers
          ? { ...targetConfig.mcpServers }
          : {};
        const originalCount = Object.keys(originalMcpServers).length;

        // Override mcpServers property
        targetConfig.mcpServers = sourceConfig.mcpServers;

        // Write target file back
        try {
          const targetContent = JSON.stringify(targetConfig, null, 2);
          Deno.writeTextFileSync(targetFile, targetContent);
        } catch (error: any) {
          console.error(`❌ Failed to write target file: ${error.message}`);
          Deno.exit(1);
        }

        console.log(`✅ Successfully synchronized MCP servers`);
        console.log(`📊 Original servers: ${originalCount}`);
        console.log(`📊 New servers: ${mcpServersCount}`);

        // Show the synchronized servers
        if (mcpServersCount > 0) {
          console.log(`\n🔧 Synchronized MCP servers:`);
          for (const [name, config] of Object.entries(
            sourceConfig.mcpServers
          )) {
            const serverConfig = config as any;
            if (serverConfig.type) {
              console.log(`  - ${name} (${serverConfig.type})`);
            } else if (serverConfig.command) {
              console.log(`  - ${name} (command: ${serverConfig.command})`);
            } else {
              console.log(`  - ${name}`);
            }
          }
        }

        console.log(`\n💡 Restart Claude Code to apply the changes`);
      } catch (error: any) {
        console.error(`❌ Unexpected error: ${error.message}`);
        Deno.exit(1);
      }
    });
}

////////////////////////////////////////////////////////////////////////////////
// THE END
////////////////////////////////////////////////////////////////////////////////
