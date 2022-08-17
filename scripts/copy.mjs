import { $ } from 'zx';

// this should copy the dvx-folder to the

export default async function cmd() {
  await $`rm -rf ${process.env.SRC}/dev/live-command`;
  await $`cp -r ${process.env.SRC}/dev/dvc-command /tmp/`;
  await $`mv /tmp/dvc-command ${process.env.SRC}/dev/live-command`;
  await $`rm -rf ${process.env.SRC}/dev/live-command/.git`;
}
