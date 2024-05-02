// ex. scripts/build_npm.ts
import { build, emptyDir } from "@deno/dnt";

export default async function (arg: any, options: any) {
  await emptyDir("./npm");

  await build({
    entryPoints: ["./run/main.ts"],
    outDir: "./npm",
    shims: {
      deno: true,
    },
    package: {
      // package.json properties
      name: "run",
      version: Deno.args[0],
      description: "misc utils",
      license: "MIT",
      repository: {
        type: "git",
        url: "git+https://github.com/ghostmind-dev/run.git",
      },
    },
    postBuild() {
      // steps to run after building and before running the tests
      Deno.copyFileSync("LICENSE", "npm/LICENSE");
      Deno.copyFileSync("README.md", "npm/README.md");
    },
  });
}
