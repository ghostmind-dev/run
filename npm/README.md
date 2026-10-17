# @ghostmind-dev/run

The npm launcher of [`run`](https://github.com/ghostmind-dev/run), a CLI for Ghostmind projects: a
projects dashboard, herdr workspaces and routines.

`run` is a Deno program published on JSR as [`@ghostmind/run`](https://jsr.io/@ghostmind/run). This
package installs a `run` command that starts the JSR release of the same version with your Deno, so it
needs [Deno](https://deno.com) 2 on the PATH (or `DENO_BIN` set to it).

```bash
npm install --global @ghostmind-dev/run
```

Without npm: `deno install --allow-all --global --name run jsr:@ghostmind/run/cmd`. The documentation
is in the [repository](https://github.com/ghostmind-dev/run).
