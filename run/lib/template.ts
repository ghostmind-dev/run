/**
 * @fileoverview Template management module for @ghostmind/run
 *
 * This module provides functionality for downloading and managing project
 * templates from the ghostmind-dev/templates repository.
 *
 * @module
 */

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
    const repoUrl =
      'https://api.github.com/repos/ghostmind-dev/templates/contents/templates';

    console.log('Fetching available template types from GitHub...');

    const response = await fetch(repoUrl);

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
    const repoUrl = `https://api.github.com/repos/ghostmind-dev/templates/contents/templates/${templateType}`;

    console.log(`Fetching templates from ${templateType}...`);

    const response = await fetch(repoUrl);

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
      const fileUrl = `https://api.github.com/repos/ghostmind-dev/templates/contents/templates/${templateType}/${templateName}`;
      const response = await fetch(fileUrl);

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
  const repoUrl = `https://api.github.com/repos/ghostmind-dev/templates/contents/templates/${templateType}/${folderPath}`;

  const response = await fetch(repoUrl);
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
    .action(async () => {
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
          const metaJsonUrl = `https://raw.githubusercontent.com/ghostmind-dev/templates/main/templates/${type}/meta.json`;
          const response = await fetch(metaJsonUrl);
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
      console.log('\nAvailable templates:');
      console.log('====================');
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
    });
}
