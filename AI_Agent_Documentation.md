# AI Agent Documentation for the `run` CLI Tool

## 1. Introduction

The `run` Command Line Interface (CLI) tool is a versatile utility built with Deno, designed to streamline and standardize various development and operational workflows. It acts as a central control plane for managing project configurations (via `meta.json`), interacting with Docker and Docker Compose, executing custom TypeScript scripts, and orchestrating complex tasks.

Its primary goals are:
*   **Consistency:** Provide a unified way to perform common development tasks across different projects and environments.
*   **Configuration-driven:** Leverage the `meta.json` file to define project-specific settings, reducing boilerplate and ensuring reproducible behavior.
*   **Extensibility:** Allow developers to write custom TypeScript scripts that can access the tool's core functionalities and context, tailoring workflows to specific needs.
*   **Simplification:** Abstract away the complexities of underlying tools like Docker, `gcloud`, and shell scripting by providing higher-level commands.

This document provides an exhaustive guide for an AI agent to understand and utilize the `run` CLI tool, its commands, configuration mechanisms, and scripting environment.

## 2. Core Concept: `meta.json`

The `meta.json` file is the backbone of the `run` CLI tool's configuration system. It's a JSON file, typically located at the root of a project, that defines metadata and settings which control how various `run` commands operate. The CLI reads this file to understand project structure, Docker configurations, custom script paths, and more.

Below is a detailed description of the properties that can be defined in `meta.json`, based on its JSON schema:

### 2.1. Root Properties

| Property      | Type    | Required | Description                                                                 | Example (Informative)          |
|---------------|---------|----------|-----------------------------------------------------------------------------|--------------------------------|
| `id`          | string  | Yes      | A unique identifier for the configuration. Must be a 12-character hex string. | `"a1b2c3d4e5f6"`               |
| `name`        | string  | Yes      | The name of the configuration (e.g., project name, service name).            | `"my-awesome-service"`         |
| `version`     | string  | No       | The version of the configuration or project.                               | `"1.2.3"`                      |
| `description` | string  | No       | A brief description of the configuration.                                   | `"Handles user authentication"`|
| `type`        | string  | No       | The type of configuration (e.g., `project`, `app`, `config`). Used by `meta create`. | `"app"`                        |
| `global`      | boolean | No       | Flag to indicate if the configuration is global or environment-based. Used by `meta create`. | `true`                         |
| `port`        | number  | No       | Default port number for the application, if applicable.                     | `8080`                         |
| `tags`        | array   | No       | An array of string tags associated with the configuration.                    | `["frontend", "api"]`          |

### 2.2. `compose` (Docker Compose Configurations)

The `compose` property is an object that holds configurations for Docker Compose. Each key under `compose` represents a named compose setup (e.g., "default", "dev").

| Sub-Property | Type   | Description                                         | Example (`compose.default.root`) |
|--------------|--------|-----------------------------------------------------|----------------------------------|
| `root`       | string | Root directory where `docker-compose.yml` (or custom filename) is located, relative to `meta.json`. | `"./deploy/compose"`             |
| `filename`   | string | Custom filename for the Docker Compose file (e.g., `docker-compose.dev.yml`). Defaults to `compose.yaml` or `docker-compose.yml` depending on the `run` tool's implementation. | `"compose.prod.yml"`             |

**Example `compose` block:**
```json
"compose": {
  "default": {
    "root": "services/main-app",
    "filename": "docker-compose.yml"
  },
  "worker": {
    "root": "services/worker-app",
    "filename": "worker-compose.yml"
  }
}
```
This section is used by `run docker compose ...` commands.

### 2.3. `custom` (Custom Script Configurations)

The `custom` property is an object that defines settings for the `run script` (formerly `run custom`) command.

| Sub-Property | Type   | Description                                                                 | Example         |
|--------------|--------|-----------------------------------------------------------------------------|-----------------|
| `root`       | string | Path to the folder containing custom scripts, relative to `meta.json`. Defaults to `"scripts"` if not specified. | `"./automation_scripts"` |

**Example `custom` block:**
```json
"custom": {
  "root": "tools/scripts"
}
```
This tells `run script <script_name>` where to look for `<script_name>.ts`.

### 2.4. `docker` (Docker Build Configurations)

The `docker` property is an object that holds configurations for Docker image builds, primarily used by `run docker build` and `run docker register`. Each key under `docker` represents a named Docker build setup (e.g., "default", "api", "frontend").

