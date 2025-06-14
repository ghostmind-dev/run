# @ghostmind/run

A comprehensive DevOps automation toolkit for managing Docker containers, GitHub Actions, Terraform infrastructure, HashiCorp Vault, and more.

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
  -c, --cible <env context>                target environment context
  -p, --path <path>                        run the script from a specific path
  -h, --help                               display help for command

Commands:
  version                                  show version information
  action                                   run a github action
  custom [options] [script] [argument...]  run custom script
  docker                                   docker commands
  machine                                  create a devcontainer for the project
  meta                                     manage meta.json files
  misc                                     miscellaneous commands
  routine [script...]                      run npm style scripts
  template                                 template management commands
  terraform                                infrastructure definition
  tunnel                                   Run a cloudflared tunnel to a local service
  vault                                    manage project secrets
  help [command]                           display help for command
```

## License

MIT
