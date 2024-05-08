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
  getAppName(): Promise<void>;
  getProjectName(): Promise<void>;
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
}

////////////////////////////////////////////////////////////////////////////////
// THE END
////////////////////////////////////////////////////////////////////////////////