| Sub-Property      | Type    | Description                                                                                                | Example (`docker.default.image`) |
|-------------------|---------|------------------------------------------------------------------------------------------------------------|------------------------------------|
| `root`            | string  | Root directory where the `Dockerfile` is located, relative to `meta.json`.                                   | `"./app/backend"`                  |
| `image`           | string  | Base Docker image URL/name to be used (without tags like `:latest` or environment specifics; these are typically appended by the `run docker register` command). | `"docker.io/library/my-app"`     |
| `env_based`       | boolean | If `true`, assumes Dockerfile name might vary based on environment (e.g., `Dockerfile.prod`, `Dockerfile.dev`). The `run` tool will look for `Dockerfile.<ENV>` or a generic `Dockerfile`. | `true`                             |
| `context_dir`     | string  | Specifies the Docker build context directory, relative to `meta.json`. If not set, `root` is often used as the context. | `"./"` (project root)              |
| `tag_modifiers`   | array   | An array of strings. For each string, an additional Docker image tag is created in the format `<image_name>:<env>-<modifier_string>`. Used by `run docker register`. | `["gitsha", "latest-stable"]`    |

**Example `docker` block:**
```json
"docker": {
  "api": {
    "root": "services/api",
    "image": "mycompany/api-service",
    "env_based": false,
    "context_dir": ".",
    "tag_modifiers": ["commit-id"]
  }
}
```

### 2.5. `routines`

The `routines` property is an object where each key is a routine name and its value is a string command to be executed for that routine. This is used by the `run routine <routine_name>` command.

**Example `routines` block:**
```json
"routines": {
  "test": "deno test --allow-all",
  "lint": "deno lint"
}
```

### 2.6. `secrets`

The `secrets` property is an object that defines settings related to environment variable files.

| Sub-Property | Type   | Description                                                                 | Example        |
|--------------|--------|-----------------------------------------------------------------------------|----------------|
| `base`       | string | Path to a base environment variables file (e.g., `.env.base`), relative to `meta.json`. | `"./.env.defaults"` |

**Example `secrets` block:**
```json
"secrets": {
  "base": ".env.base"
}
```
The `run` tool's preAction hook uses this to load environment variables.

### 2.7. `terraform`

The `terraform` property is an object holding configurations for Terraform setups. Each key under `terraform` represents a named Terraform configuration (e.g., "core", "networking"). This is used by `run terraform ...` commands.

| Sub-Property | Type    | Description                                                                   | Example (`terraform.core.path`) |
|--------------|---------|-------------------------------------------------------------------------------|---------------------------------|
| `path`       | string  | Path to the Terraform configuration directory, relative to `meta.json`.       | `"./infra/core"`                |
| `global`     | boolean | Flag to indicate if this Terraform configuration is global or environment-specific. | `false`                         |
| `containers` | array   | List of container names (strings) to be used or referenced by this Terraform setup. | `["app-service", "db-service"]` |

**Example `terraform` block:**
```json
"terraform": {
  "main_vpc": {
    "path": "infra/vpc",
    "global": true
  },
  "app_cluster": {
    "path": "infra/eks",
    "global": false,
    "containers": ["api_container", "worker_container"]
  }
}
```

### 2.8. `tunnel`

The `tunnel` property is an object holding configurations for creating tunnels (e.g., using Cloudflare Tunnel or similar). Each key under `tunnel` represents a named tunnel setup. This is used by `run tunnel ...` commands.

| Sub-Property | Type   | Description                                                              | Example (`tunnel.myapp.hostname`) |
|--------------|--------|--------------------------------------------------------------------------|-----------------------------------|
| `hostname`   | string | The public hostname for the tunnel (e.g., `myapp.example.com`).          | `"dev.myapp.mydomain.com"`        |
| `service`    | string | The local service URL to be exposed via the tunnel (e.g., `localhost:8080`). | `"http://localhost:3000"`         |

**Example `tunnel` block:**
```json
"tunnel": {
  "dev-app": {
    "hostname": "dev-app.example.com",
    "service": "http://localhost:8080"
  }
}
```
This documentation provides a comprehensive overview of the `meta.json` structure. The `run meta ...` commands can be used to interactively create and modify this file.

## 3. Global CLI Options

