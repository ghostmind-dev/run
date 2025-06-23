/**
 * @fileoverview Template management module for @ghostmind/run
 *
 * This module provides functionality for downloading and managing project
 * templates from the ghostmind-dev/templates repository.
 *
 * @module
 */

import { $, cd, within } from 'npm:zx@8.5.5';
import { cmd } from './custom.ts';
import { join, resolve } from 'jsr:@std/path@1.0.8';

////////////////////////////////////////////////////////////////////////////////
// HELPER FUNCTIONS FOR CACHE BUSTING
////////////////////////////////////////////////////////////////////////////////

/**
 * Get the latest commit SHA for the main branch to use in API calls
 * This helps bypass additional caching layers
 */
async function getLatestCommitSha(): Promise<string | null> {
  try {
    const response = await fetchFresh(
      'https://api.github.com/repos/ghostmind-dev/templates/git/refs/heads/main'
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.object.sha;
  } catch (error) {
    console.warn('Could not fetch latest commit SHA, using default branch');
    return null;
  }
}

/**
 * Get fresh fetch headers with cache busting and optional timestamp
 */
function getFreshHeaders(): Record<string, string> {
  return {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
    // Add a timestamp query parameter equivalent in headers
    'X-Requested-At': new Date().toISOString(),
  };
}

/**
 * Add timestamp query parameter to URL for cache busting
 */
function addCacheBustingParam(url: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}_t=${Date.now()}`;
}

/**
 * Create a fresh fetch request with all cache-busting techniques applied
 * This combines URL cache busting, headers, and other techniques
 */
async function fetchFresh(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const freshUrl = addCacheBustingParam(url);
  const freshHeaders = {
    ...getFreshHeaders(),
    ...options.headers,
  };

  // Log cache busting info in development
  if (Deno.env.get('DEBUG') === 'true') {
    console.log(`🔄 Cache-busting fetch: ${freshUrl}`);
    console.log(`📋 Headers:`, freshHeaders);
  }

  return fetch(freshUrl, {
    ...options,
    headers: freshHeaders,
  });
}

////////////////////////////////////////////////////////////////////////////////
// LOCAL TEMPLATE FUNCTIONS (DEV MODE)
////////////////////////////////////////////////////////////////////////////////

/**
 * List available local template types from the filesystem
 *
 * This function scans the local templates directory for available template types.
 *
 * @param templatesPath - Path to the local templates directory
 * @returns Promise resolving to an array of template type names
 */
async function listLocalTemplateTypes(
  templatesPath: string
): Promise<string[]> {
  try {
    console.log(`Scanning local templates from: ${templatesPath}`);

    const entries = [];
    for await (const entry of Deno.readDir(templatesPath)) {
      if (entry.isDirectory) {
        entries.push(entry.name);
      }
    }

    return entries.sort();
  } catch (error) {
    console.error('Error reading local templates directory:', error);
    return [];
  }
}

/**
 * Copy local template to target directory
 *
 * @param templatesPath - Path to the local templates directory
 * @param templateName - Name of the template to copy
 * @param targetPath - Target path for the copy
 */
async function copyLocalTemplate(
  templatesPath: string,
  templateName: string,
  targetPath: string
): Promise<void> {
  try {
    const sourcePath = join(templatesPath, templateName);
    const currentDir = Deno.cwd();
    const fullTargetPath = resolve(currentDir, targetPath);

    // Check if source template exists
    try {
      const stat = await Deno.stat(sourcePath);
      if (!stat.isDirectory) {
        throw new Error(`Template '${templateName}' is not a directory`);
      }
    } catch (error) {
      throw new Error(
        `Template '${templateName}' not found in ${templatesPath}`
      );
    }

    // Create target directory
    await Deno.mkdir(fullTargetPath, { recursive: true });

    // Copy template contents recursively
    await copyDirectoryRecursive(sourcePath, fullTargetPath);

    // Process template configuration
    await processTemplateConfig(fullTargetPath);

    console.log(
      `✅ Local template '${templateName}' copied to '${targetPath}/'`
    );
  } catch (error) {
    console.error('Error copying local template:', error);
    throw error;
  }
}

/**
 * Recursively copy directory contents
 *
 * @param sourcePath - Source directory path
 * @param targetPath - Target directory path
 */
async function copyDirectoryRecursive(
  sourcePath: string,
  targetPath: string
): Promise<void> {
  for await (const entry of Deno.readDir(sourcePath)) {
    const sourceEntryPath = join(sourcePath, entry.name);
    const targetEntryPath = join(targetPath, entry.name);

    if (entry.isDirectory) {
      await Deno.mkdir(targetEntryPath, { recursive: true });
      await copyDirectoryRecursive(sourceEntryPath, targetEntryPath);
    } else if (entry.isFile) {
      console.log(`Copying: ${entry.name}`);
      await Deno.copyFile(sourceEntryPath, targetEntryPath);
    }
  }
}

/**
 * Read local template meta.json file
 *
 * @param templatesPath - Path to the local templates directory
 * @param templateName - Name of the template
 * @returns Promise resolving to meta object or null if not found
 */
async function readLocalTemplateMeta(
  templatesPath: string,
  templateName: string
): Promise<any | null> {
  try {
    const metaPath = join(templatesPath, templateName, 'meta.json');
    const metaContent = await Deno.readTextFile(metaPath);
    return JSON.parse(metaContent);
  } catch (error) {
    return null;
  }
}

////////////////////////////////////////////////////////////////////////////////
// LIST TEMPLATE TYPES
////////////////////////////////////////////////////////////////////////////////

/**
 * List available template types from the GitHub repository
 *
 * This function fetches the list of available template directories
 * from the ghostmind-dev/templates repository.
 *
 * @returns Promise resolving to an array of template type names
 *
 * @example
 * ```typescript
 * const types = await listTemplateTypes();
 * console.log(types); // ['react-app', 'node-api', 'deno-cli']
 * ```
 */
export async function listTemplateTypes(): Promise<string[]> {
  try {
    console.log('Fetching available template types from GitHub...');

    const response = await fetchFresh(
      'https://api.github.com/repos/ghostmind-dev/templates/contents/templates'
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch template types: ${response.statusText}`);
    }

    const data = await response.json();

    // Filter only directories
    const directories = data
      .filter((item: any) => item.type === 'dir')
      .map((item: any) => item.name);

    return directories;
  } catch (error) {
    console.error('Error fetching template types:', error);
    return [];
  }
}

