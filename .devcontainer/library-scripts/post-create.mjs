#!/usr/bin/env zx

const HOME = process.env.HOME;

await $`mkdir -p ${HOME}/.npm-global`;
await $`npm config set prefix ${HOME}/.npm-global`;
await $`npm config set update-notifier false`;

await $`npm install -g @ghostmind-dev/post-create`;

const NODE_PATH = "/home/vscode/.npm-global/lib/node_modules";

const { default: postCreate } = await import(
  `${NODE_PATH}/@ghostmind-dev/post-create/src/main.mjs`
);

await postCreate();
