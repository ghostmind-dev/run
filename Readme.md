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

## Available Commands

```
Usage: run [options] [command]

Options:
  -v, --version                            show version information
  -c, --cible <env context>                target environment context
  -p, --path <path>                        run the script from a specific path
  -h, --help                               display help for command

Commands:
  herdr                                    herdr workspace management commands
  projects [options]                       dashboard over every project and its herdr workspace
  routine [script...]                      run npm style scripts
  help [command]                           display help for command
```

## License

MIT
