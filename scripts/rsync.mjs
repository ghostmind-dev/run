import { $ } from "zx";

// this should copy the dvx-folder to the

const rsyncArgs = [
  "-a",
  "--exclude='.git/*'",
  "--exclude='node_modules/*'",
  "--exclude='package-lock.json'",
  `${process.env.SRC}/dev/live-command/`,
  `${process.env.SRC}/dev/dvc-command/`,
];

export default async function cmd() {
  await $`rsync ${rsyncArgs}`;
}
