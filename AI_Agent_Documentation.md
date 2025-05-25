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

## 4. CLI Command Reference

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
*   **Key Feature:** The true power of `run script` lies in the **context object** passed to the default exported function of the user's script. This context provides access to `meta.json` data, environment variables, helper functions, and the `start` task runner. (This context is detailed in Section 5: "Custom Scripting Fundamentals").
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

This CLI Command Reference section provides a solid foundation for understanding the main functionalities of the `run` CLI.

## 5. Custom Scripting Fundamentals

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
| `main`        | object   | Provides access to the `run` tool's library modules and their exported functions (e.g., `context.main.dockerRegister()`). Detailed in Section 6. It also re-exports functionalities from the `zx` library, such as `$` for command execution and utilities like `sleep`, `cd`, etc. |
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

## 6. Programmatic API: Using Library Modules

### 6.1. Overview: `context.main` vs. Direct Imports (`jsr:@ghostmind/run`)
Scripts can access the library's programmatic API in two primary ways:

1.  **Via `context.main`**: The `context.main` object, provided to your script's default function, contains all functions and variables exported from the `run` tool's main entry point (`run/main.ts`). This is a convenient way to access functionalities without explicit imports.
    *Example:* `await context.main.dockerRegister('my-component');`

2.  **Via Direct Imports from `jsr:@ghostmind/run`**: For a more explicit approach, especially when working with TypeScript and wanting precise type checking, functions and types can be imported directly from the published JSR package.
    *Example:*
    ```typescript
    import { dockerRegister, type DockerRegisterOptions } from 'jsr:@ghostmind/run';
    // ...
    await dockerRegister('my-component', { cloud: true } as DockerRegisterOptions);
    ```

**Which to choose?**
*   `context.main` is quick and easy, especially for functions that don't require complex option objects where type assistance is less critical. It also provides access to the `zx` instance via `context.main.$` and its utilities like `sleep`.
*   Direct JSR imports are generally recommended for better type safety, code clarity, and discoverability of available functions and their signatures, especially if your script is complex or written in TypeScript. The user examples provided utilize this method.
*   Many functions (like `dockerRegister`, `dockerComposeUp`, etc.) are available through both mechanisms. The documentation below will primarily showcase usage with direct JSR imports for clarity and type safety, but most functions can also be accessed via `context.main.functionName`.

The following subsections detail the APIs available from the core library modules.

### 6.2. Action Module (`lib/action.ts`)
The Action module provides functions for interacting with GitHub Actions.

#### `actionRunRemote`
*   **Signature:** `async function actionRunRemote(workflow: string, options: ActionRunRemoteOptions): Promise<void>`
*   **`ActionRunRemoteOptions` Interface:**
    ```typescript
    export interface ActionRunRemoteOptions {
      watch?: boolean;    // If true, watches the workflow run.
      input?: string[];   // Array of input arguments for the workflow (e.g., ["key=value"]).
      branch?: string;    // Branch to run the workflow on (defaults to 'main').
    }
    ```
*   **Purpose:** Triggers a remote GitHub workflow using the `gh` CLI.
*   **Usage:**
    ```typescript
    import { actionRunRemote, type ActionRunRemoteOptions } from 'jsr:@ghostmind/run';
    // or: const { actionRunRemote } = context.main;

    await actionRunRemote('my-ci-workflow.yml', {
      branch: 'develop',
      watch: true,
      input: ['version=1.2.3']
    } as ActionRunRemoteOptions);
    ```
*   **Notes:** Requires the GitHub CLI (`gh`) to be installed and authenticated.

#### `actionRunLocalEntry` / `actionRunLocal`
*   These functions are primarily for the `run action local` CLI command, which wraps the `act` tool for running GitHub Actions locally. Direct programmatic use in custom scripts is less common due to the complexity of managing `act` arguments and environment. If local action execution is needed, consider using `context.main.$` to invoke the `act` CLI directly or the `run action local` command.

### 6.3. Custom Module (`lib/custom.ts`)
The Custom module provides the core infrastructure for `run script` execution, including the `context` object itself. While its main functionalities (`start`, `cmd`, `extract`, `has`) are directly available on the `context` object passed to your script, this module also exports key types/interfaces crucial for TypeScript development.

#### Exported Types and Interfaces
These types are essential for strong typing in your custom TypeScript scripts.

*   **`CustomArgs`**: `export type CustomArgs = string[];`
    *   Represents the array of arguments passed to your script.
*   **`CustomOptions`**: `export interface CustomOptions { ... }`
    *   The interface for the `context` object itself. Importing this allows you to type the `context` parameter in your script's default function.
    *   See Section 5.2 for details on its properties (`env`, `run`, `main`, `metaConfig`, `currentPath`, `extract`, `has`, `cmd`, `start`).
*   **`CustomOptionsEnv`**: `export interface CustomOptionsEnv { [key: string]: string; }`
    *   The type for `context.env`.
