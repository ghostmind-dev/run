/**
 * @fileoverview Meta.json management module for @ghostmind/run
 *
 * This module provides functionality for creating, modifying, and managing
 * meta.json configuration files that define project metadata and settings.
 *
 * @module
 */

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
 * Create a new meta.json configuration file interactively
 *
 * This function prompts the user for project information and creates
 * a meta.json file with the specified name, type, and global settings.
 *
 * @example
 * ```typescript
 * // Create a new meta.json file (interactive prompts will guide setup)
 * await createMetaFile();
 * ```
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

  /**
   * Interface for meta.json file structure
   */
  interface TypeMetaJson {
    /** Unique identifier for the project */
    id: string;
    /** Name of the project */
    name: string;
    /** Type of the project (project, app, config) */
    type: string;
    /** Additional dynamic properties */
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
 * Change a property in the existing meta.json file
 *
 * This function allows modification of properties in an existing meta.json file,
 * including id, name, type, and global settings. If no property is specified,
 * it will prompt the user to select one.
 *
 * @param propertyArg - The property to change (optional, will prompt if not provided)
 *
 * @example
 * ```typescript
 * // Change the name property
 * await metaChangeProperty('name');
 *
 * // Interactive property selection
 * await metaChangeProperty();
 * ```
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
 * Add Docker configuration to meta.json file
 *
 * This function interactively adds Docker configuration settings to the meta.json file,
 * including Dockerfile path, image name, and environment-based configuration options.
 *
 * @example
 * ```typescript
 * // Add Docker configuration (interactive prompts will guide setup)
 * await metaAddDocker();
 * ```
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
 * Add Docker Compose configuration to meta.json file
 *
 * This function interactively adds Docker Compose configuration settings
 * to the meta.json file, including the root directory for compose files.
 *
 * @example
 * ```typescript
 * // Add Docker Compose configuration (interactive prompts will guide setup)
 * await metaAddCompose();
 * ```
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
 * Add tunnel configuration to meta.json file
 *
 * This function interactively adds tunnel configuration settings to the meta.json file,
 * including subdomain and service URL for Cloudflare tunnel setup.
 *
 * @example
 * ```typescript
 * // Add tunnel configuration (interactive prompts will guide setup)
 * await metaAddTunnel();
 * ```
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
// ADD TERRAFORM CONFIG
////////////////////////////////////////////////////////////////////////////////

/**
 * Add Terraform configuration to meta.json file
 *
 * This function interactively adds Terraform configuration settings to the meta.json file,
 * including the path to Terraform files and global configuration options.
 *
 * @example
 * ```typescript
 * // Add Terraform configuration (interactive prompts will guide setup)
 * await metaAddTerraform();
 * ```
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

/**
 * Add a new property to meta.json file with interactive selection
 *
 * This function presents a menu of available properties that can be added
 * to the meta.json file and delegates to the appropriate specialized function.
 *
 * @example
 * ```typescript
 * // Interactive property selection and addition
 * await metaAddProperty();
 * ```
 */
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

export default async function meta(program: any) {
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
