import { $, cd } from 'npm:zx@8.1.0';
import fs from 'npm:fs-extra@11.2.0';

////////////////////////////////////////////////////////////////////////////////
// MUTE BY DEFAULT
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

////////////////////////////////////////////////////////////////////////////////
// RUNNING COMMAND LOCATION
////////////////////////////////////////////////////////////////////////////////

let currentPath = Deno.cwd();

cd(currentPath);

////////////////////////////////////////////////////////////////////////////////
// SCRIPT TEMPLATE MANAGEMENT
////////////////////////////////////////////////////////////////////////////////

/**
 * Fetches and lists available script templates from the ghostmind-dev/config GitHub repository.
 * @returns {Promise<string[]>} A promise that resolves to an array of script template names (e.g., "example.ts").
 */
export async function listScriptTemplates(): Promise<string[]> {
  try {
    const repoUrl =
      'https://api.github.com/repos/ghostmind-dev/config/contents/config/custom';

    console.log('Fetching available script templates from GitHub...');

    const response = await fetch(repoUrl);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch script templates: ${response.statusText}`
      );
    }

    const data = await response.json();

    // Filter only TypeScript files
    const scriptFiles = data
      .filter((item: any) => item.type === 'file' && item.name.endsWith('.ts'))
      .map((item: any) => item.name);

    return scriptFiles;
  } catch (error) {
    console.error('Error fetching script templates:', error);
    return [];
  }
}

/**
 * Downloads a specific script template from the ghostmind-dev/config GitHub repository.
 * @param {string} scriptName - The name of the script template to download (e.g., "example.ts").
 * @param {string} [targetFolder="scripts"] - The folder where the script should be saved, relative to the current working directory.
 * @param {string} fileName - The name to give the downloaded script file.
 * @returns {Promise<void>} A promise that resolves when the script is downloaded and saved.
 */
export async function downloadScriptTemplate(
  scriptName: string,
  targetFolder: string = 'scripts',
  fileName: string
): Promise<void> {
  try {
    const repoUrl = `https://api.github.com/repos/ghostmind-dev/config/contents/config/custom/${scriptName}`;

    console.log(`Downloading script: ${scriptName}...`);

    // Create target directory if it doesn't exist
    const userWorkingDirectory = Deno.cwd();
    const fullTargetPath = `${userWorkingDirectory}/${targetFolder}`;
    await fs.ensureDir(fullTargetPath);

    // Fetch script file
    const response = await fetch(repoUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch script file: ${response.statusText}`);
    }

    const fileData = await response.json();

    // Fetch file content
    const fileResponse = await fetch(fileData.download_url);
    const fileContent = await fileResponse.text();

    // Write file to target directory with specified name
    const filePath = `${fullTargetPath}/${fileName}`;
    await fs.writeFile(filePath, fileContent);

    console.log(
      `✅ Script '${scriptName}' successfully downloaded as '${fileName}' to './${targetFolder}' directory`
    );
  } catch (error) {
    console.error('Error downloading script:', error);
  }
}

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

  // Use Deno.stdout.write for the prompt to avoid newline issues
  await Deno.stdout.write(new TextEncoder().encode(prompt));

  const decoder = new TextDecoder();
  const buffer = new Uint8Array(1024);
  const n = await Deno.stdin.read(buffer);
  const input = decoder.decode(buffer.subarray(0, n || 0)).trim();

  return input || defaultValue || '';
}

/**
 * Interactively guides the user to select and download a script template.
 * It lists available templates, prompts for selection, target folder, and file name,
 * then downloads the chosen script.
 * @returns {Promise<void>} A promise that resolves when the process is complete or an error occurs.
 */
export async function scriptsAdd(): Promise<void> {
  try {
    const scripts = await listScriptTemplates();

    if (scripts.length === 0) {
      console.log('No script templates found or failed to fetch scripts.');
      return;
    }

    console.log('\nAvailable script templates:');
    console.log('============================');

    scripts.forEach((script, index) => {
      console.log(`${index + 1}. ${script}`);
    });

    const scriptSelection = await promptUser(
      '\nPlease select a script by entering its number'
    );
    const selectedIndex = parseInt(scriptSelection) - 1;

    if (selectedIndex < 0 || selectedIndex >= scripts.length) {
      console.log('Invalid selection. Please try again.');
      return;
    }

    const selectedScript = scripts[selectedIndex];
    console.log(`\nSelected script: ${selectedScript}`);

    // Ask for script configuration
    const targetFolder = await promptUser('Enter target folder', 'scripts');
    const fileName = await promptUser('Enter file name (required)');

    if (!fileName || !fileName.trim()) {
      console.log('File name is required. Please try again.');
      return;
    }

    // Ensure the filename has .ts extension if not provided
    const finalFileName = fileName.endsWith('.ts')
      ? fileName
      : `${fileName}.ts`;

    console.log(`\nConfiguration:
- Script: ${selectedScript}
- Target folder: ${targetFolder}
- File name: ${finalFileName}`);

    // Download the script
    await downloadScriptTemplate(selectedScript, targetFolder, finalFileName);
  } catch (error) {
    console.error('Error in scripts add command:', error);
  }
}

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

/**
 * Sets up the 'scripts' command and its subcommands for managing script templates.
 * @param {object} program - The program instance, expected to have a `command` method.
 */
export default async function commandScripts(program: {
  command: (name: string) => any;
}) {
  const scripts = program.command('scripts');
  scripts.description('script template management');

  scripts
    .command('add')
    .description('list and download script templates')
    .action(scriptsAdd);
}
