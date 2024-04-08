import { $, cd, fs, sleep } from "npm:zx";
import {
  withMetaMatching,
  verifyIfMetaJsonExists,
  detectScriptsDirectory,
  setSecretsUptoProject,
  recursiveDirectoriesDiscovery,
  getFilesInDirectory,
} from "../utils/divers.ts";
import { nanoid } from "npm:nanoid";
import jsonfile from "npm:jsonfile";
import * as inquirer from "npm:inquirer";
import { join } from "https://deno.land/std@0.221.0/path/mod.ts";

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
// CURRENT METADATA
////////////////////////////////////////////////////////////////////////////////

let metaConfig = await verifyIfMetaJsonExists(currentPath);

////////////////////////////////////////////////////////////////////////////////
// QUICK COMMIT AMEND
////////////////////////////////////////////////////////////////////////////////

export async function quickAmend() {
  $.verbose = true;

  try {
    await $`git rev-parse --is-inside-work-tree 2>/dev/null`;
    await $`echo "git amend will begin" &&
        git add . &&
        git commit --amend --no-edit &&
        git push origin main -f
    `;
  } catch (e) {
    console.error("git amend failed");
    return;
  }
}

////////////////////////////////////////////////////////////////////////////////
// QUICK COMMIT AND PUSH
////////////////////////////////////////////////////////////////////////////////

export async function quickCommit() {
  $.verbose = true;

  try {
    await $`echo "git commit will begin" &&
        git add . &&
        git commit -m "quick commit" &&
        git push origin main -f
    `;
  } catch (e) {
    console.error("git commit failed");
    return;
  }
}

////////////////////////////////////////////////////////////////////////////////
// DEV INSTALL
////////////////////////////////////////////////////////////////////////////////

export async function devInstallDependencies() {
  const directories = await withMetaMatching({ property: "development.init" });

  for (const directoryDetails of directories) {
    const { directory, config } = directoryDetails;

    const { init } = config.development;

    $.verbose = true;

    for (let script of init) {
      const scriptArray = script.split(" ");

      cd(directory);

      await $`${scriptArray}`;
    }
  }
}

////////////////////////////////////////////////////////////////////////////////
// CHANGE ENVIRONMENT
////////////////////////////////////////////////////////////////////////////////

export async function envDevcontainer() {
  // const directories = await withMetaMatching({
  //   property: 'scope',
  //   value: 'environment',
  // });

  const HOME = Deno.env.get("HOME");

  $.verbose = false;

  const currentBranchRaw = await $`git branch --show-current`;
  // trim the trailing newline
  const currentBranch = currentBranchRaw.stdout.trim();

  let environemnt;
  if (currentBranch === "main") {
    environemnt = "prod";
  } else if (currentBranch === "preview") {
    environemnt = "preview";
  } else {
    environemnt = "dev";
  }

  $.verbose = true;

  // set environment name in zshenv

  await $`echo "export ENV=${environemnt}" > ${HOME}/.zshenv`;

  Deno.env.set("ENV", environemnt);

  return environemnt;
}

////////////////////////////////////////////////////////////////////////////////
// CREATE A SHORT UUID
////////////////////////////////////////////////////////////////////////////////

export async function createShortUUID(options = { print: false }) {
  const { print } = options;
  const id = nanoid(12);

  if (print) {
    console.log(id);
    return;
  }

  return id;
}

////////////////////////////////////////////////////////////////////////////////
// CREATE A METADATA FILE
////////////////////////////////////////////////////////////////////////////////

export async function createMetaFile() {
  const id = await createShortUUID();

  const prompt = inquirer.createPromptModule();

  const { name } = await prompt({
    type: "input",
    name: "name",
    message: "What is the name of this object?",
  });
  const { type } = await prompt({
    type: "input",
    name: "type",
    message: "What is the type of this object?",
  });
  const { scope } = await prompt({
    type: "input",
    name: "scope",
    message: "What is the scope of this object?",
  });
  const meta = {
    name,
    type,
    scope,
    id,
  };

  await jsonfile.writeFile("meta.json", meta, { spaces: 2 });
}

////////////////////////////////////////////////////////////////////////////////
// CHANGE ALL IDS IN A META.JSON FILE
////////////////////////////////////////////////////////////////////////////////

export async function changeAllIds(options: any) {
  const startingPath = options.current
    ? currentPath
    : Deno.env.get("SRC") || currentPath;

  // ask the user if they want to change all ids

  const prompt = inquirer.createPromptModule();

  const { changeAllIds } = await prompt({
    type: "confirm",
    name: "changeAllIds",
    message: "Do you want to change all ids?",
  });

  if (!changeAllIds) {
    return;
  }

  const directories = await recursiveDirectoriesDiscovery(startingPath);

  for (const directory of directories) {
    const metaConfig = await verifyIfMetaJsonExists(directory);

    // if directory matches ${SRC}/dev/** continue to next iteration

    if (directory.includes(`${startingPath}/dev`)) {
      continue;
    }

    if (metaConfig) {
      metaConfig.id = nanoid(12);

      await jsonfile.writeFile(join(directory, "meta.json"), metaConfig, {
        spaces: 2,
      });
    }
  }

  let metaConfig = await verifyIfMetaJsonExists(startingPath);

  metaConfig.id = nanoid(12);

  await jsonfile.writeFile(join(startingPath, "meta.json"), metaConfig, {
    spaces: 2,
  });
}
////////////////////////////////////////////////////////////////////////////////
// COMMIT CHANGES
////////////////////////////////////////////////////////////////////////////////

