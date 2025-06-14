import { $, cd } from 'npm:zx@8.1.0';
import { verifyIfMetaJsonExists } from '../utils/divers.ts';
import { nanoid } from 'npm:nanoid@5.0.7';
import jsonfile from 'npm:jsonfile@6.1.0';
import * as inquirer from 'npm:inquirer@9.2.22';
import { join } from 'jsr:@std/path@0.225.1';
import { createUUID } from '../utils/divers.ts';

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
// CREATE A METADATA FILE
////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a new meta.json file by prompting the user for necessary information.
 * This includes project ID, name, type (project, app, or config), and whether it's a global app.
 * The resulting meta.json file is written to the current directory.
 */
export async function createMetaFile() {
  const id = (await createUUID()) || '';

  const prompt = inquirer.createPromptModule();

  const { name } = await prompt({
    type: 'input',
    name: 'name',
    message: 'What is the name of this object?',
  });
  const { type } = await prompt({
    // type needs to allow the choice of 3 types

    type: 'list',
    name: 'type',
    choices: ['project', 'app', 'config'],
    message: 'What is the type of this object?',
  });
  const { global } = await prompt({
    type: 'confirm',
    name: 'global',
    message: 'Is this a environment-based app ?',
  });

  interface TypeMetaJson {
    id: string;
    name: string;
    type: string;
    [key: string]: string; // Restricts all dynamic properties to be of type string
  }

  let meta: TypeMetaJson = {
    id,
    name,
    type,
  };

  if (global) {
    meta.global = 'true';
  }

  await jsonfile.writeFile('meta.json', meta, { spaces: 2 });

  Deno.exit();
}

////////////////////////////////////////////////////////////////////////////////
// CHANGE ALL IDS IN A META.JSON FILE
////////////////////////////////////////////////////////////////////////////////

/**
 * Changes a specific property in an existing meta.json file.
 * If no property is provided as an argument, it prompts the user to select a property to change.
 * Supports changing 'id', 'name', 'type', and 'global' properties.
 * @param {string} propertyArg - The name of the property to change.
 */
export async function metaChangeProperty(propertyArg: string) {
  // ask the user if they want to change all ids

  let propertyTarget;

  let metaConfig = await verifyIfMetaJsonExists(currentPath);

  const prompt = inquirer.createPromptModule();

  // get the name of all properties in the meta.json file
  // and ask the user if they want to change them

  let properties: string[] = [];

  if (metaConfig) {
    properties = Object.keys(metaConfig);
  }

  if (!propertyArg) {
    let { property } = await prompt({
      // type needs to allow the choice of 3 types

      type: 'list',
      name: 'property',
      choices: properties,
      message: 'What property do you want to change?',
    });

    propertyTarget = property;
  } else {
    propertyTarget = propertyArg;
  }

  ////////////////////////////////////////////////////////////////////////////////
  // CHANGE ID
  ////////////////////////////////////////////////////////////////////////////////

  if (propertyTarget === 'id') {
    if (metaConfig) {
      metaConfig.id = nanoid(12);

      await jsonfile.writeFile(join(currentPath, 'meta.json'), metaConfig, {
        spaces: 2,
      });
    }
  }

  ////////////////////////////////////////////////////////////////////////////////
  // CHANGE NAME
  ////////////////////////////////////////////////////////////////////////////////
  else if (propertyTarget === 'name') {
    const { name } = await prompt({
      type: 'input',
      name: 'name',
      message: 'What is the new name?',
    });

    if (metaConfig) {
      metaConfig.name = name;

      await jsonfile.writeFile(join(currentPath, 'meta.json'), metaConfig, {
        spaces: 2,
      });
    }
  }

  ////////////////////////////////////////////////////////////////////////////////
  // CHANGE TYPE
  ////////////////////////////////////////////////////////////////////////////////
  else if (propertyTarget === 'type') {
    const { type } = await prompt({
      type: 'list',
      name: 'type',
      choices: ['project', 'app', 'config'],
      message: 'What is the new type?',
    });

    if (metaConfig) {
      metaConfig.type = type;

      await jsonfile.writeFile(join(currentPath, 'meta.json'), metaConfig, {
        spaces: 2,
      });
    }
  }

  ////////////////////////////////////////////////////////////////////////////////
  // CHANGE GLOBAL
  ////////////////////////////////////////////////////////////////////////////////
  else if (propertyTarget === 'global') {
    const { global } = await prompt({
      type: 'confirm',
      name: 'global',
      message: 'Is this a environment-based app  d?',
    });

    if (metaConfig) {
      if (global) {
        metaConfig.global = 'true';
      } else {
        delete metaConfig.global;
      }

      await jsonfile.writeFile(join(currentPath, 'meta.json'), metaConfig, {
        spaces: 2,
      });
    }
  }
  Deno.exit();
}

