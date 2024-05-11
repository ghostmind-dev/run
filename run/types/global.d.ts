////////////////////////////////////////////////////////////////////////////////
// CUSTOM SCRIPT TYPES
////////////////////////////////////////////////////////////////////////////////

interface CustomOptionsUtils {
  detect: (value: string) => boolean;
  extract: (inputName: string) => string | undefined;
  has: (argument: string | string[]) => (arg: string) => boolean;
}

interface CustomOptionsUrl {
  internal: string;
  local: string;
  tunnel: string;
}

interface CustomOptionsEnv {
  [key: string]: string;
}

interface CustomOptions {
  env: CustomOptionsEnv;
  run?: string;
  url?: CustomOptionsUrl;
  main: ModuleActions; // Updated to use ModuleActions type
  utils: CustomOptionsUtils;
  input?: string[];
  metaConfig?: any;
  currentPath?: string;
}

type CustomArgs = string | string[];

////////////////////////////////////////////////////////////////////////////////
// MAIN
////////////////////////////////////////////////////////////////////////////////

// Adding ModuleActions definition
interface ModuleActions {
  actionEnvSet(): Promise<void>;
  actionRunLocal(): Promise<void>;
  actionRunLocalEntry(): Promise<void>;
  actionRunRemote(): Promise<void>;
  actionSecretsSet(): Promise<void>;
  changeAllIds(): Promise<void>;
  cleanDotTerraformFolders(): Promise<void>;
  createMetaFile(): Promise<void>;
  createShortUUID(): Promise<void>;
  devInstallDependencies(): Promise<void>;
  dockerBuildUnit(component: any, options: any): Promise<void>;
  dockerComposeBuild(component: any, options: any): Promise<void>;
  dockerComposeDown(component: any, options: any): Promise<void>;
  dockerComposeExec(
    instructions: any,
    container: any,
    component: any,
    options: any
  ): Promise<void>;
  dockerComposeUp(component: any, options: any): Promise<void>;
  getDockerImageDigest(arch: any, component: any): Promise<void>;
  getDockerfileAndImageName(
    component: any
  ): Promise<{ dockerfile: string; dockerContext: string; image: string }>;
  hasuraMigrateApply(): Promise<void>;
  hasuraMigrateSquash(): Promise<void>;
  hasuraOpenConsole(): Promise<void>;
  hasuraSchemaExportToLocal(): Promise<void>;
  installDependencies(): Promise<void>;
  machineInit(): Promise<void>;
  metaDataApply(): Promise<void>;
  quickAmend(): Promise<void>;
  quickCommit(): Promise<void>;
  templateExport(): Promise<void>;
  terraformApplyUnit(): Promise<void>;
  terraformDestroyUnit(): Promise<void>;
  terraformUnlock(): Promise<void>;
  terraformVariables(): Promise<void>;
  vaultKvCertsToLocal(): Promise<void>;
  vaultKvCertsToVault(): Promise<void>;
  vaultKvLocalToVault(): Promise<void>;
  vaultKvVaultToGkeCredentials(): Promise<void>;
  vaultKvVaultToLocalAll(): Promise<void>;
  vaultKvVaultToLocalEntry(): Promise<void>;
  vaultKvVaultToLocalUnit(): Promise<void>;

  ////////////////////////////////////////////////////////////////////////////////
  // UTILS?DIVERS
  ////////////////////////////////////////////////////////////////////////////////

  /**
   * Retrieves the application name.
   */
  getAppName(): Promise<string>;

  /**
   * Retrieves the project name.
   */
  getProjectName(): Promise<string>;

  /**
   * Sets the current environment locally.
   */
  setEnvOnLocal(): Promise<void>;

  /**
   * Sets secrets for the target environment locally.
   * @param target - The target environment identifier.
   */
  setSecretsOnLocal(target: string): Promise<void>;

  /**
   * Detects the directory of scripts.
   * @param currentPath - The path to start detection.
   * @returns The detected directory path.
   */
  detectScriptsDirectory(currentPath: string): Promise<string>;

  /**
   * Verifies if the project core exists.
   * @returns True if the project core is detected; false otherwise.
   */
  verifyIfProjectCore(): Promise<boolean>;

  /**
   * Gets files in a specified directory.
   * @param path - The directory path.
   * @returns An array of filenames.
   */
  getFilesInDirectory(path: string): Promise<string[]>;

  /**
   * Returns all directory names in a specified path.
   * @param path - The directory path.
   * @returns An array of directory names.
   */
  getDirectories(path: string): Promise<string[]>;

  /**
   * Recursively discovers directories in a given path.
   * @param path - The starting directory path.
   * @returns An array of paths to directories.
   */
  recursiveDirectoriesDiscovery(path: string): Promise<string[]>;

  /**
   * Verifies if a `meta.json` file exists in the current directory.
   * @param path - The directory path.
   * @returns The parsed `meta.json` content or `false` if not found.
   */
  verifyIfMetaJsonExists(path: string): Promise<any>;

  /**
   * Matches directories based on the specified `meta.json` property condition.
   * @param property - The property to match.
   * @param value - The value to match (optional).
   * @param path - The root directory to start searching.
   * @returns An array of paths matching the specified condition.
   */
  withMetaMatching({
    property,
    value,
    path,
  }: {
    property: string;
    value?: string;
    path?: string;
  }): Promise<any[]>;

  /**
   * Sets secrets up to the specified project directory.
   * @param path - The starting directory path.
   */
  setSecretsUptoProject(path: string): Promise<void>;
}

////////////////////////////////////////////////////////////////////////////////
// THE END
////////////////////////////////////////////////////////////////////////////////