export async function commitChangesReturn(commit: any) {}

////////////////////////////////////////////////////////////////////////////////
// INSTALL DEPENDENCIES
////////////////////////////////////////////////////////////////////////////////

export async function installDependencies() {
  $.verbose = true;
  await $`brew install vault`;

  const VAULT_TOKEN = Deno.env.get("VAULT_TOKEN");

  await $`vault login ${VAULT_TOKEN}`;
}

////////////////////////////////////////////////////////////////////////////////
// REPO
////////////////////////////////////////////////////////////////////////////////

export async function repoConvert(arg: any) {
  const { repo } = metaConfig;

  const { description } = repo;

  let filesContent = [];

  let folderList = await recursiveDirectoriesDiscovery(currentPath);

  folderList.push(currentPath);

  for (const folder of folderList) {
    const files = await getFilesInDirectory(folder);

    for (const file of files) {
      const filePath = join(folder, file);

      const fileContent = await fs.readFile(filePath, "utf8");

      // remove the currentPath from the filePath

      const filePathWithoutCurrentPath = filePath.replace(currentPath, "");

      filesContent.push({
        path: filePathWithoutCurrentPath.slice(1),
        content: fileContent,
      });
    }
  }

  // invert the filesContent array

  filesContent = filesContent.reverse();
  // create a single json file with the content of the repo object

  fs.writeFile(
    `${currentPath}/repo.json`,
    JSON.stringify({ files: filesContent }, null, 4),
    "utf8"
  );
}

////////////////////////////////////////////////////////////////////////////////
// TEMPLATE EXPORT
////////////////////////////////////////////////////////////////////////////////

export async function templateExport(arg: any) {
  //
  // return the content of this url (raw .tf)
  // create a file in the current directory with the content of the url

  cd(currentPath);

  $.verbose = true;

  if (arg === "main.tf") {
    await $`curl -o ${currentPath}/main.tf https://gist.githubusercontent.com/komondor/8c8d892393a233aeb80ede067f6ddd50/raw/7bf0025923fb9964c25333ad887de6da71b54fdd/main.tf`;
    return;
  }

  if (arg === "variables.tf") {
    await $`curl -o ${currentPath}/variables.tf https://gist.githubusercontent.com/komondor/fc5f8340c7a4f05d14f6b3b715c7a6b6/raw/6e91993eb7cb6c50800f7ee8c77e5ea35ff72333/variables.tf`;
    return;
  }

  if (arg === ".env.example") {
    await $`curl -o ${currentPath}/.env.example https://gist.githubusercontent.com/komondor/24b631dc1d18b6b20cb9ca2d8b31bfce/raw/bb99c34141c27bb0d93e0bcd9ce837e6547fb843/.env.example`;
    return;
  }

  if (arg === "oas.json") {
    await $`curl -o ${currentPath}/oas.json https://gist.githubusercontent.com/komondor/e4e16ad2a2046afe4aaa613a5b0a6748/raw/2c3383a4ae8c343c7def376a198811d2319bab5c/oas.json`;
    return;
  }

  console.error("template not found");
}

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function utils(program: any) {
  const utils = program.command("utils");
  utils.description("collection of utils");
  const git = utils.command("git");
  git.description("git utils");
  const dev = utils.command("dev");
  dev.description("devcontainer utils");
  const nanoid = utils.command("nanoid");
  dev.description("devcontainer utils");
  const meta = utils.command("meta");
  meta.description("meta utils");
  const commit = utils.command("commit");
  const dependencies = utils.command("dependencies");
  dependencies.description("dependencies install");

  const template = utils.command("template");
  template.description("template utils");
  template.argument("[template]", "template to export");
  template.action(templateExport);

  const repo = utils.command("repo");

  repo.description("repo utils");
  repo.action(repoConvert);
  repo.argument("[repo]", "repo to convert");

  const gitAmend = git.command("amend");
  gitAmend.description("amend the last commit");
  gitAmend.action(quickAmend);

  const gitCommit = git.command("commit");
  gitCommit.description("quick commit");
  gitCommit.action(quickCommit);

  const devInstall = dev.command("install");
  devInstall.description("install app dependencies");
  devInstall.action(devInstallDependencies);

  const devEnv = dev.command("env");
  devEnv.description("change environement");
  devEnv.action(envDevcontainer);

  const id = nanoid.command("id");
  id.description("generate a nanoid");
  id.option("p, --print", "print the id");
  id.action(createShortUUID);

  const metaCreate = meta.command("create");
  metaCreate.description("create a meta.json file");
  metaCreate.action(createMetaFile);

  const devMetaChangeId = meta.command("ids");
  devMetaChangeId.description("change all ids in a meta.json file");
  devMetaChangeId.option("--current", "start from currentPath");
  devMetaChangeId.action(changeAllIds);

  const commitChanges = commit.command("changes");
  commitChanges.description("return an array of changed files");
  commitChanges.argument("[commit]", "commit to compare to]");
  commitChanges.action(commitChangesReturn);

  const dependenciesInstall = dependencies.command("install");
  dependenciesInstall.description("install dependencies");
  dependenciesInstall.action(installDependencies);
}