////////////////////////////////////////////////////////////////////////////////
// ADD A NEW PROPERTY TO A META.JSON FILE
////////////////////////////////////////////////////////////////////////////////

/**
 * Adds a Docker configuration section to the meta.json file.
 * Prompts the user for the Docker configuration name, root path, image name,
 * and whether a Dockerfile per environment is used.
 */
export async function metaAddDocker() {
  let metaConfig = await verifyIfMetaJsonExists(currentPath);

  const prompt = inquirer.createPromptModule();

  // "docker": {
  //     "default": {
  //       "root": "container",
  //       "image": "gcr.io/ghostmind-core/templates-butane",
  //       "context_dockerfile": false
  //     }
  //   }

  const { name } = await prompt({
    type: 'input',
    name: 'name',
    message: 'What is the name of the docker config?',
    default: 'default',
  });

  const { root } = await prompt({
    type: 'input',
    name: 'root',
    message: 'What is the Dockerfile path (relative to the meta.json)?',
    default: 'container',
  });

  const { image } = await prompt({
    type: 'input',
    name: 'image',
    message: 'What is the Docker image?',
  });

  const { context_dockerfile } = await prompt({
    type: 'confirm',
    name: 'context_dockerfile',
    message: 'Is there a Dockerfile per environment?',
    default: false,
  });

  ////////////////////////////////////////////////////////////////////////////////
  // ADD DOCKER CONFIG
  ////////////////////////////////////////////////////////////////////////////////

  if (metaConfig) {
    if (!metaConfig.docker) {
      metaConfig.docker = {};
    }

    metaConfig.docker[name] = {
      root,
      image,
      context_dockerfile,
    };

    await jsonfile.writeFile(join(currentPath, 'meta.json'), metaConfig, {
      spaces: 2,
    });
  }

  Deno.exit();
}

////////////////////////////////////////////////////////////////////////////////
// ADD COMPOSE CONFIG
////////////////////////////////////////////////////////////////////////////////

/**
 * Adds a Docker Compose configuration section to the meta.json file.
 * Prompts the user for the Compose configuration name and the root path of the compose file.
 */
export async function metaAddCompose() {
  // "compose": {
  //   "default": {
  //     "root": "container"
  //   }
  // },

  let metaConfig = await verifyIfMetaJsonExists(currentPath);

  const prompt = inquirer.createPromptModule();

  const { name } = await prompt({
    type: 'input',
    name: 'name',
    message: 'What is the name of the compose config?',
    default: 'default',
  });

  const { root } = await prompt({
    type: 'input',
    name: 'root',
    message: 'What is the root of the compose file?',
    default: 'container',
  });

  if (metaConfig) {
    if (!metaConfig.compose) {
      metaConfig.compose = {};
    }

    metaConfig.compose[name] = {
      root,
    };

    await jsonfile.writeFile(join(currentPath, 'meta.json'), metaConfig, {
      spaces: 2,
    });
  }

  Deno.exit();
}

////////////////////////////////////////////////////////////////////////////////
// ADD TUNNEL CONFIG
////////////////////////////////////////////////////////////////////////////////

/**
 * Adds a tunnel configuration section to the meta.json file.
 * Prompts the user for the tunnel subdomain and service URL.
 */