The `run` CLI tool supports the following global options that can be used with any command:

| Option                      | Alias | Argument      | Description                                                                                                                                                              |
|-----------------------------|-------|---------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `--cible <env_context>`     | `-c`  | `env_context` | Specifies the target environment context for the command. This influences which environment variables are loaded (e.g., from `.env.<env_context>`) and potentially how commands behave (e.g., Docker image tagging, Terraform workspace selection). Common examples for `env_context` might be `local`, `dev`, `staging`, `prod`. |
| `--path <path_to_execute>`  | `-p`  | `path`        | Executes the `run` command as if it were run from the specified `<path_to_execute>`. This changes the current working directory for the execution of the command and all its sub-processes. This is useful for running commands on projects not in the current directory. |

**Example Usage:**

```bash
# Run the 'deploy' script targeting the 'staging' environment
run script deploy -c staging

# List docker images for a project located in a different directory
run -p ../other-project/ docker ps
```

These global options are processed before the specific command's action is executed. The `--cible` option is particularly important for environment-specific configurations and secret management, often loading files like `.env` or `.env.<cible_value>` from the execution path.

## 4. Command Reference

The `run` CLI tool organizes its functionalities into several commands. Each command may have subcommands and specific options.

### 4.1. `run meta`

This command and its subcommands are used to manage `meta.json` files.

#### 4.1.1. `run meta create`
*   **Purpose:** Interactively creates a new `meta.json` file in the current directory.
*   **Usage:** `run meta create`
*   **Details:** Prompts the user for essential information like `name`, `type` (`project`, `app`, `config`), and whether it's `global` (environment-based). It generates an `id` automatically.

#### 4.1.2. `run meta change [property]`
*   **Purpose:** Interactively modifies an existing property in the `meta.json` file of the current directory.
*   **Usage:** `run meta change [property_name]`
*   **Details:** If `property_name` is provided (e.g., `id`, `name`, `type`, `global`), it attempts to change that specific property. If no `property_name` is given, it prompts the user to select a property to change from the existing ones in `meta.json`.

#### 4.1.3. `run meta add [type]`
*   **Purpose:** Interactively adds a new configuration block (like `docker`, `compose`, `tunnel`, or `terraform`) to the current `meta.json` file.
*   **Usage:** `run meta add` (will prompt for type) or `run meta add docker`, `run meta add compose`, etc.
*   **Details:** Guides the user through prompts to fill in the necessary fields for the chosen configuration type. For example, `run meta add docker` will ask for the Docker configuration name (e.g., "default"), root path, image name, etc.

### 4.2. `run script` (replaces deprecated `run custom`)

This command executes user-defined TypeScript scripts, offering a powerful way to extend the `run` tool's functionality.

*   **Purpose:** To run custom automation scripts written in TypeScript.
*   **Usage:** `run script <script_name> [argument...]`
    *   `<script_name>`: The name of the script file (without the `.ts` extension) located in the scripts folder (usually `scripts/` or as configured in `meta.json` under `custom.root`).
    *   `[argument...]`: Optional arguments to pass to the script. These can be simple flags or key-value pairs (e.g., `myArg=value`).
*   **Options:**
    *   `--all`: If the script's `start` function defines multiple commands, this option attempts to run all of them.
    *   `--dev`: Runs the script in development mode. This primarily affects how the `run` command itself is resolved within the script's context (pointing to a development version if configured).
    *   `-r, --root <path>`: Specifies a different root directory to find the `<script_name>.ts` file, overriding the `custom.root` from `meta.json` or the default `scripts/` folder. The path is relative to the current working directory. If `meta.json` -> `custom.root` is `my_scripts` and you provide `-r other_scripts`, it will look in `other_scripts/<script_name>.ts`. If `meta.json` -> `custom.root` is not set, it will look in `scripts/<script_name>.ts` and then `other_scripts/<script_name>.ts` if `-r other_scripts` is given. The exact resolution might depend on the version but generally, the explicit option takes precedence for locating the script file itself under that root.
*   **Key Feature:** The true power of `run script` lies in the **context object** passed to the default exported function of the user's script. This context provides access to `meta.json` data, environment variables, helper functions, and the `start` task runner. (This context is detailed in Section 5: "The `script` (Custom Scripting) Environment").
*   **Deprecated Alias:** `run custom` is a deprecated alias for `run script` and functions identically. New scripts should use `run script`.