*   **`CustomStartConfig`**: `export interface CustomStartConfig { [key: string]: string | CustomFunction | CustomStartConfigCommandFunction | CustomStartConfigCommandCommand; }`
    *   The configuration object for the `context.start()` function. See Section 5.2.1 for a detailed breakdown.
*   **`CustomFunction`**: `export type CustomFunction = (options: any) => Promise<void>;`
*   **`CustomStartConfigCommandFunction`**: Extends `CommandOptions`, defines a task using a `CustomFunction`.
*   **`CustomStartConfigCommandCommand`**: Extends `CommandOptions`, defines a task using a command string.
*   **`CommandOptions`**: `export interface CommandOptions { priority?: number; }`

**Usage Example (TypeScript):**
```typescript
import type { CustomArgs, CustomOptions, CustomStartConfig } from 'jsr:@ghostmind/run';

export default async function myScript(args: CustomArgs, context: CustomOptions) {
  // Now 'args' is typed as string[] and 'context' has full type information.
  const config: CustomStartConfig = {
    myTask: "echo 'Hello'"
  };
  await context.start(config);
}
```

### 6.4. Docker Module (`lib/docker.ts`)
The Docker module provides a comprehensive set of functions for building, managing, and deploying Docker images and Docker Compose services. These are heavily used by the `run docker ...` CLI commands but are also available for direct programmatic use in scripts.

**Note on `context.start` usage:** When using these functions within `context.start`, the `command` property should be the function reference itself.
```typescript
// Script Example:
// import { dockerComposeUp, dockerComposeBuild } from 'jsr:@ghostmind/run';
// // ... then in context.start ...
// build_services: { command: dockerComposeBuild, options: { ... }}
```

#### `getDockerfileAndImageName`
*   **Signature:** `async function getDockerfileAndImageName(component: any, modifier?: string, skip_tag_modifiers?: boolean): Promise<{ dockerfile: string, dockerContext: string, image: string, tagsToPush: string[][] }>`
*   **Purpose:** Calculates Dockerfile path, build context, primary image name (with environment tag), and a list of additional tags to push, based on `meta.json#docker` configurations for the given component and options.
*   **Usage:**
    ```typescript
    import { getDockerfileAndImageName } from 'jsr:@ghostmind/run';
    // or: const { getDockerfileAndImageName } = context.main;

    const details = await getDockerfileAndImageName('api', 'feature-xyz');
    console.log('Dockerfile path:', details.dockerfile);
    console.log('Primary image name:', details.image);
    details.tagsToPush.forEach(tagPair => console.log('Full tag to push:', tagPair[0]));
    ```

#### `getDockerImageDigest`
*   **Signature:** `async function getDockerImageDigest(arch: any, component: any, modifier?: string): Promise<string>`
*   **Purpose:** Fetches the image digest for a given component, architecture, and optional modifier by inspecting the manifest.
*   **Usage:**
    ```typescript
    import { getDockerImageDigest } from 'jsr:@ghostmind/run';
    // or: const { getDockerImageDigest } = context.main;

    const digest = await getDockerImageDigest('amd64', 'api');
    console.log('Image Digest:', digest); // e.g., mycompany/api-service@sha256:...
    ```

#### `dockerRegister`
*   **Signature:** `async function dockerRegister(componentOrOptions?: string | DockerRegisterOptions, options?: DockerRegisterOptions)`
*   **`DockerRegisterOptions` Interface (Key Fields):**
    ```typescript
    export interface DockerRegisterOptions {
      component?: string;
      amd64?: boolean;
      arm64?: boolean;
      cloud?: boolean;         // Use cloud build (e.g., gcloud builds submit)
      machine_type?: string;   // For cloud builds
      build_args?: string[];   // e.g., ["VERSION=1.0"]
      modifier?: string;       // Additional tag part, e.g., image:env-modifier
      skip_tag_modifiers?: boolean; // Ignore tag_modifiers from meta.json
      cache?: boolean;         // Note: buildx default caching behavior applies. This option's direct effect needs checking in source.
      tags?: string[];         // Additional explicit tags
    }
    ```
*   **Purpose:** Builds and pushes Docker images using `docker buildx`. Handles multi-architecture builds, manifest creation, and integration with cloud build services (currently Google Cloud Build). It uses `meta.json#docker` for configuration.
*   **Usage:**
    ```typescript
    import { dockerRegister, type DockerRegisterOptions } from 'jsr:@ghostmind/run';
    // or: const { dockerRegister } = context.main;

    // Simple build and push for default component
    // await dockerRegister(); // Would need default 'default' config in meta.json

    // Build for a specific component, amd64 architecture
    await dockerRegister('api-service', { amd64: true } as DockerRegisterOptions);

    // Multi-arch build for a component using cloud provider
    // (Assumes gcloud CLI is configured)
    // await dockerRegister({
    //   component: 'worker',
    //   amd64: true, // Will build amd64 then attempt to combine manifests
    //   arm64: true, // Will build arm64 then attempt to combine manifests
    //   cloud: true,
    //   machine_type: 'n1-standard-4'
    // } as DockerRegisterOptions);
    // Note: The code for dockerRegister handles amd64 OR arm64 per call if cloud=false.
    // If cloud=true, it builds one arch and then tries to amend manifest.
    // For true multi-arch build in one go (e.g. docker buildx build --platform linux/amd64,linux/arm64 ...),
    // the script might need direct zx calls or this function might need enhancement.
    // The current dockerRegister seems to build one arch per call then create/amend manifest.
    ```

