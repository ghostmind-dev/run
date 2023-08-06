import { $, which, sleep, cd } from "zx";
import fs from "fs";
import path from "path";
import {
  detectScriptsDirectory,
  verifyIfMetaJsonExists,
} from "../utils/divers.mjs";
import inquirer from "inquirer";
import { z } from "zod";

import { StructuredTool } from "langchain/tools";
import { OpenAI } from "langchain/llms/openai";
import { ChatOpenAI } from "langchain/chat_models/openai";
import { initializeAgentExecutorWithOptions } from "langchain/agents";

////////////////////////////////////////////////////////////////////////////////
// MUTE BY DEFAULT
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

////////////////////////////////////////////////////////////////////////////////
// CONSTANTS
////////////////////////////////////////////////////////////////////////////////

const LOCALHOST_SRC =
  process.env.CODESPACES === "true"
    ? process.env.SRC
    : process.env.LOCALHOST_SRC;

////////////////////////////////////////////////////////////////////////////////
// RUNNING COMMAND LOCATION
////////////////////////////////////////////////////////////////////////////////

let currentPath = await detectScriptsDirectory(process.cwd());

cd(currentPath);

////////////////////////////////////////////////////////////////////////////////
// CURRENT METADATA
////////////////////////////////////////////////////////////////////////////////

let metaConfig = await verifyIfMetaJsonExists(currentPath);

////////////////////////////////////////////////////////////////////////////////
// TOOL: EXECUTE COMMAND
////////////////////////////////////////////////////////////////////////////////

class InstallDependenciesTool extends StructuredTool {
  schema = z.object({
    command: z.string(),
  });

  name = "install_dependencies";

  description = "Tool to install dependencies for the app";

  constructor() {
    super(...arguments);
  }

  async _call({ command }) {
    // transorform to an array

    const commandArray = command.split(" ");
    await $`${commandArray}`;
    return "done";
  }
}

////////////////////////////////////////////////////////////////////////////////
// TOOL: GENERATE TEMPLATE
////////////////////////////////////////////////////////////////////////////////

class TemplateTool extends StructuredTool {
  schema = z.object({
    files: z.array(
      z.object({
        file_path_with_extension: z.string(),
        file_content: z.string(),
      })
    ),
  });

  name = "generate_template";

  description = "write the app files and folders to the current directory";

  constructor() {
    super(...arguments);
  }

  async _call({ files }) {
    files.forEach(async (file) => {
      const dir = path.dirname(
        `${currentPath}/${file.file_path_with_extension}`
      );

      // Create the directory if it doesn't exist
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(
        `${currentPath}/${file.file_path_with_extension}`,
        file.file_content
      );
    });

    return "The template has been added!";
  }
}

////////////////////////////////////////////////////////////////////////////////
// GENERATE APP
////////////////////////////////////////////////////////////////////////////////

async function generateApp() {
  // ask the user for the type of app (nodejs, react,python, etc)

  const { description } = await inquirer.prompt([
    {
      type: "input",
      name: "description",
      message:
        "What is the type of app you want to generate? Plesase be specific:",
    },
  ]);

  const executor = await initializeAgentExecutorWithOptions(
    [new TemplateTool(), new InstallDependenciesTool()],
    // new ChatOpenAI({ modelName: "gpt-4-0613", temperature: 0.4 }),
    new ChatOpenAI({ modelName: "gpt-3.5-turbo-16k", temperature: 0.4 }),
    {
      agentType: "openai-functions",
      verbose: true,
    }
  );

  const result = await executor.run(`
    We need to generate an app from a user description.

    Requirements:[
      We have to generate all the files and folders for the app,
      We have to generate the code for the app,
      We have to generate the tests for the app,
      We have to generate the documentation for the app
      We have to include good practices for the app (example: .gitignore, .editorconfig, etc)
      We need to install the dependencies for the app
    ]

    Tips for generating the app: [
      Awlays create the dependencies file at the end (generate the file,verify which dependencies are needed then generate the dependencies file)
    ]

    Description by the user: ${description}
    
  `);
}

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function app(program) {
  const app = program.command("app");
  app.description("generate an app on demand");

  const generate = app.command("generate");
  generate.description("generate an app on demand");
  generate.action(generateApp);
}
