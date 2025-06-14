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

## Usage

### Programmatic API

```typescript
import { dockerBuild, actionRunLocal, terraformActivate } from '@ghostmind/run';

await dockerBuild('my-component');
await actionRunLocal('test-workflow');
await terraformActivate('infrastructure');
```

### CLI Usage

```bash
run docker build --component my-app
run action local test-workflow
run terraform activate --component infrastructure
```

## Configuration

Create a `meta.json` file in your project root:

```json
{
  "id": "my-project",
  "name": "my-project",
  "type": "application"
}
```

## Available Commands

- `action` - GitHub Actions operations
- `docker` - Docker and Docker Compose management
- `terraform` - Infrastructure as code operations
- `vault` - HashiCorp Vault secret management
- `tunnel` - Cloudflare Tunnel management
- `custom` - Custom script execution
- `template` - Project template management
- `machine` - Development environment setup
- `meta` - Configuration file management

## Requirements

- Deno 1.40+ or Node.js 18+
- Docker (for Docker operations)
- Terraform (for infrastructure operations)
- HashiCorp Vault (for secret management)

## License

MIT
