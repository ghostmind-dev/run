# @ghostmind/run

A CLI toolkit for Ghostmind projects: a projects dashboard, herdr workspaces, routines, and more.

## Installation

### Using JSR (recommended)

```bash
# Deno
deno add jsr:@ghostmind/run

# npm
npx jsr add @ghostmind/run
```

### Using as a CLI tool

```bash
# Install globally with Deno
deno install --allow-all -n run jsr:@ghostmind/run/cmd
```

## Commands

```
Usage: run [options] [command]

Options:
  -v, --version              show version information
  -c, --cible <env context>  legacy: load .env.<context> (being removed)
  -e, --env <env path>       legacy: folder to load .env files from (being removed)
  -p, --path <path>          run the script from a specific path
  -h, --help                 display help for command

Commands:
  herdr                      herdr workspace management commands
  projects [options]         dashboard over every project and its herdr workspace
  routine [script...]        run npm style scripts
```

- `run projects` opens the dashboard: every folder under `$RUN_PROJECT` whose
  `meta.json` has `"type": "project"`, with its herdr workspace, git branch and
  uncommitted changes. Open and close workspaces from it.
- `run routine <name>` runs an entry of the current folder's `routines`.
- `run herdr init <label> --all [--start]` builds a herdr workspace from the
  project's `meta.json` files; `--start` also runs each pane's routine.

## Claude skill

The repo ships a Claude plugin with one skill that explains the dashboard,
routines, herdr workspaces and `meta.json`:

```
/plugin install run --marketplace ghostmind-dev/run
```

## License

MIT