**Example Usage:**
```bash
# Run the 'build' script
run script build

# Run the 'deploy' script with specific arguments
run script deploy service=api version=1.2.3 --env=production

# Run a script from a different root location
run script utils/cleanup -r ./project_tools
```

### 4.3. `run docker`

This command provides a suite of tools for managing Docker images and containers, often integrated with `meta.json` configurations.

#### 4.3.1. `run docker register [component]`
*   **Purpose:** Builds and pushes Docker images, typically for multiple architectures using `docker buildx`, and handles manifest creation.
*   **Usage:** `run docker register [component_name]`
    *   `[component_name]`: Optional. The name of the Docker configuration block in `meta.json` (e.g., "default", "api"). If omitted, "default" is usually assumed.
*   **Options:**
    *   `--amd64`: Build for `linux/amd64` architecture.
    *   `--arm64`: Build for `linux/arm64` architecture.
    *   `--cloud`: Delegate the build to a cloud provider (e.g., Google Cloud Build). Requires appropriate cloud CLI tools and authentication.
    *   `--machine-type <type>`: Specifies the machine type for cloud builds (e.g., `e2-highcpu-32`).
    *   `--modifier <string>`: Appends an additional string to the image tag (e.g., `image:env-modifier`).
    *   `--skip-tag-modifiers`: If `true`, ignores `tag_modifiers` from `meta.json`.
    *   `--component <name>`: Alternative way to specify the component name if not provided as a positional argument.
    *   `--build-args <args...>`: Pass build arguments to `docker build` (e.g., `VERSION=1.0.0`).
    *   `--tags <tags...>`: Additional tags to apply to the image.
    *   `--no-cache`: (Implicit) By default, builds are often without cache unless `cache` is specifically enabled or this option is explicitly managed by the command's internal logic. The presence of `--cache` in other docker commands suggests its absence here might imply no cache.
*   **`meta.json` Integration:** Uses the `docker.<component_name>` block from `meta.json` to determine:
    *   `root`: Directory containing the Dockerfile.
    *   `image`: Base image name.
    *   `env_based`: If Dockerfile name depends on environment.
    *   `context_dir`: Docker build context.
    *   `tag_modifiers`: Additional tags to generate.

#### 4.3.2. `run docker build [component]`
*   **Purpose:** Performs a standard Docker build for a component defined in `meta.json`.
*   **Usage:** `run docker build [component_name]`
    *   `[component_name]`: Optional. The name of the Docker configuration in `meta.json`. Defaults to "default".
*   **`meta.json` Integration:** Uses `docker.<component_name>` similarly to `docker register` for `root`, `image`, `context_dir`, and `Dockerfile` naming.

#### 4.3.3. `run docker compose ...` (Sub-namespace for Docker Compose)

This group of commands wraps `docker compose` functionality, using configurations from the `compose` section of `meta.json`.

*   **`run docker compose up [component]`**
    *   **Purpose:** Starts services defined in a Docker Compose file.
    *   **Arguments:** `[component]` (Optional, defaults to "default"): Refers to a key in `meta.json#compose`.
    *   **Options:**
        *   `--build`: Build images before starting services.
        *   `--force-recreate`: Recreate containers even if their configuration hasn't changed.
        *   `--detach` or `-d`: Run containers in the background.
    *   **`meta.json` Integration:** Uses `compose.<component>.root` to find the directory of the compose file and `compose.<component>.filename` for the compose file name.

*   **`run docker compose down [component]`**
    *   **Purpose:** Stops and removes containers, networks, etc., defined in a Docker Compose file.
    *   **Arguments:** `[component]` (Optional, defaults to "default").
    *   **`meta.json` Integration:** Similar to `up`.

*   **`run docker compose exec [instructions]`**
    *   **Purpose:** Executes a command inside a running container managed by Docker Compose.
    *   **Arguments:** `[instructions]`: The command string to execute.
    *   **Options:**
        *   `--container <name>`: Name of the service/container to execute the command in. If not specified, often defaults to the first service in the compose file.
        *   `--component <name>`: Specifies the compose component from `meta.json`.
        *   `-f, --file <file>`: (Potentially overrides `meta.json`) Specifies the compose file. The interaction with `meta.json` needs clarification if both are used.
    *   **`meta.json` Integration:** Uses `compose.<component>` to locate the relevant compose setup.

