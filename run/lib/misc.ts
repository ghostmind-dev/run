import { $ } from 'npm:zx';
import * as inquirer from 'npm:inquirer';
import { createUUID } from '../utils/divers.ts';

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function misc(program: any) {
  const misc = program.command('misc');

  misc
    .command('commit')
    .description('git ad,commit,push')
    .action(async () => {
      $.verbose = true;

      const prompt = inquirer.createPromptModule();

      // ask for the commit message

      const { message } = await prompt([
        {
          type: 'input',
          name: 'message',
          message: 'Enter commit message',
        },
      ]);

      try {
        await $`git add . &&
                git commit -m "${message}" &&
                git push origin main
                `;
      } catch (e) {
        console.error('git awaye failed');
        return;
      }
    });

  misc
    .command('uuid')
    .description('generate a random UUID')
    .argument('[length]', 'length of the UUID')
    .action(async (length: number) => {
      let uuid: string;

      if (length) {
        uuid = await createUUID(length);
        console.log(uuid);
        return;
      }

      uuid = await createUUID();
      console.log(uuid);
    });
}

////////////////////////////////////////////////////////////////////////////////
// THE END
////////////////////////////////////////////////////////////////////////////////
