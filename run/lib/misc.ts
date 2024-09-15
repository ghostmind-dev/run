import { $ } from 'npm:zx@8.1.0';
import * as inquirer from 'npm:inquirer@9.2.22';
import { createUUID } from '../utils/divers.ts';
import { verifyIfMetaJsonExists } from '../utils/divers.ts';

////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function misc(program: any) {
  const misc = program.command('misc');
  misc.description('miscellaneous commands');

  ////////////////////////////////////////////////////////////////////////////
  // GIT AWAYE
  ////////////////////////////////////////////////////////////////////////////

  misc
    .command('commit')
    .description('git add,commit,push')
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

      const branchRaw = await $`git branch --show-current`;

      const branch = branchRaw.stdout.trim();

      try {
        await $`git add .`;
        await $`git commit -m ${message}`;
        await $`git push origin ${branch}`;
      } catch (e) {
        Deno.exit(0);
        return;
      }

      Deno.exit(0);
    });

  ////////////////////////////////////////////////////////////////////////////
  // GENERATE A UUID
  ////////////////////////////////////////////////////////////////////////////

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

  ////////////////////////////////////////////////////////////////////////////
  // GENERATE A UUID
  ////////////////////////////////////////////////////////////////////////////

  misc
    .command('exec')
    .description('initiate an interactive shell in a running devcontainer')

    .argument('[name]', 'name of the devcontainer')
    .action(async (container: string) => {
      try {
        $.verbose = true;

        const meta = await verifyIfMetaJsonExists(Deno.cwd());

        if (!meta && !container) {
          console.log('No meta.json found');
          Deno.exit(0);
        }

        const name = container || meta?.name;

        await $`docker exec -it ${name} /bin/zsh -c "cd /workspaces/${name} && export PROMPT_EOL_MARK='' && zsh"`;
      } catch (e) {
        console.log("Are you sure in the the path of the project's root?");
        Deno.exit(0);
      }
    });
}

////////////////////////////////////////////////////////////////////////////////
// THE END
////////////////////////////////////////////////////////////////////////////////
