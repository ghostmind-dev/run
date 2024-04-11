import { $, cd, fs } from "npm:zx";
import {
  detectScriptsDirectory,
  verifyIfMetaJsonExists,
} from "../utils/divers.ts";

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
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function npm(program: any) {
  const npm = program.command("npm");
  npm
    .description("run npm scxripts")
    .argument("<script>", "script to run")
    .action(async (script: any) => {
      $.verbose = true;

      if (!fs.existsSync("package.json")) {
        const { npm } = metaConfig;

        if (npm) {
          let { scripts } = npm;

          if (scripts && scripts[script]) {
            // create a tmp package.json with the scripts
            const packageJson = {
              name: "tmp",
              version: "1.0.0",
              scripts: { ...scripts },
            };

            fs.writeFileSync(
              "/tmp/package.json",
              JSON.stringify(packageJson, null, 2)
            );

            await $`cd /tmp && npm run ${script}`;
          }

          return;
        }
      }

      //   await $`npm run ${script}`;
    });
}