#### `dockerBuild`
*   **Signature:** `async function dockerBuild(componentOrOptions?: string | DockerBuildOptions, options?: DockerBuildOptions)`
*   **`DockerBuildOptions` Interface:** `export interface DockerBuildOptions { component?: string; }`
*   **Purpose:** Performs a standard `docker build` (not `buildx`) for a component defined in `meta.json#docker`. Tags the image based on `meta.json` and current environment.
*   **Usage:**
    ```typescript
    import { dockerBuild } from 'jsr:@ghostmind/run';
    // or: const { dockerBuild } = context.main;
    await dockerBuild('frontend');
    ```

#### `dockerComposeUp`
*   **Signature:** `async function dockerComposeUp(componentOrOptions?: string | DockerComposeUpOptionsComponent, options?: DockerComposeUpOptions)`
*   **`DockerComposeUpOptions` Interface (Key Fields):**
    ```typescript
    export interface DockerComposeUpOptions {
      component?: string;
      build?: boolean;          // Run `docker compose build` before `up`
      forceRecreate?: boolean; // Pass --force-recreate
      detach?: boolean;         // Pass --detach
    }
    ```
*   **Purpose:** Executes `docker compose up` using settings from `meta.json#compose` for the specified component. Includes running `down` first.
*   **Usage (within a `run script`'s `start` block):**
    ```typescript
    // Script Example:
    // import { dockerComposeUp, type CustomOptions, type CustomArgs, type CustomStartConfig } from 'jsr:@ghostmind/run';
    //
    // export default async function(args: CustomArgs, context: CustomOptions) {
    //   await context.start({
    //     up_services: {
    //       command: dockerComposeUp, // Pass the function reference
    //       options: {               // These are DockerComposeUpOptions
    //         component: 'main-app', // Optional, defaults to 'default' if not specified
    //         forceRecreate: true,
    //         detach: true,
    //         build: true
    //       },
    //       priority: 1
    //     }
    //   } as CustomStartConfig);
    // }
    ```

#### `dockerComposeDown`
*   **Signature:** `async function dockerComposeDown(component: any, options: any)` (options type not explicitly defined but likely minimal)
*   **Purpose:** Executes `docker compose down` for a component.
*   **Usage:**
    ```typescript
    import { dockerComposeDown } from 'jsr:@ghostmind/run';
    await dockerComposeDown('main-app', {}); // options seem unused in current impl.
    ```

#### `dockerComposeBuild`
*   **Signature:** `async function dockerComposeBuild(componentOrOptions: DockerComposeBuildOptionsComponent, options?: DockerComposeBuildOptions)`
*   **`DockerComposeBuildOptions` Interface (Key Fields):**
    ```typescript
    export interface DockerComposeBuildOptions {
      component?: string;
      file?: string;    // Override compose file from meta.json
      cache?: boolean;  // Add --no-cache if cache is undefined (false)
    }
    ```
*   **Purpose:** Executes `docker compose build`.
*   **Usage (within a `run script`'s `start` block):**
    ```typescript
    // Script Example:
    // import { dockerComposeBuild, type CustomOptions, type CustomArgs, type CustomStartConfig } from 'jsr:@ghostmind/run';
    //
    // export default async function(args: CustomArgs, context: CustomOptions) {
    //   await context.start({
    //     build_services: {
    //       command: dockerComposeBuild, // Pass the function reference
    //       options: {
    //         component: 'worker-app',
    //         cache: true
    //       },
    //       priority: 1
    //     }
    //   } as CustomStartConfig);
    // }
    ```

#### `dockerComposeExec`
*   **Signature:** `async function dockerComposeExec(instructionsOrOptions: string | DockerComposeExecOptionsComponent, options?: DockerComposeExecOptions)`
*   **`DockerComposeExecOptions` Interface (Key Fields):**
    ```typescript
    export interface DockerComposeExecOptions {
      instructions: string; // The command to run
      container?: string;  // Specific container/service name
      component?: string;
      file?: string;       // Override compose file
    }
    ```
*   **Purpose:** Executes a command in a running service via `docker compose exec`.
*   **Usage:**
    ```typescript
    import { dockerComposeExec } from 'jsr:@ghostmind/run';
    await dockerComposeExec( { instructions: 'ls -la /app', component: 'backend', container: 'api_container' });
    // or
    await dockerComposeExec( 'rake db:migrate', { component: 'backend', container: 'api_container' });
    ```

#### `dockerComposeLogs`
*   **Signature:** `async function dockerComposeLogs(component: any, options: any)`
*   **Purpose:** Shows logs via `docker compose logs`.
*   **Usage:**
    ```typescript
    import { dockerComposeLogs } from 'jsr:@ghostmind/run';
    await dockerComposeLogs('backend', {}); // options seem unused
    ```

### 6.5. Machine Module (`lib/machine.ts`)
The Machine module is focused on initializing a new project with a standardized development container setup.

#### `machineInit`
*   **Signature:** `async function machineInit(): Promise<void>`
*   **Purpose:** Interactively initializes a new project directory with a devcontainer configuration. This includes:
    *   Prompting for a project name.
    *   Creating the project directory.
    *   Fetching default `devcontainer.json` and `Dockerfile` from `ghostmind-dev/config` repository.
    *   Customizing the `devcontainer.json` with the project name and paths.
    *   Creating a basic `meta.json` for the new project.
    *   Adding a default `.gitignore` and `.vscode/settings.json`.
    *   Initializing a new Git repository.
*   **Usage:**
    ```typescript
    // Typically not called from an existing project's script,
    // but rather used as a one-time setup for new projects.
    // If needed:
    // import { machineInit } from 'jsr:@ghostmind/run';
    // or: const { machineInit } = context.main;
    // await machineInit(); // This will start interactive prompts.
    ```
*   **Notes:** This function is interactive due to its use of `inquirer` to prompt for project details. It's designed for CLI usage via `run machine init`.

### 6.6. Meta Module (`lib/meta.ts`)
The Meta module provides functions to interactively manage `meta.json` files. While these are available programmatically, their interactive nature (using `inquirer`) makes them more suited for CLI use (`run meta ...`) rather than fully automated scripts. Scripts usually consume `context.metaConfig` directly.

#### `createMetaFile`
*   **Signature:** `async function createMetaFile(): Promise<void>`
*   **Purpose:** Interactively prompts the user (name, type, global) to create a new `meta.json` file in the current directory.
*   **Usage (Illustrative):**
    ```typescript
    // import { createMetaFile } from 'jsr:@ghostmind/run';
    // await createMetaFile(); // Starts interactive session
    ```

#### `metaChangeProperty`
*   **Signature:** `async function metaChangeProperty(propertyArg?: string): Promise<void>`
*   **Purpose:** Interactively allows changing a property in an existing `meta.json`. If `propertyArg` is given, it targets that property; otherwise, it lists properties to choose from.
*   **Usage (Illustrative):**
    ```typescript
    // import { metaChangeProperty } from 'jsr:@ghostmind/run';
    // await metaChangeProperty('name'); // Prompts for new name
    // await metaChangeProperty();    // Prompts to select a property
    ```

#### `metaAddDocker`, `metaAddCompose`, `metaAddTunnel`, `metaAddTerraform`
*   **Signatures:**
    *   `async function metaAddDocker(): Promise<void>`
    *   `async function metaAddCompose(): Promise<void>`
    *   `async function metaAddTunnel(): Promise<void>`
    *   `async function metaAddTerraform(): Promise<void>`
*   **Purpose:** Each function interactively prompts the user for the necessary details to add a new configuration block (`docker`, `compose`, `tunnel`, or `terraform` respectively) to the `meta.json` file.
*   **Usage (Illustrative):**
    ```typescript
    // import { metaAddDocker } from 'jsr:@ghostmind/run';
    // await metaAddDocker(); // Starts interactive session for Docker config
    ```

#### `metaAddProperty`
*   **Signature:** `async function metaAddProperty(): Promise<void>`
*   **Purpose:** Interactively prompts the user to choose which type of property block (docker, compose, tunnel, terraform) they want to add to `meta.json`.
*   **Usage (Illustrative):**
    ```typescript
    // import { metaAddProperty } from 'jsr:@ghostmind/run';
    // await metaAddProperty(); // Prompts to select property type to add
    ```

### 6.7. Misc Module (`lib/misc.ts`)
The Misc module contains various utility functions, some of which are exposed as CLI commands. For programmatic use in scripts, some internal logic might be more directly replicated or specific helper functions from `utils/divers.ts` (which are re-exported via `context.main`) might be preferred.

*   **CLI Command Actions:** Functions like `commit` (git add/commit/push), `collision` (check for duplicate `meta.json` IDs), `session` (reset VSCode tasks.json terminals), `wait` (wait for URL), `stop` (kill process by port), `template` (create `.env.template`), `encode` (base64 encode file), `decode` (base64 decode env var to file) are primarily implemented as inline actions for their respective CLI commands.

#### Programmatic Execution of `misc` Subcommands

Since many `misc` subcommands are implemented as direct CLI actions, scripts can execute them using the `context.run` string (which holds the path to the `run` executable) and the `zx` instance available via `context.main.$`.

**Example (from user-provided script):**
This example demonstrates calling `run misc stop <port>` and `run misc wait <url>` from within a script.

```typescript
// Assuming 'context' is available (CustomOptions)
// const { run, main } = context; // run is the path to run CLI, main.$ is zx

// To stop a service on port 11434:
// await main.$`${run} misc stop 11434`;

// To wait for a URL:
// await main.$`${run} misc wait http://host.docker.internal:11434 --mode fetch`;
```
This approach is useful when a direct JavaScript/TypeScript function for the specific `misc` subcommand is not explicitly exported or convenient to use. For functionalities like UUID generation (`createUUID`), direct function calls via `context.main.createUUID()` are preferred (see Section 6.12).

*   **Note:** The `createUUID` function used by `run misc uuid` is actually from `utils/divers.ts` and is available as `context.main.createUUID()`.

### 6.8. Routine Module (`lib/routine.ts`)
The Routine module is responsible for executing predefined command sequences (routines) specified in `meta.json#routines`.

#### `generateTreeCommands`
*   **Signature:** `async function generateTreeCommands(scripts: string[], routineMap: any): Promise<any>`
*   **Purpose:** This is the core internal function used by the `run routine` CLI command. It takes a list of routine names (from the CLI arguments) and the `routines` object from `meta.json`. It parses the command strings, resolving keywords like `parallel`, `sequence`, and `every`, and builds a structured tree of commands to be executed.
*   **Programmatic Usage:** While available via `context.main.generateTreeCommands`, custom scripts typically define their own complex workflows using `context.start({...})` which offers similar declarative execution of parallel and sequential tasks. The `every` keyword and the specific parsing logic of routine strings are unique to this function and the `run routine` command. If a script needs to dynamically execute routines defined in `meta.json`, this function could be useful, but it would require careful handling of the resulting command tree for execution.
*   **Example (Conceptual):**
    ```typescript
    // const { generateTreeCommands, metaConfig } = context.main;
    // if (metaConfig.routines && metaConfig.routines.myComplexRoutine) {
    //   const commandTree = await generateTreeCommands(['myComplexRoutine'], metaConfig.routines);
    //   // ... custom logic to walk and execute the commandTree ...
    //   // This is complex; context.start is usually preferred for script-defined tasks.
    // }
    ```
*   **Note:** The actual execution logic for the generated tree is part of the `run routine` CLI command's action handler and is not separately exported.

### 6.9. Terraform Module (`lib/terraform.ts`)
The Terraform module provides functions to manage infrastructure using Terraform, integrated with `meta.json` for configuration.

#### `getBucketConfig`
*   **Signature:** `async function getBucketConfig(id: string, global: any, component: string): Promise<{ bcBucket: string; bcPrefix: string }>`
*   **Purpose:** Generates the backend configuration strings (`bucket=` and `prefix=`) for Terraform's S3 backend. It uses the project's `id` from `meta.json`, whether the component is `global`, and the Terraform `component` name to construct the S3 path.
*   **Usage:**
    ```typescript
    // import { getBucketConfig } from 'jsr:@ghostmind/run';
    // const { id, terraform } = context.metaConfig;
    // const tfComponent = 'my-infra'; // A key from metaConfig.terraform
    // if (id && terraform && terraform[tfComponent]) {
    //   const backendConf = await getBucketConfig(id, terraform[tfComponent].global, tfComponent);
    //   console.log(backendConf.bcBucket, backendConf.bcPrefix);
    // }
    ```

#### `terraformActivate`
*   **Signature:** `async function terraformActivate(componentOrOptions: string | TerraformActivateOptionsWithComponent, options?: TerraformActivateOptions)`
*   **`TerraformActivateOptions` Interface (Key Fields):**
    ```typescript
    interface TerraformActivateOptions {
      arch?: string;         // default 'amd64'
      docker?: string;       // Name of docker component in meta.json for image digest
      modifiers?: string[];  // e.g., ["myimage:mod1"] for specific image versions
      clean?: boolean;       // If true, removes .terraform folder before init
    }
    interface TerraformActivateOptionsWithComponent extends TerraformActivateOptions {
      component: string;
    }
    ```
*   **Purpose:** Applies a Terraform configuration. It performs the following steps:
    1.  Retrieves backend configuration using `getBucketConfig`.
    2.  If `meta.json#terraform[component].containers` is defined, it fetches Docker image digests for those containers (using `getDockerImageDigest`) and sets them as `TF_VAR_IMAGE_DIGEST_<CONTAINER_NAME_UPPERCASE>` environment variables.
    3.  Optionally cleans the `.terraform` directory.
    4.  Runs `terraform init` with the backend configuration.
    5.  Runs `terraform plan`.
    6.  Runs `terraform apply -auto-approve`.
*   **Usage:**
    ```typescript
    // import { terraformActivate, type TerraformActivateOptions } from 'jsr:@ghostmind/run';
    // await terraformActivate('my-main-infra', {
    //   arch: 'arm64',
    //   modifiers: ['app-service:v1.2.3'], // Specify version for 'app-service' container
    //   clean: true
    // } as TerraformActivateOptions);
    ```

#### `terraformDestroy`
*   **Signature:** `async function terraformDestroy(component: string, options: TerraformDestroyOptions)`
*   **`TerraformDestroyOptions` Interface:**
    ```typescript
    interface TerraformDestroyOptions {
      arch?: string;   // Currently seems unused in function logic for destroy
      clean?: boolean; // If true, removes .terraform folder before init
    }
    ```
*   **Purpose:** Destroys a Terraform-managed infrastructure.
    1.  Retrieves backend configuration.
    2.  Clears any `TF_VAR_IMAGE_DIGEST_...` environment variables if containers were defined.
    3.  Optionally cleans the `.terraform` directory.
    4.  Runs `terraform init`.
    5.  Runs `terraform plan -destroy`.
    6.  Runs `terraform destroy -auto-approve`.
*   **Usage:**
    ```typescript
    // import { terraformDestroy, type TerraformDestroyOptions } from 'jsr:@ghostmind/run';
    // await terraformDestroy('my-main-infra', { clean: true } as TerraformDestroyOptions);
    ```

#### `terraformVariables`
*   **Signature:** `async function terraformVariables(component: any, options: any)`
    *   `options.target`: Specifies the environment (e.g., 'local', 'dev') to source `.env.<target>` file.
*   **Purpose:** Generates a `variables.tf` file within the specified Terraform component's path. It reads variables from `.env` files (base and target-specific), prefixes them with `TF_VAR_`, and creates corresponding `variable` declarations and a `locals` block in `variables.tf`.
*   **Note:** This function is highly specific to the CLI's workflow for managing Terraform variables and might be less common for direct script usage unless replicating that exact behavior. Scripts might manage TF_VARs more directly.
*   **Usage (Illustrative):**
    ```typescript
    // import { terraformVariables } from 'jsr:@ghostmind/run';
    // await terraformVariables('my-main-infra', { target: 'dev' });
    ```

#### `cleanDotTerraformFolders`
*   **Signature:** `async function cleanDotTerraformFolders(): Promise<void>`
*   **Purpose:** Removes the `.terraform` subfolder from all Terraform component paths defined in the current project's `meta.json`.
*   **Usage:**
    ```typescript
    // import { cleanDotTerraformFolders } from 'jsr:@ghostmind/run';
    // await cleanDotTerraformFolders();
    ```

### 6.10. Tunnel Module (`lib/tunnel.ts`)
The Tunnel module is primarily designed to manage Cloudflare tunnels via the `run tunnel run` CLI command.

#### Programmatic Interaction via CLI Call

The most common way for a custom script to manage tunnels is by invoking the `run tunnel` CLI command itself using `context.run` (the path to the `run` executable) and `context.main.$` (the `zx` instance) or by defining it as a string command in `context.start`.

**Example (from user-provided script, for `context.start`):**
This demonstrates how to trigger `run tunnel run` as a task.
```typescript
// Assuming 'context' is available (CustomOptions)
// const { run, start } = context;

// await start({
//   // ... other tasks ...
//   run_tunnel: `${run} tunnel run`, // Executes 'run tunnel run' as a shell command
//   // ... other tasks ...
// });
```

**Example (direct execution with `zx`):**
```typescript
// Assuming 'context' is available (CustomOptions)
// const { run, main } = context;
// try {
//   await main.$`${run} tunnel run default --name my-specific-tunnel`;
// } catch (e) {
//   console.error("Failed to run tunnel:", e);
// }
```
This approach leverages the full CLI functionality of the tunnel command, including its handling of `cloudflared` and `meta.json` configurations.

### 6.11. Vault Module (`lib/vault.ts`)
The Vault module provides functions to synchronize secrets between local `.env` files and HashiCorp Vault's KV store. Requires Vault CLI to be installed and configured.

#### `vaultKvLocalToVault`
*   **Signature:** `async function vaultKvLocalToVault(options: VaultTransferOptions): Promise<void>`
*   **`VaultTransferOptions` Interface (Conceptual):**
    ```typescript
    interface VaultTransferOptions {
      target?: string;  // Environment target (e.g., 'dev', 'prod'). Used to determine Vault path and default .env file.
      envfile?: string; // Specific path to the source .env file (e.g., '.env.custom').
    }
    ```
*   **Purpose:** Reads key-value pairs from a specified local `.env` file and writes them as a single secret (under the key `CREDS`) to a path in Vault. The Vault path is constructed based on `meta.json#id`, `meta.json#global`, and the `target` environment.
*   **Usage:**
    ```typescript
    // import { vaultKvLocalToVault } from 'jsr:@ghostmind/run';
    // // Push secrets from .env.staging to Vault under the 'staging' path for the current app
    // await vaultKvLocalToVault({ target: 'staging' });
    // // Push secrets from a specific file to Vault under the 'customenv' path
    // await vaultKvLocalToVault({ target: 'customenv', envfile: './.env.special' });
    ```

#### `vaultKvVaultToLocal`
*   **Signature:** `async function vaultKvVaultToLocal(options: VaultTransferOptions): Promise<void>`
*   **Purpose:** Reads the `CREDS` secret from a path in Vault (determined by `meta.json` and `options.target`) and writes its content to a local `.env` file (specified by `options.envfile` or defaults to `.env`).
*   **Usage:**
    ```typescript
    // import { vaultKvVaultToLocal } from 'jsr:@ghostmind/run';
    // // Fetch 'prod' secrets from Vault and write to ./.env.production
    // await vaultKvVaultToLocal({ target: 'prod', envfile: '.env.production' });
    // // Fetch 'local' secrets (default target) and write to ./.env
    // await vaultKvVaultToLocal({});
    ```
*   **Note:** These functions require the Vault CLI to be authenticated and have appropriate permissions to the target KV paths.

### 6.12. Divers Utilities (`utils/divers.ts`)
The `utils/divers.ts` module provides a collection of helper functions used throughout the `run` CLI. These are all re-exported via `context.main`, making them readily available in custom scripts.
Note: `context.main` also re-exports many utilities from the `zx` library (like `$` for command execution, `sleep`, `cd`, `fetch`, etc.), making them readily available for scripting.

#### `createUUID`
*   **Signature:** `async function createUUID(length: number = 12): Promise<string>`
*   **Purpose:** Generates a random ID string using `nanoid`.
*   **Usage:** `const newId = await context.main.createUUID(16);`

#### `getAppName`
*   **Signature:** `async function getAppName(): Promise<string>`
*   **Purpose:** Reads `meta.json` in the current directory and returns its `name` property.
*   **Usage:** `const appName = await context.main.getAppName();`

#### `getProjectName`
*   **Signature:** `async function getProjectName(): Promise<string>`
*   **Purpose:** Finds the project root (directory with `meta.json` of `type: 'project'`, or `DENO_ENV_SRC`) and returns its `name`.
*   **Usage:** `const projectName = await context.main.getProjectName();`

#### `setSecretsOnLocal`
*   **Signature:** `async function setSecretsOnLocal(target: string): Promise<void>`
*   **Purpose:** Core environment variable loading mechanism. It reads `.env` files (e.g., `meta.json#secrets.base`, `.env.<target>`), expands variables, generates `TF_VAR_` prefixed versions, and sets them in `Deno.env`. This is automatically called by the CLI's preAction hook.
*   **Usage:** While scripts *can* call this (`await context.main.setSecretsOnLocal('dev');`), it's often unnecessary as the environment is usually pre-configured by the CLI before the script runs. Calling it can reload/override variables.
*   **Note:** Modifies the current process's environment variables.

#### `getFilesInDirectory`
*   **Signature:** `async function getFilesInDirectory(path: string): Promise<string[]>`
*   **Purpose:** Lists files in a given directory, excluding common ignored files (e.g., `.DS_Store`, `.git`).
*   **Usage:** `const files = await context.main.getFilesInDirectory('./src');`

#### `getDirectories`
*   **Signature:** `async function getDirectories(path: string): Promise<string[]>`
*   **Purpose:** Lists subdirectories in a given path, excluding `node_modules`, `.git`, etc.
*   **Usage:** `const subdirs = await context.main.getDirectories('.');`

#### `recursiveDirectoriesDiscovery`
*   **Signature:** `async function recursiveDirectoriesDiscovery(path: string): Promise<string[]>`
*   **Purpose:** Recursively finds all directory paths under a given starting path.
*   **Usage:** `const allProjectDirs = await context.main.recursiveDirectoriesDiscovery(context.main.Deno.env.get('SRC'));`

#### `findProjectDirectory`
*   **Signature:** `async function findProjectDirectory(path: string): Promise<string | undefined>`
*   **Purpose:** Traverses upwards from the given `path` to find a directory containing a `meta.json` file with `type: "project"`.
*   **Usage:** `const rootDir = await context.main.findProjectDirectory(context.currentPath);`

#### `verifyIfMetaJsonExists`
*   **Signature:** `async function verifyIfMetaJsonExists(path: string): Promise<MetaJson | undefined>`
*   **`MetaJson` Interface (Simplified):** `interface MetaJson { id: string; type: string; name: string; [key: string]: any; }`
*   **Purpose:** Reads `meta.json` from the specified `path`, parses it, and performs template replacements for `${ENV_VAR}` and `${this.property}` style expressions within its string values.
*   **Usage:**
    ```typescript
    // const otherMeta = await context.main.verifyIfMetaJsonExists('../another-service');
    // if (otherMeta) { console.log(otherMeta.name); }
    // Note: context.metaConfig already provides the processed meta.json for the current execution path.
    ```

#### `withMetaMatching`
*   **Signature:** `async function withMetaMatching({ property, value, path }: { property: string; value?: any; path?: string }): Promise<string[]>`
*   **Purpose:** Finds all directories (recursively from `path` or `SRC`) that contain a `meta.json` file where the specified `property` exists (and optionally matches `value`).
*   **Usage:**
    ```typescript
    // Find all services with a 'docker' configuration:
    // const dockerServicesPaths = await context.main.withMetaMatching({ property: 'docker' });
    // Find all services of type 'app':
    // const appPaths = await context.main.withMetaMatching({ property: 'type', value: 'app' });
    ```

#### `encrypt`
*   **Signature:** `function encrypt(text: string, cryptoKey: string, algorithm?: string): string` (algorithm defaults to 'aes-256-cbc')
*   **Purpose:** Encrypts a string using Node.js crypto module's AES-256-CBC. The `cryptoKey` is hashed with SHA-256 to derive the encryption key.
*   **Usage:** `const secret = "my super secret data"; const cryptoKey = "a_strong_password"; const encrypted = context.main.encrypt(secret, cryptoKey);`

#### `decrypt`
*   **Signature:** `function decrypt(encryptedKey: string, cryptoKey: string, algorithm?: string): string`
*   **Purpose:** Decrypts a string that was encrypted with the `encrypt` function, using the same `cryptoKey` and algorithm.
*   **Usage:** `const decrypted = context.main.decrypt(encryptedDataFromSomewhere, cryptoKey);`

## 7. Tooling and Runtime

Understanding the environment in which the `run` CLI tool operates can be beneficial for advanced usage and troubleshooting.

### 7.1. Deno Runtime

The `run` CLI is developed and executed using **Deno**, a modern and secure runtime for JavaScript and TypeScript. This means:
*   Scripts and the tool itself are written in TypeScript or JavaScript.
*   Deno's permission model might be relevant for some operations, although `run` scripts are typically executed with broad permissions (`--allow-all` is common in the shebang for `run/bin/cmd.ts`).
*   The availability of Deno APIs can be leveraged within custom `run script`s.

### 7.2. Environment Variable Management

Environment variables are crucial for configuring the behavior of the `run` tool and the scripts or processes it manages.
*   **`.env` Files:** The `run` tool loads environment variables from `.env` files. Typically, it looks for:
    *   A general `.env` file.
    *   An environment-specific file, such as `.env.<env_context>`, where `<env_context>` is specified by the global `--cible <env_context>` option (e.g., `.env.local`, `.env.dev`, `.env.production`).
    *   The `meta.json` file's `secrets.base` property can also point to a base environment file.
*   **Loading Priority:** Environment-specific files usually override general `.env` files, and variables set directly in the shell environment often take the highest precedence. The `dotenv` and `dotenv-expand` libraries are used internally, implying standard behavior for these types of files.
*   **`preAction` Hook:** The `run` CLI has a `preAction` hook (visible in `run/bin/cmd.ts`) that handles setting secrets and the `ENV` variable based on the `--cible` option before most commands execute.
*   **Access in Scripts:** Custom scripts can access environment variables via `context.env` (which is `Deno.env.toObject()`).

This setup allows for flexible configuration management across different development stages and deployment environments.

## 8. Recommendations for Documentation Updates

To ensure this AI agent documentation remains accurate and useful as the `run` CLI tool evolves, the following practices are recommended:

1.  **Manual Synchronization with Code Changes:**
    *   **Commands and Options:** When new commands or subcommands are added, or existing ones are modified in `run/bin/cmd.ts` or the `run/lib/*.ts` modules (e.g., adding new options to `commander`), this documentation **must be manually updated** to reflect these changes. This includes updating Section 4 "CLI Command Reference" and Section 6 "Programmatic API: Using Library Modules".
    *   **`script` Context:** If the `context` object (`CustomOptions`) passed to `run script` is modified (e.g., new properties added, existing ones changed or removed), the "Custom Scripting Fundamentals" section (especially 5.2) needs immediate updating.
    *   **`meta.json` Behavior:** If the way `run` commands interpret or use sections of `meta.json` changes, the relevant descriptions in the "Core Concept: `meta.json`" and "CLI Command Reference" sections should be updated.

2.  **`meta.json` Schema as a Source of Truth:**
    *   The JSON schema for `meta.json` (as provided in the initial request for this documentation) is a critical reference. If this schema is formally maintained and updated within the repository (e.g., as a `meta.schema.json` file), it should be considered the canonical source for the structure of `meta.json`.
    *   When the `meta.json` schema changes, the "Core Concept: `meta.json`" section of this document must be updated accordingly.

3.  **Automated Generation (Future Consideration):**
    *   While this document is designed for manual maintenance, some parts *could* potentially be supplemented by auto-generated content in the future. For instance, CLI help text from `run <command> --help` might be parsable for Section 4. TypeDoc or similar tools could help generate API details for Section 6.
    *   However, relying on full automation can be complex to set up and maintain. For the foreseeable future, manual diligence is the most reliable approach for this type of AI-specific, detailed documentation.

4.  **Version Control the Documentation:**
    *   This `AI_Agent_Documentation.md` file should be committed to the same Git repository as the `run` CLI tool's codebase.
    *   This ensures that changes to the documentation can be tracked, versioned, and reviewed alongside code changes (e.g., in pull requests).

5.  **Regular Review and Audit:**
    *   Periodically review this documentation against the current state of the codebase to catch any discrepancies or outdated information. This is especially important before new releases of the `run` tool.
    *   When new features are developed, updating this documentation should be part of the development process, not an afterthought.

By following these recommendations, this documentation can remain a valuable asset for any AI agent tasked with understanding or interacting with the `run` CLI tool.
