////////////////////////////////////////////////////////////////////////////////
// LIST TEMPLATE TYPES
////////////////////////////////////////////////////////////////////////////////

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
      // Step 1: Get template types
      const templateTypes = await listTemplateTypes();

      if (templateTypes.length === 0) {
        console.log(
          'No template types found or failed to fetch template types.'
        );
        return;
      }

      console.log('\nAvailable template types:');
      console.log('========================');

      templateTypes.forEach((type, index) => {
        console.log(`${index + 1}. ${type}`);
      });

      // Step 2: Select template type
      const typeSelection = await promptUser(
        '\nSelect a template type by number'
      );
      const selectedTypeIndex = parseInt(typeSelection) - 1;

      if (selectedTypeIndex < 0 || selectedTypeIndex >= templateTypes.length) {
        console.log('Invalid selection. Please try again.');
        return;
      }

      const selectedType = templateTypes[selectedTypeIndex];
      console.log(`\nSelected type: ${selectedType}`);

      // Step 3: Get templates in the selected type
      const templates = await listTemplatesInType(selectedType);

      if (templates.length === 0) {
        console.log(`No templates found in ${selectedType}.`);
        return;
      }

      console.log(`\nAvailable templates in ${selectedType}:`);
      console.log('=====================================');

      templates.forEach((template, index) => {
        const typeIcon = template.type === 'dir' ? '📁' : '📄';
        console.log(`${index + 1}. ${typeIcon} ${template.name}`);
      });

      // Step 4: Select specific template
      const templateSelection = await promptUser(
        '\nSelect a template by number'
      );
      const selectedTemplateIndex = parseInt(templateSelection) - 1;

      if (
        selectedTemplateIndex < 0 ||
        selectedTemplateIndex >= templates.length
      ) {
        console.log('Invalid selection. Please try again.');
        return;
      }

      const selectedTemplate = templates[selectedTemplateIndex];
      console.log(`\nSelected template: ${selectedTemplate.name}`);

      // Step 5: Ask for target path
      const targetPath = await promptUser(
        'Where do you want to copy this template? (relative to current directory)',
        'default'
      );

      // Step 6: Download and copy
      const isFile = selectedTemplate.type === 'file';
      await downloadAndCopyTemplate(
        selectedType,
        selectedTemplate.name,
        targetPath,
        isFile
      );
    });
}