*   **`run docker compose build [component]`**
    *   **Purpose:** Builds or rebuilds services defined in a Docker Compose file.
    *   **Arguments:** `[component]` (Optional, defaults to "default").
    *   **Options:**
        *   `-f, --file <file>`: (Potentially overrides `meta.json`) Specifies the compose file.
        *   `--cache`: Enables caching for the build process. (Note: `dockerRegister` defaults to no cache, this one might differ or the option makes it explicit).
    *   **`meta.json` Integration:** Similar to `up`.

*   **`run docker compose logs [component]`**
    *   **Purpose:** Displays log output from services managed by Docker Compose.
    *   **Arguments:** `[component]` (Optional, defaults to "default").
    *   **`meta.json` Integration:** Similar to `up`.

### 4.4. Other Commands

The `run` CLI includes several other commands, which are typically loaded from `run/lib/*.ts`. A brief overview based on their names:

*   **`run action ...`**: Likely related to CI/CD actions or Git-based actions. (Requires inspecting `action.ts` for details).
*   **`run machine ...`**: Could be for managing virtual machines or specific hardware setups. (Requires inspecting `machine.ts`).
*   **`run misc ...`**: For miscellaneous utility functions or commands that don't fit elsewhere. (Requires inspecting `misc.ts`).
*   **`run routine <routine_name>`**: Executes predefined command sequences (routines) specified in `meta.json#routines`.
    *   **Usage:** `run routine <name_of_routine>`
    *   **`meta.json` Integration:** Looks up `<name_of_routine>` in the `routines` object of `meta.json` and executes the associated command string.
*   **`run terraform ...`**: Provides an interface to Terraform commands, likely using configurations from `meta.json#terraform` to manage paths and workspaces. (Requires inspecting `terraform.ts` for subcommands and options).
*   **`run tunnel ...`**: Manages network tunnels, configured via `meta.json#tunnel`. (Requires inspecting `tunnel.ts` for subcommands like `create`, `delete`, `list` and their options).
*   **`run vault ...`**: Suggests integration with HashiCorp Vault or a similar secrets management tool. (Requires inspecting `vault.ts` for subcommands like `read`, `write`, `login`).

For detailed subcommands, options, and behavior of `action`, `machine`, `misc`, `terraform`, `tunnel`, and `vault`, an AI agent would need to either:
a) Be provided with documentation generated from their respective source files (`lib/*.ts`).
b) Infer usage from `run <command> --help` if the CLI supports detailed help generation for these.
c) Analyze the source code of each module.

This Command Reference section provides a solid foundation for understanding the main functionalities of the `run` CLI.

## 5. The `script` (Custom Scripting) Environment

The `run script` command (formerly `run custom`) allows users to execute custom TypeScript modules. These scripts are not just simple shell scripts; they operate within a rich context provided by the `run` CLI, enabling sophisticated automation and integration with the tool's core functionalities.

### 5.1. Script Structure

A custom script must be a TypeScript file (e.g., `my_script.ts`) and must export a `default` asynchronous function. This function receives two arguments:
1.  `args`: An array of strings representing the arguments passed to the script after the script name itself.
2.  `context`: An object (of type `CustomOptions` internally) containing various utilities and data sources.

**Example Script (`<scripts_root>/example.ts`):**
```typescript
// Import types if needed for better DX, though not strictly required for runtime
// import type { CustomOptions, CustomArgs } from "path/to/custom_options_type"; // Actual path might vary

export default async function(args: string[] /* CustomArgs */, context: any /* CustomOptions */) {
  console.log("Script arguments:", args);

  // Access meta.json data
  console.log("Project Name:", context.metaConfig?.name);

  // Use a helper
  if (context.has("verbose")) {
    console.log("Verbose mode enabled!");
  }

  const specificSetting = context.extract("setting");
  if (specificSetting) {
    console.log("Found setting:", specificSetting);
  }

  // Run a shell command using zx-like syntax via context.cmd
  await context.main.$.append(context.cmd`echo "Hello from script via zx!"`);

  // Utilize the start function for complex tasks
  await context.start({
    echo_something: "echo 'This is a task run by context.start'",
    another_task: {
      command: async ()_=> {
        console.log("This is an async function task!");
        await context.main.sleep(100); // Using an imported function via context.main
        console.log("Done sleeping in task.");
      },
      priority: 1 // Lower numbers run first
    }
  });
}
```

