import { $, which, sleep, cd, fs } from "zx";
import {
  detectScriptsDirectory,
  verifyIfMetaJsonExists,
  recursiveDirectoriesDiscovery,
} from "../utils/divers.mjs";
import _ from "lodash";
import path from "path";

////////////////////////////////////////////////////////////////////////////////
// MUTE BY DEFAULT
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

////////////////////////////////////////////////////////////////////////////////
// RUNNING COMMAND LOCATION
////////////////////////////////////////////////////////////////////////////////

let currentPath = await detectScriptsDirectory(process.cwd());

cd(currentPath);

////////////////////////////////////////////////////////////////////////////////
// GET DOCKERFILE NAME AND IMAGE NAME
////////////////////////////////////////////////////////////////////////////////

export async function getDockerfileAndImageName(component) {
  $.verbose = true;
  const ENV = `${process.env.ENV}`;
  let currentPath = await detectScriptsDirectory(process.cwd());

  let { docker } = await verifyIfMetaJsonExists(currentPath);

  component = component || "default";

  let { root, image, context_dockerfile } = docker[component];

  let dockerFileName;
  let dockerfile;
  let dockerContext;

  if (context_dockerfile === false) {
    dockerFileName = `Dockerfile`;
  } else {
    dockerFileName = `Dockerfile.${ENV}`;
  }

  dockerfile = `${currentPath}/${root}/${dockerFileName}`;
  dockerContext = `${currentPath}/${root}`;

  // $.verbose = true;

  image = `${image}:${ENV}`;

  return { dockerfile, dockerContext, image };
}

////////////////////////////////////////////////////////////////////////////////
// GET LATEST IMAGE DIGEST
////////////////////////////////////////////////////////////////////////////////

export async function getDockerImageDigest(arch, component) {
  let { image } = await getDockerfileAndImageName(component);

  // rempcve the tag from the image name

  if (arch === "amd64") {
    $.verbose = true;

    const imageDigestRaw = await $`docker manifest inspect ${image}`;

    const jsonManifest = JSON.parse(`${imageDigestRaw}`);

    // find manifest with platform amd64

    const digest = jsonManifest.manifests.map((manifest) => {
      if (manifest.platform.architecture === "amd64") {
        return manifest.digest;
      }
    });

    image = image.split(":")[0];
    return `${image}@${digest[0]}`;
    // remove undefined from the array
  } else if (arch === "arm64") {
    $.verbose = false;

    const imageDigestRaw = await $`docker manifest inspect ${image}`;

    const jsonManifest = JSON.parse(`${imageDigestRaw}`);

    // find manifest with platform amd64

    const digest = jsonManifest.manifests.map((manifest) => {
      if (manifest.platform.architecture === "arm64") {
        return manifest.digest;
      }
    });

    image = image.split(":")[0];
    return `${image}@${digest[0]}`;
    // remove undefined from the array
  } else {
    const imageDigestRaw =
      await $`docker inspect --format='{{index .RepoDigests 0}}' ${image}`;
  }
}

////////////////////////////////////////////////////////////////////////////////
// DOCKER PUSH ENTRYPOINT
////////////////////////////////////////////////////////////////////////////////

export async function dockerPushActionEntry(options) {
  const { all } = options;

  if (all) {
    await dockerPushAll();
  } else {
    await dockerPushUnit();
  }
}

////////////////////////////////////////////////////////////////////////////////
// DOCKER BUILD
////////////////////////////////////////////////////////////////////////////////

export async function dockerBuildActionEntry(component, options) {
  const { all } = options;

  await dockerBuildUnit(component, options);
}

