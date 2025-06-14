////////////////////////////////////////////////////////////////////////////////
// LIST TEMPLATE TYPES
////////////////////////////////////////////////////////////////////////////////

/**
 * Represents a file or directory item from the GitHub API.
 */
export interface GithubContent {
  name: string;
  path: string;
  sha: string;
  size: number;
  url: string;
  html_url: string;
  git_url: string;
  download_url: string | null; // Files have download_url, directories have null
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  _links: {
    self: string;
    git: string;
    html: string;
  };
}

/**
 * Fetches and lists available template types (top-level directories) from the ghostmind-dev/templates GitHub repository.
 * @returns {Promise<string[]>} A promise that resolves to an array of template type names.
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

    const data: GithubContent[] = await response.json();

    // Filter only directories
    const directories = data
      .filter((item: GithubContent) => item.type === 'dir')
      .map((item: GithubContent) => item.name);

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
 * Fetches and lists templates within a specific template type from the ghostmind-dev/templates GitHub repository.
 * @param {string} templateType - The type (directory name) of templates to list.
 * @returns {Promise<GithubContent[]>} A promise that resolves to an array of GitHub content items (files and directories).
 */
export async function listTemplatesInType(
  templateType: string
): Promise<GithubContent[]> {
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
 * Downloads a template (file or folder) from the ghostmind-dev/templates GitHub repository
 * and copies it to a specified local path.
 * @param {string} templateType - The type (directory name) of the template.
 * @param {string} templateName - The name of the template (file or folder name). If copying a whole folder, this can be an empty string when `isFile` is false, or the specific file name.
 * @param {string} targetPath - The local path (relative to current working directory) where the template should be copied.
 * @param {boolean} [isFile=false] - Whether the template to download is a single file. If false, assumes it's a folder.
 * @returns {Promise<void>} A promise that resolves when the template is downloaded and copied.
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
 * Recursively downloads the contents of a folder from the ghostmind-dev/templates GitHub repository.
 * @param {string} templateType - The type (directory name) of the template.
 * @param {string} folderPath - The path of the folder within the template type to download.
 * @param {string} targetPath - The local path where the folder contents should be saved.
 * @returns {Promise<void>} A promise that resolves when all folder contents are downloaded.
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

  const items: GithubContent[] = await response.json();

  for (const item of items) {
    if (item.type === 'file' && item.download_url) {
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

/**
 * Prompts the user with a question and returns their input.
 * @param {string} question - The question to ask the user.
 * @param {string} [defaultValue] - A default value to use if the user provides no input.
 * @returns {Promise<string>} A promise that resolves to the user's input or the default value.
 */
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

/**
 * Sets up the 'template' command and its subcommands for managing templates.
 * @param {object} program - The program instance, expected to have a `command` method.
 */
export default async function template(program: {
  command: (name: string) => any;
}) {
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
