import { $, which, sleep, cd } from 'zx';
import core from '@actions/core';
import {
  detectScriptsDirectory,
  verifyIfMetaJsonExists,
  recursiveDirectoriesDiscovery,
} from '../utils/divers.mjs';

import fs from 'fs/promises';
import path from 'path';

import { envDevcontainer } from '../main.mjs';
import { OpenAI } from 'langchain/llms/openai';
import { initializeAgentExecutorWithOptions } from 'langchain/agents';
import { Tool } from 'langchain/tools';
import * as inquirer from 'inquirer';

////////////////////////////////////////////////////////////////////////////////
// MUTE BY DEFAULT
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

////////////////////////////////////////////////////////////////////////////////
// CONSTANTS
////////////////////////////////////////////////////////////////////////////////

const LOCALHOST_SRC =
  process.env.CODESPACES === 'true'
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
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

class TreeViewTool extends Tool {
  name = 'tree-view';

  description = `This tool return the tree view of the app directory. This directory path is /workspaces/core/app`;

  async _call() {
    const treeView = await this.generateTreeView(`${LOCALHOST_SRC}/app`);
    return JSON.stringify(treeView, null, 2);
  }

  async generateTreeView(dir, tree = {}) {
    const treeView = await $`tree -I 'node_modules' ${dir}`;

    return treeView.stdout;
  }
}

class ReadFileTool extends Tool {
  name = 'read-file';

  description = 'This tool return the content of a file. Just provide the path';

  async _call(filePath) {
    // convert space with slash

    filePath = filePath.replace(/ /g, '/');

    const content = await fs.readFile(`${filePath}`, 'utf8');
    return content.toString();
  }
}

class ExecuteCommand extends Tool {
  name = 'execute-shell-command';

  description = 'Execute any shell command and return the output';

  async _call(command) {
    const commandArray = command.split(' ');

    const output = await $`${commandArray}`;

    console.log(output);

    if (output.exitCode === 0) {
      return 'Command executed successfully';
    }

    return 'Command failed';
  }
}

export default async function ai(program) {
  const ai = program.command('ai');
  ai.description('ai agent');

  const aiAsk = ai.command('ask');
  aiAsk.description('ask a question');
  // need a multi word question

  aiAsk.action(async (arg) => {
    const promptUser = inquirer.createPromptModule();
    const question = await promptUser([
      {
        type: 'input',
        name: 'question',
        message: 'What is your question?',
      },
    ]);

    const OPEANAI_API_KEY = process.env.OPEANAI_API_KEY;
    const tree = new TreeViewTool();
    const fileContent = new ReadFileTool();
    const command = new ExecuteCommand();
    const model = new OpenAI({ temperature: 0, modelName: 'gpt-4' });
    const executor = await initializeAgentExecutorWithOptions(
      [tree, fileContent, command],
      model,
      {
        agentType: 'zero-shot-react-description',
        verbose: true,
      }
    );

    console.log('Loaded agent.');

    const input = `
        Context of the question: User app directory. 
    
        Question: ${question.question}

        Instructions: 
          - If you create a new file, always validate that it workd before confirm
          - If you add content to a file, always validate that it workd before confirm

        `;

    const result = await executor.call({ input });

    console.log(`${result.output}`);
  });
}