////////////////////////////////////////////////////////////////////////////////
// DOCKER BUILD UNIT
////////////////////////////////////////////////////////////////////////////////
export async function dockerBuildUnit(component, options) {
  const { amd64, arm64, argument } = options;

  const { dockerfile, dockerContext, image } = await getDockerfileAndImageName(
    component
  );

  // Determine the machine architecture
  const ARCHITECTURE = process.arch;

  if (amd64) {
    // Ensure a buildx builder instance exists and is bootstrapped
    try {
      await $`docker buildx use mybuilder`;
    } catch {
      // If 'mybuilder' doesn't exist, create and bootstrap it
      await $`docker buildx create --name mybuilder --use`;
      await $`docker buildx inspect mybuilder --bootstrap`;
    }

    let baseCommand = [
      "docker",
      "buildx",
      "build",
      "--platform=linux/amd64",
      "-t",
      `${image}-amd64`,
      "--file",
      dockerfile,
      "--push",
      dockerContext,
    ];

    if (argument) {
      argument.map((arg) => {
        baseCommand.push("--build-arg");
        baseCommand.push(arg);
      });
    }

    await $`${baseCommand}`;

    $.verbose = false;

    // verify if image-arm64 exists

    try {
      const arm64Exists = await $`docker manifest inspect ${image}-arm64`;
      await $`docker manifest create ${image} ${image}-amd64 ${image}-arm64`;
    } catch (e) {
      $.verbose = true;
      await $`docker manifest create ${image} ${image}-amd64 --amend`;
      await $`docker manifest push ${image}`;
    }
  } else if (arm64) {
    try {
      await $`docker buildx use mybuilder`;
    } catch {
      // If 'mybuilder' doesn't exist, create and bootstrap it
      await $`docker buildx create --name mybuilder --use`;
      await $`docker buildx inspect mybuilder --bootstrap`;
    }

    let baseCommand = [
      "docker",
      "buildx",
      "build",
      "--platform",
      "linux/arm64",
      "-t",
      image,
      "-t",
      `${image}-arm64`,
      "--file",
      dockerfile,
      "--push",
      dockerContext,
    ];

    if (argument) {
      argument.map((arg) => {
        baseCommand.push("--build-arg");
        baseCommand.push(arg);
      });
    }

    await $`${baseCommand}`;

    try {
      $.verbose = false;
      const arm64Exists = await $`docker manifest inspect ${image}-amd64`;
      await $`docker manifest create ${image} ${image}-amd64 ${image}-arm64`;
    } catch (e) {
      await $`docker manifest create ${image} ${image}-arm64 --amend`;
      await $`docker manifest push ${image}`;
    }
  } else {
    let baseCommand = [
      "docker",
      "build",
      "-t",
      image,
      "--file",
      dockerfile,
      "--push",
      dockerContext,
    ];

    if (argument) {
      argument.map((arg) => {
        baseCommand.push("--build-arg");
        baseCommand.push(arg);
      });
    }

    await $`${baseCommand}`;
  }
}

////////////////////////////////////////////////////////////////////////////////
// DOCKER COMPOSE UP
////////////////////////////////////////////////////////////////////////////////

export async function dockerComposeUp(component, options) {
  let { file, forceRecreate } = options;

  if (file === undefined) {
    file = "compose.yaml";
  }

  let metaConfig = await fs.readJsonSync("meta.json");

  let { compose } = metaConfig;

  component = component || "default";

  let { root } = compose[component];

  const baseCommand = ["docker", "compose", "-f", `${root}/${file}`, "up"];
  if (forceRecreate) {
    baseCommand.push("--force-recreate");
  }

  $.verbose = true;

  await $`${baseCommand}`;
}

////////////////////////////////////////////////////////////////////////////////
// DOCKER COMPOSE BUILD
////////////////////////////////////////////////////////////////////////////////

export async function dockerComposeBuild(component, options) {
  let { file, cache } = options;

  if (file === undefined) {
    file = "compose.yaml";
  }

  let metaConfig = await fs.readJsonSync("meta.json");

  let { compose } = metaConfig;

  component = component || "default";

  let { root } = compose[component];

  const baseCommand = ["docker", "compose", "-f", `${root}/${file}`, "build"];

  if (cache === undefined) {
    baseCommand.push("--no-cache");
  }

  $.verbose = true;

  await $`${baseCommand}`;
}

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function commandDocker(program) {
  const docker = program.command("docker");
  docker.description("docker commands");

  const dockerBuild = docker.command("build");
  dockerBuild.description("Build docker image");
  dockerBuild.option("-a, --all", "Build all docker images");
  dockerBuild.option(
    "-arg, --argument <arguments...>",
    "Build docker image with arguments"
  );
  dockerBuild.option("--amd64", "Build amd64 docker image");
  dockerBuild.option("--arm64", "Build arm64 docker image");
  dockerBuild.argument("[component]", "Component to build");
  dockerBuild.action(dockerBuildActionEntry);

  const dockerCompose = docker.command("compose");
  dockerCompose.description("docker compose commands");

  dockerCompose
    .command("up")
    .description("docker compose up")
    .action(dockerComposeUp)
    .argument("[component]", "Component to build")
    .option("-f, --file <file>", "docker compose file")
    .option("--force-recreate", "force recreate")
    .option("-e, --envfile <file>", "env filename");

  dockerCompose
    .command("build")
    .description("docker compose build")
    .argument("[component]", "Component to build")
    .action(dockerComposeBuild)
    .option("-f, --file <file>", "docker compose file")
    .option("--cache", "enable cache");
}