export async function metaAddTunnel() {
  // "tunnel": {
  //   "subdomain": "templates-pluto",
  //   "service": "http://host.docker.internal:5001"
  // },

  let metaConfig = await verifyIfMetaJsonExists(currentPath);

  const prompt = inquirer.createPromptModule();

  const { subdomain } = await prompt({
    type: 'input',
    name: 'subdomain',
    message: 'What is the subdomain of the tunnel?',
  });

  const { service } = await prompt({
    type: 'input',
    name: 'service',
    message: 'What is the service of the tunnel?',
  });

  if (metaConfig) {
    metaConfig.tunnel = {
      subdomain,
      service,
    };

    await jsonfile.writeFile(join(currentPath, 'meta.json'), metaConfig, {
      spaces: 2,
    });
  }

  Deno.exit();
}

////////////////////////////////////////////////////////////////////////////////
// ADD TERAFORM CONFIG
////////////////////////////////////////////////////////////////////////////////

/**
 * Adds a Terraform configuration section to the meta.json file.
 * Prompts the user for the Terraform configuration name, path, and whether it's a global config.
 */
export async function metaAddTerraform() {
  // "terraform": {
  //   "core": {
  //     "path": "run",
  //     "global": false
  //   }
  // }

  let metaConfig = await verifyIfMetaJsonExists(currentPath);

  const prompt = inquirer.createPromptModule();

  const { name } = await prompt({
    type: 'input',
    name: 'name',
    message: 'What is the name of the terraform config?',
    default: 'core',
  });

  const { path } = await prompt({
    type: 'input',
    name: 'path',
    message: 'What is the path of the terraform config?',
    default: 'run',
  });

  const { global } = await prompt({
    type: 'confirm',
    name: 'global',
    message: 'Is this a global terraform config?',
    default: false,
  });

  if (metaConfig) {
    if (!metaConfig.terraform) {
      metaConfig.terraform = {};
    }

    metaConfig.terraform[name] = {
      path,
      global,
    };

    await jsonfile.writeFile(join(currentPath, 'meta.json'), metaConfig, {
      spaces: 2,
    });
  }

  Deno.exit();
}

////////////////////////////////////////////////////////////////////////////////
// ADD
////////////////////////////////////////////////////////////////////////////////

export async function metaAddProperty(): Promise<void> {
  let metaConfig = await verifyIfMetaJsonExists(currentPath);

  const prompt = inquirer.createPromptModule();

  const availableProperties = ['docker', 'compose', 'tunnel', 'terraform'];

  const { property } = await prompt({
    type: 'list',
    name: 'property',
    choices: availableProperties,
    message: 'What property do you want to add?',
  });

  if (property === 'docker') {
    return metaAddDocker();
  } else if (property === 'compose') {
    return metaAddCompose();
  } else if (property === 'tunnel') {
    return metaAddTunnel();
  } else if (property === 'terraform') {
    return metaAddTerraform();
  }

  Deno.exit();
}

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

/**
 * Sets up the 'meta' command and its subcommands.
 * @param {object} program - The program instance, expected to have a `command` method.
 */
export default async function meta(program: {
  command: (name: string) => any;
}) {
  const meta = program.command('meta');
  meta.description('manage meta.json files');

  const metaCreate = meta.command('create');
  metaCreate.description('create a meta.json file');
  metaCreate.action(createMetaFile);

  const metaChange = meta.command('change');
  metaChange
    .description('make changes to a meta.json file')
    .argument('[property]', 'property to change')
    .action(metaChangeProperty);

  const metaAdd = meta.command('add');
  metaAdd.description('add a new property to a meta.json file');
  metaAdd.action(metaAddProperty);

  metaAdd
    .command('docker')
    .description('add docker properties to a meta.json file')
    .action(metaAddDocker);

  metaAdd
    .command('compose')
    .description('add docker-compose properties to a meta.json file')
    .action(metaAddCompose);

  metaAdd
    .command('tunnel')
    .description('add tunnel properties to a meta.json file')
    .action(metaAddTunnel);

  metaAdd
    .command('terraform')
    .description('add terraform properties to a meta.json file')
    .action(metaAddTerraform);
}
