import { $, cd } from "zx";
import {
  verifyIfMetaJsonExists,
  detectScriptsDirectory,
} from "../utils/divers.mjs";
import { initializeAgentExecutorWithOptions } from "langchain/agents";
import { ChatOpenAI } from "langchain/chat_models/openai";
import { z } from "zod";
import { StructuredTool } from "langchain/tools";
import readline from "readline";

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
// TOOL: GET TREE OF DIRECTORIES
////////////////////////////////////////////////////////////////////////////////

class GetTreeViewFromCurrentDirectory extends StructuredTool {
  schema = z.object({});
  name = "GetTreeViewFromCurrentDirectory";

  description = "Get tree of directories from current directory";

  constructor() {
    super(...arguments);
  }

  async _call() {
    // call tree and ignore node_modules
    const directories = await $`tree -I node_modules`;

    return `${directories}`;
  }
}

////////////////////////////////////////////////////////////////////////////////
// TOOL: EXECUTE A COMMAND
////////////////////////////////////////////////////////////////////////////////

class ExecuteCommand extends StructuredTool {
  schema = z.object({
    commands: z.array(z.string()),
    return_last_command: z.boolean().optional(),
  });

  name = "ExecuteCommand";

  description = "Execute a command.Only one command at the time";

  constructor() {
    super(...arguments);
  }

  async _call({ commands, result }) {
    // teansform command to array

    $.verbose = true;

    await $`pwd`;

    // execute all commands. for the last command, return the result

    let numberOfCommands = commands.length;

    for (let i = 0; i < numberOfCommands; i++) {
      const commandRaw = commands[i];

      const command = commandRaw.split(" ");

      let resultRaw = await $`${command}`;

      if (i === numberOfCommands - 1) {
        if (result) {
          return resultRaw;
        }
      }
    }
  }
}

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function ghost(program) {
  const ghost = program.command("ghost");
  ghost.description("I will try my best to help");
  ghost.action(async () => {
    $.verbose = true;

    const greating = "How can I help you? ";

    // get input from user

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(greating, async (userRequest) => {
      const chat = new ChatOpenAI({ modelName: "gpt-4", temperature: 0 });

      const tools = [
        new GetTreeViewFromCurrentDirectory(),
        new ExecuteCommand(),
      ];

      const executor = await initializeAgentExecutorWithOptions(tools, chat, {
        agentType: "openai-functions",
        verbose: true,
      });

      const result = await executor.run(`

        You will be answer command line questions.

        When you receive a question, you need to undestand your environment.

        if you need to perform a command that requires a specific directory, you need to get a view of the directories.

        WHen ask about opening a project, always execute the command in the folder, not on a file.

        Quesiton: ${userRequest}

        `);
      console.log(result);
      rl.close();
    });
  });
}
