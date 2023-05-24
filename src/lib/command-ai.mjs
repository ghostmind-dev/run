import { $, which, sleep, cd } from 'zx';
import core from '@actions/core';
import {
  detectScriptsDirectory,
  verifyIfMetaJsonExists,
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

  description = 'This tool return the tree view of thhe user directory';

  async _call() {
    const treeView = await this.generateTreeView(LOCALHOST_SRC);
    return JSON.stringify(treeView, null, 2);
  }

  async generateTreeView(dir, tree = {}) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      // ignore node_modules by default

      if (entry.isDirectory()) {
        const fullPath = path.join(dir, entry.name);
        if (
          fullPath.includes('node_modules') ||
          fullPath.includes('.git') ||
          fullPath.includes('.next') ||
          fullPath.includes('.vercel') ||
          fullPath.includes('.terraform') ||
          fullPath.includes('.cache') ||
        ) {
          continue;
        }
        tree[entry.name] = await this.generateTreeView(fullPath);
      } else {
        tree[entry.name] = entry.name;
      }
    }

    return tree;
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
    const model = new OpenAI({ temperature: 0 });
    const executor = await initializeAgentExecutorWithOptions([tree], model, {
      agentType: 'zero-shot-react-description',
    });

    console.log('Loaded agent.');

    const input = `
    Context of the question: User app directory
å
    Question: ${question.question}
    
    `;

    const result = await executor.call({ input });

    console.log(`Got output ${result.output}`);
    console.log(answer);
  });
}
