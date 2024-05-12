import { $, cd } from 'npm:zx';
import {
  verifyIfMetaJsonExists,
  detectScriptsDirectory,
} from '../utils/divers.ts';
import { nanoid } from 'npm:nanoid';
import jsonfile from 'npm:jsonfile';
import * as inquirer from 'npm:inquirer';
import { join } from 'https://deno.land/std@0.221.0/path/mod.ts';
import { createUUID } from '../utils/divers.ts';

////////////////////////////////////////////////////////////////////////////////
// MUTE BY DEFAULT
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

////////////////////////////////////////////////////////////////////////////////
// RUNNING COMMAND LOCATION
////////////////////////////////////////////////////////////////////////////////

let currentPath = await detectScriptsDirectory(Deno.cwd());

cd(currentPath);

////////////////////////////////////////////////////////////////////////////////
// CREATE A METADATA FILE
////////////////////////////////////////////////////////////////////////////////

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
    message: 'Is this a environment-based app  d?',
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

export async function metaChangeProperty(options: any) {
  // ask the user if they want to change all ids

  const prompt = inquirer.createPromptModule();

  let metaConfig = await verifyIfMetaJsonExists(currentPath);

  // get the name of all properties in the meta.json file
  // and ask the user if they want to change them

  let properties = Object.keys(metaConfig);

  const { property } = await prompt({
    // type needs to allow the choice of 3 types

    type: 'list',
    name: 'property',
    choices: properties,
    message: 'What property do you want to change?',
  });

  ////////////////////////////////////////////////////////////////////////////////
  // CHANGE ID
  ////////////////////////////////////////////////////////////////////////////////

  if (property === 'id') {
    metaConfig.id = nanoid(12);

    await jsonfile.writeFile(join(currentPath, 'meta.json'), metaConfig, {
      spaces: 2,
    });
  }

  ////////////////////////////////////////////////////////////////////////////////
  // CHANGE NAME
  ////////////////////////////////////////////////////////////////////////////////
  else if (property === 'name') {
    const { name } = await prompt({
      type: 'input',
      name: 'name',
      message: 'What is the new name?',
    });

    metaConfig.name = name;

    await jsonfile.writeFile(join(currentPath, 'meta.json'), metaConfig, {
      spaces: 2,
    });
  }

  ////////////////////////////////////////////////////////////////////////////////
  // CHANGE TYPE
  ////////////////////////////////////////////////////////////////////////////////
  else if (property === 'type') {
    const { type } = await prompt({
      type: 'list',
      name: 'type',
      choices: ['project', 'app', 'config'],
      message: 'What is the new type?',
    });

    metaConfig.type = type;

    await jsonfile.writeFile(join(currentPath, 'meta.json'), metaConfig, {
      spaces: 2,
    });
  }

  ////////////////////////////////////////////////////////////////////////////////
  // CHANGE GLOBAL
  ////////////////////////////////////////////////////////////////////////////////
  else if (property === 'global') {
    const { global } = await prompt({
      type: 'confirm',
      name: 'global',
      message: 'Is this a environment-based app  d?',
    });

    if (global) {
      metaConfig.global = 'true';
    } else {
      delete metaConfig.global;
    }

    await jsonfile.writeFile(join(currentPath, 'meta.json'), metaConfig, {
      spaces: 2,
    });
  }

  Deno.exit();
}

////////////////////////////////////////////////////////////////////////////////
// ADD A NEW PROPERTY TO A META.JSON FILE
////////////////////////////////////////////////////////////////////////////////

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

  Deno.exit();
}

////////////////////////////////////////////////////////////////////////////////
// ADD COMPOSE CONFIG
////////////////////////////////////////////////////////////////////////////////

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

  if (!metaConfig.compose) {
    metaConfig.compose = {};
  }

  metaConfig.compose[name] = {
    root,
  };

  await jsonfile.writeFile(join(currentPath, 'meta.json'), metaConfig, {
    spaces: 2,
  });

  Deno.exit();
}

////////////////////////////////////////////////////////////////////////////////
// ADD TUNNEL CONFIG
////////////////////////////////////////////////////////////////////////////////

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

  metaConfig.tunnel = {
    subdomain,
    service,
  };

  await jsonfile.writeFile(join(currentPath, 'meta.json'), metaConfig, {
    spaces: 2,
  });

  Deno.exit();
}

////////////////////////////////////////////////////////////////////////////////
// ADD TERAFORM CONFIG
////////////////////////////////////////////////////////////////////////////////

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
    .action(metaChangeProperty);

  const metaAdd = meta.command('add');
  metaChange.description('add a new property to a meta.json file');

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