////////////////////////////////////////////////////////////////////////////////
// LIST TEMPLATES IN A TYPE
////////////////////////////////////////////////////////////////////////////////

/**
 * List templates within a specific template type
 *
 * This function fetches the contents of a specific template type directory
 * from the ghostmind-dev/templates repository.
 *
 * @param templateType - The template type directory to list
 * @returns Promise resolving to an array of template items
 *
 * @example
 * ```typescript
 * const templates = await listTemplatesInType('react-app');
 * console.log(templates); // Array of file/folder objects
 * ```
 */
export async function listTemplatesInType(
  templateType: string
): Promise<any[]> {
  try {
    console.log(`Fetching templates from ${templateType}...`);

    const response = await fetchFresh(
      `https://api.github.com/repos/ghostmind-dev/templates/contents/templates/${templateType}`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch templates: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching templates:', error);
    return [];
  }
}

////////////////////////////////////////////////////////////////////////////////
// DOWNLOAD AND COPY TEMPLATE
////////////////////////////////////////////////////////////////////////////////

/**
 * Download and copy a template to the local filesystem
 *
 * This function downloads a template (file or directory) from the GitHub
 * repository and copies it to the specified target path.
 *
 * @param templateType - The template type directory
 * @param templateName - The specific template name to download
 * @param targetPath - Local path where the template should be copied
 * @param isFile - Whether the template is a single file (defaults to false)
 *
 * @example
 * ```typescript
 * // Download a full template directory
 * await downloadAndCopyTemplate('react-app', 'basic', './my-app');
 *
 * // Download a single file
 * await downloadAndCopyTemplate('configs', 'tsconfig.json', './config', true);
 * ```
 */
export async function downloadAndCopyTemplate(
  templateType: string,
  templateName: string,
  targetPath: string,
  isFile: boolean = false
): Promise<void> {
  try {
    const currentDir = Deno.cwd();
    const fullTargetPath = `${currentDir}/${targetPath}`;

    // Create target directory if it doesn't exist
    await Deno.mkdir(fullTargetPath, { recursive: true });

    if (isFile) {
      // Handle single file
      const response = await fetchFresh(
        `https://api.github.com/repos/ghostmind-dev/templates/contents/templates/${templateType}/${templateName}`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.statusText}`);
      }

      const fileData = await response.json();
      const fileResponse = await fetch(fileData.download_url);
      const fileContent = await fileResponse.text();

      const filePath = `${fullTargetPath}/${templateName}`;
      await Deno.writeTextFile(filePath, fileContent);

      console.log(`✅ File '${templateName}' copied to '${targetPath}/'`);
    } else {
      // Handle folder - recursively download all contents
      await downloadFolderContents(templateType, templateName, fullTargetPath);

      // After downloading, process template configuration
      await processTemplateConfig(fullTargetPath);

      console.log(`✅ Template '${templateName}' copied to '${targetPath}/'`);
    }
  } catch (error) {
    console.error('Error downloading template:', error);
  }
}

////////////////////////////////////////////////////////////////////////////////
// DOWNLOAD FOLDER CONTENTS RECURSIVELY
////////////////////////////////////////////////////////////////////////////////

/**
 * Recursively download folder contents from GitHub repository
 *
 * This internal function recursively downloads all files and subdirectories
 * from a template folder in the GitHub repository.
 *
 * @param templateType - The template type directory
 * @param folderPath - The folder path within the template type
 * @param targetPath - Local target path for the download
 *
 * @internal
 */
async function downloadFolderContents(
  templateType: string,
  folderPath: string,
  targetPath: string
): Promise<void> {
  const response = await fetchFresh(
    `https://api.github.com/repos/ghostmind-dev/templates/contents/templates/${templateType}/${folderPath}`
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch folder contents: ${response.statusText}`);
  }

  const items = await response.json();

  for (const item of items) {
    if (item.type === 'file') {
      console.log(`Downloading: ${item.name}`);

      const fileResponse = await fetch(item.download_url);
      const fileContent = await fileResponse.text();

      const filePath = `${targetPath}/${item.name}`;
      await Deno.writeTextFile(filePath, fileContent);
    } else if (item.type === 'dir') {
      // Create subdirectory and recursively download its contents
      const subDirPath = `${targetPath}/${item.name}`;
      await Deno.mkdir(subDirPath, { recursive: true });

      const relativeFolderPath = folderPath
        ? `${folderPath}/${item.name}`
        : item.name;
      await downloadFolderContents(
        templateType,
        relativeFolderPath,
        subDirPath
      );
    }
  }
}

////////////////////////////////////////////////////////////////////////////////
// PROCESS TEMPLATE CONFIGURATION
////////////////////////////////////////////////////////////////////////////////

/**
 * Process template configuration after files are copied
 *
 * This function reads the meta.json file from the copied template,
 * processes ignore files/folders, and executes init commands.
 * After processing, it restores the original meta.json content.
 *
 * @param targetPath - The path where the template was copied
 */
async function processTemplateConfig(targetPath: string): Promise<void> {
  try {
    // Read meta.json from the copied template
    const metaJsonPath = `${targetPath}/meta.json`;
    const originalMetaContent = await Deno.readTextFile(metaJsonPath);
    const meta = JSON.parse(originalMetaContent);

    if (meta.template) {
      const ignoreFiles = meta.template.ignoreFiles || [];
      const ignoreFolders = meta.template.ignoreFolders || [];

      // Remove ignored files
      if (ignoreFiles.length > 0) {
        console.log(`🧹 Cleaning up ignored files...`);
        for (const fileName of ignoreFiles) {
          const filePath = `${targetPath}/${fileName}`;
          try {
            await Deno.remove(filePath);
            console.log(`🗑️  Removed ignored file: ${fileName}`);
          } catch (error) {
            console.log(
              `⚠️  Could not remove file ${fileName}: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
          }
        }
      }

      // Remove ignored folders
      if (ignoreFolders.length > 0) {
        console.log(`🧹 Cleaning up ignored folders...`);
        for (const folderName of ignoreFolders) {
          const folderPath = `${targetPath}/${folderName}`;
          try {
            await Deno.remove(folderPath, { recursive: true });
            console.log(`🗑️  Removed ignored folder: ${folderName}`);
          } catch (error) {
            console.log(
              `⚠️  Could not remove folder ${folderName}: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
          }
        }
      }

      // Execute init commands AFTER cleanup
      const initCommands = meta.template.init || [];
      if (initCommands.length > 0) {
        console.log(`🚀 Running init commands...`);
        await executeInitCommands(initCommands, targetPath);
      }
    }

    // Restore the original meta.json content (without any environment variable substitutions)
    await Deno.writeTextFile(metaJsonPath, originalMetaContent);
    console.log(`📄 Restored original meta.json content`);
  } catch (error) {
    console.log(
      'No meta.json found or error processing template config, proceeding without template processing'
    );
  }
}

////////////////////////////////////////////////////////////////////////////////
// EXECUTE INIT COMMANDS
////////////////////////////////////////////////////////////////////////////////

/**
 * Execute init commands sequentially from template configuration
 *
 * This function executes an array of commands in sequence, using the same
 * execution mechanism as routines but without parallel/sequence keywords.
 *
 * @param initCommands - Array of commands to execute sequentially
 * @param targetPath - The path where commands should be executed from
 */
async function executeInitCommands(
  initCommands: string[],
  targetPath: string
): Promise<void> {
  if (!initCommands || initCommands.length === 0) {
    return;
  }

  console.log(`🚀 Running ${initCommands.length} init command(s)...`);

  const originalCwd = Deno.cwd();

  try {
    // Change to target directory for command execution
    cd(targetPath);

    // Execute commands sequentially (same as routine execution)
    await within(async () => {
      for (const command of initCommands) {
        console.log(`⚡ Executing: ${command}`);
        $.verbose = true;

        try {
          if (command.startsWith('cd ')) {
            const directory = command.slice(3);
            cd(directory);
          } else {
            const isCustomCommand = cmd`${command}`;
            await $`${isCustomCommand}`;
          }
        } catch (error) {
          console.error(`❌ Error executing command "${command}":`, error);
          throw error;
        }
      }
    });

    console.log(`✅ All init commands completed successfully`);
  } finally {
    // Restore original working directory
    cd(originalCwd);
    $.verbose = false;
  }
}

////////////////////////////////////////////////////////////////////////////////
// PROMPT USER INPUT
////////////////////////////////////////////////////////////////////////////////

async function promptUser(
  question: string,
  defaultValue?: string
): Promise<string> {
  const prompt = defaultValue
    ? `${question} (default: ${defaultValue}): `
    : `${question}: `;

  await Deno.stdout.write(new TextEncoder().encode(prompt));

  const decoder = new TextDecoder();
  const buffer = new Uint8Array(1024);
  const n = await Deno.stdin.read(buffer);
  const input = decoder.decode(buffer.subarray(0, n || 0)).trim();

  return input || defaultValue || '';
}

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function template(program: any) {
  const template = program.command('template');
  template.description('template management commands');

  ////////////////////////////////////////////////////////////////////////////
  // ADD TEMPLATE
  ////////////////////////////////////////////////////////////////////////////

  template
    .command('add')
    .description('add a new template')
    .option('--dev', 'use local templates (dev mode)')
    .option(
      '--path <path>',
      'custom path to templates directory (defaults to ./templates in dev mode)'
    )
    .action(async (options: { dev?: boolean; path?: string }) => {
      const isDevMode = options.dev;
      let templatesPath = options.path;

      if (isDevMode) {
        // Dev mode: use local templates
        if (!templatesPath) {
          templatesPath = join(Deno.cwd(), 'templates');
        } else {
          templatesPath = resolve(Deno.cwd(), templatesPath);
        }

        // Check if templates directory exists
        try {
          const stat = await Deno.stat(templatesPath);
          if (!stat.isDirectory) {
            console.log(
              `❌ Templates path '${templatesPath}' is not a directory`
            );
            return;
          }
        } catch (error) {
          console.log(`❌ Templates directory not found: ${templatesPath}`);
          console.log(
            '💡 Make sure you have a "templates" folder in your current directory or specify a custom path with --path'
          );
          return;
        }

        // Step 1: Get local template types
        const templateTypes = await listLocalTemplateTypes(templatesPath);

        if (templateTypes.length === 0) {
          console.log(`No templates found in ${templatesPath}`);
          return;
        }

        // Step 2: Read meta.json for each template
        const templatesWithMeta = [];
        for (const type of templateTypes) {
          const meta = await readLocalTemplateMeta(templatesPath, type);
          if (meta) {
            templatesWithMeta.push({
              folder: type,
              name: meta.name || type,
              tags: meta.tags || [],
              error: false,
            });
          } else {
            templatesWithMeta.push({
              folder: type,
              name: type,
              tags: [],
              error: true,
            });
          }
        }

        // Step 3: Display templates
        console.log('\nAvailable local templates:');
        console.log('==========================');
        templatesWithMeta.forEach((tpl, idx) => {
          const tagStr = tpl.tags.length > 0 ? ` [${tpl.tags.join(', ')}]` : '';
          const errorStr = tpl.error ? ' (no meta.json)' : '';
          console.log(`${idx + 1}. ${tpl.name}${tagStr}${errorStr}`);
        });

        // Step 4: Prompt user to select one
        const selection = await promptUser('\nSelect a template by number');
        const selectedIdx = parseInt(selection) - 1;
        if (selectedIdx < 0 || selectedIdx >= templatesWithMeta.length) {
          console.log('Invalid selection. Please try again.');
          return;
        }
        const selectedTemplate = templatesWithMeta[selectedIdx];
        console.log(`\nSelected template: ${selectedTemplate.name}`);

        // Step 5: Ask for target path
        const targetPath = await promptUser(
          'Where do you want to copy this template? (relative to current directory)',
          selectedTemplate.folder
        );

        // Step 6: Copy local template
        await copyLocalTemplate(
          templatesPath,
          selectedTemplate.folder,
          targetPath
        );
      } else {
        // Remote mode: use GitHub templates (original behavior)
        // Step 1: Get template types (folders)
        const templateTypes = await listTemplateTypes();

        if (templateTypes.length === 0) {
          console.log(
            'No template types found or failed to fetch template types.'
          );
          return;
        }

        // Step 2: For each folder, fetch and parse meta.json
        const templatesWithMeta = [];
        for (const type of templateTypes) {
          try {
            const response = await fetchFresh(
              `https://raw.githubusercontent.com/ghostmind-dev/templates/main/templates/${type}/meta.json`
            );
            if (!response.ok) {
              templatesWithMeta.push({
                folder: type,
                name: '(no meta.json)',
                tags: [],
                error: true,
              });
              continue;
            }
            const meta = await response.json();
            templatesWithMeta.push({
              folder: type,
              name: meta.name || type,
              tags: meta.tags || [],
              error: false,
            });
          } catch (e) {
            templatesWithMeta.push({
              folder: type,
              name: '(error reading meta.json)',
              tags: [],
              error: true,
            });
          }
        }

        // Step 3: Display as a nice list
        console.log('\nAvailable remote templates:');
        console.log('============================');
        templatesWithMeta.forEach((tpl, idx) => {
          const tagStr = tpl.tags.length > 0 ? ` [${tpl.tags.join(', ')}]` : '';
          const errorStr = tpl.error ? ' ⚠️' : '';
          console.log(`${idx + 1}. ${tpl.name}${tagStr}${errorStr}`);
        });

        // Step 4: Prompt user to select one
        const selection = await promptUser('\nSelect a template by number');
        const selectedIdx = parseInt(selection) - 1;
        if (selectedIdx < 0 || selectedIdx >= templatesWithMeta.length) {
          console.log('Invalid selection. Please try again.');
          return;
        }
        const selectedTemplate = templatesWithMeta[selectedIdx];
        console.log(`\nSelected template: ${selectedTemplate.name}`);

        // Step 5: Ask for target path (default to template name)
        const targetPath = await promptUser(
          'Where do you want to copy this template? (relative to current directory)',
          selectedTemplate.folder
        );

        // Step 6: Copy all files from the selected template folder into the specified local directory
        await downloadAndCopyTemplate(
          selectedTemplate.folder, // templateType
          '', // templateName (empty string to copy the whole folder)
          targetPath,
          false // isFile
        );
      }
    });
}