### 5.2. The `context` Object (`CustomOptions`)

The `context` object passed to your script's default function is the primary interface to the `run` tool's capabilities. Its properties are:

| Property      | Type     | Description                                                                                                                                                              |
|---------------|----------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `metaConfig`  | object   | The parsed content of the `meta.json` file relevant to the current execution path. Allows the script to access project configurations.                                     |
| `currentPath` | string   | The absolute path of the current working directory from which the `run` command was invoked (or changed to via the global `-p` option).                                  |
| `env`         | object   | An object containing all environment variables currently available to the `run` process (e.g., `Deno.env.toObject()`).                                                       |
| `run`         | string   | The command string used to invoke the `run` tool itself (e.g., path to the `run` executable). Useful if a script needs to call `run` for sub-tasks or other commands.         |
| `main`        | object   | An object that exposes all the exported functions and modules from the `run` tool's main entry point (`run/main.ts`). This allows scripts to directly use the internal functionalities of `run` such as `main.dockerRegister()`, `main.setSecretsOnLocal()`, `main.$` (the zx instance), `main.sleep()`, etc. This is a powerful way to build complex workflows without reimplementing logic. |
| `cmd`         | function | A helper function: `cmd(template: string | TemplateStringsArray, ...substitutions: any[]): string[]`. It takes a template string (like `zx`'s `\$`) and returns an array of strings, suitable for execution with `context.main.\$` or other shell execution utilities. It effectively prepares a command string by splitting it and handling substitutions. |
| `extract`     | function | A function: `extract(inputName: string): string | undefined`. It searches the script's `args` array for an argument of the format `inputName=value` and returns the `value`. If not found, returns `undefined`. |
| `has`         | function | A function: `has(arg: string): boolean`. It checks if the given `arg` string exists in the script's `args` array. Useful for checking flags (e.g., `context.has("--verbose")`). |
| `start`       | function | A powerful task runner function: `start(config: CustomStartConfig): Promise<void>`. See details in section 5.2.1.                                                          |

### 5.2.1. The `start` Function

The `context.start` function is designed to declaratively define and execute a sequence of tasks. It takes a single argument, `config`, which is an object where keys are task names.

**`CustomStartConfig` Object:**
The `config` object's keys are arbitrary names for tasks. The values define what each task does:

1.  **String:** If the value is a string, it's treated as a shell command to be executed.
    ```json
    { "task_name": "echo 'Hello from task'" }
    ```

2.  **Function:** The value can be an asynchronous function. This function can optionally receive an `options` object if defined in an object configuration (see below, though typically direct functions don't get options this way unless wrapped).
    ```json
    {
      "task_name": async () => {
        console.log("Executing an async task");
        await context.main.sleep(100); // Accessing context.main here
      }
    }
    ```

3.  **Object:** For more control, the value can be an object with the following properties:
    *   `command`: (Required) A string (shell command) or an asynchronous function (`(options?: any) => Promise<void>`).
    *   `variables`: (Optional) An object where keys are variable names and values are their corresponding values. If `command` is a string, these variables are substituted (e.g., a command like `"echo \${myVar}"` would use `variables: { myVar: "Hello" }`). The exact substitution mechanism (e.g., `${var}` or `$var`) should be verified by example if critical. Given the zx shell context, `${var}` is common.
    *   `options`: (Optional) An object containing options to be passed to the `command` if it's a function.
    *   `priority`: (Optional) A number. Tasks are executed in ascending order of priority (tasks with lower numbers run first). Tasks with the same priority may run in parallel or sequence depending on the `start` function's internal implementation (often concurrently for the same priority level). Defaults to a standard priority (e.g., 999) if not specified.

**Example `start` Configuration:**
```typescript
await context.start({
  "initial_setup": {
    command: "mkdir -p build_output",
    priority: 1
  },
  "compile_code": {
    command: async (opts) => {
      console.log(`Compiling with optimization level: ${opts.level}`);
      // Simulate compilation
      await context.main.sleep(500); // Use context.main.sleep
      console.log("Compilation complete.");
    },
    options: { level: "high" },
    priority: 2
  },
  "generate_docs": {
    command: "echo 'Generating documentation with version \${docVersion}'",
    variables: { docVersion: context.metaConfig?.version || "1.0.0" },
    priority: 2 // Runs concurrently with compile_code or just after
  },
  "final_notification": {
    command: () => console.log("Build process finished!"),
    priority: 10
  }
});
```

The `script` environment, particularly the `context` object and its `start` function, transforms `run script` from a simple script runner into a sophisticated workflow engine.

## 6. Tooling and Runtime

Understanding the environment in which the `run` CLI tool operates can be beneficial for advanced usage and troubleshooting.

### 6.1. Deno Runtime

The `run` CLI is developed and executed using **Deno**, a modern and secure runtime for JavaScript and TypeScript. This means:
*   Scripts and the tool itself are written in TypeScript or JavaScript.
*   Deno's permission model might be relevant for some operations, although `run` scripts are typically executed with broad permissions (`--allow-all` is common in the shebang for `run/bin/cmd.ts`).
*   The availability of Deno APIs can be leveraged within custom `run script`s.

### 6.2. Environment Variable Management

Environment variables are crucial for configuring the behavior of the `run` tool and the scripts or processes it manages.
*   **`.env` Files:** The `run` tool loads environment variables from `.env` files. Typically, it looks for:
    *   A general `.env` file.
    *   An environment-specific file, such as `.env.<env_context>`, where `<env_context>` is specified by the global `--cible <env_context>` option (e.g., `.env.local`, `.env.dev`, `.env.production`).
    *   The `meta.json` file's `secrets.base` property can also point to a base environment file.
*   **Loading Priority:** Environment-specific files usually override general `.env` files, and variables set directly in the shell environment often take the highest precedence. The `dotenv` and `dotenv-expand` libraries are used internally, implying standard behavior for these types of files.
*   **`preAction` Hook:** The `run` CLI has a `preAction` hook (visible in `run/bin/cmd.ts`) that handles setting secrets and the `ENV` variable based on the `--cible` option before most commands execute.
*   **Access in Scripts:** Custom scripts can access environment variables via `context.env` (which is `Deno.env.toObject()`).

This setup allows for flexible configuration management across different development stages and deployment environments.

## 7. Recommendations for Documentation Updates

To ensure this AI agent documentation remains accurate and useful as the `run` CLI tool evolves, the following practices are recommended:

1.  **Manual Synchronization with Code Changes:**
    *   **Commands and Options:** When new commands or subcommands are added, or existing ones are modified in `run/bin/cmd.ts` or the `run/lib/*.ts` modules (e.g., adding new options to `commander`), this documentation **must be manually updated** to reflect these changes.
    *   **`script` Context:** If the `context` object (`CustomOptions`) passed to `run script` is modified (e.g., new properties added, existing ones changed or removed), the "The `script` (Custom Scripting) Environment" section needs immediate updating.
    *   **`meta.json` Behavior:** If the way `run` commands interpret or use sections of `meta.json` changes, the relevant descriptions in the "Core Concept: `meta.json`" and "Command Reference" sections should be updated.

2.  **`meta.json` Schema as a Source of Truth:**
    *   The JSON schema for `meta.json` (as provided in the initial request for this documentation) is a critical reference. If this schema is formally maintained and updated within the repository (e.g., as a `meta.schema.json` file), it should be considered the canonical source for the structure of `meta.json`.
    *   When the `meta.json` schema changes, the "Core Concept: `meta.json`" section of this document must be updated accordingly.

3.  **Automated Generation (Future Consideration):**
    *   While this document is designed for manual maintenance, some parts *could* potentially be supplemented by auto-generated content in the future. For instance, CLI help text from `run <command> --help` might be parsable.
    *   However, relying on full automation can be complex to set up and maintain. For the foreseeable future, manual diligence is the most reliable approach for this type of AI-specific, detailed documentation.

4.  **Version Control the Documentation:**
    *   This `AI_Agent_Documentation.md` file should be committed to the same Git repository as the `run` CLI tool's codebase.
    *   This ensures that changes to the documentation can be tracked, versioned, and reviewed alongside code changes (e.g., in pull requests).

5.  **Regular Review and Audit:**
    *   Periodically review this documentation against the current state of the codebase to catch any discrepancies or outdated information. This is especially important before new releases of the `run` tool.
    *   When new features are developed, updating this documentation should be part of the development process, not an afterthought.

By following these recommendations, this documentation can remain a valuable asset for any AI agent tasked with understanding or interacting with the `run` CLI tool.
