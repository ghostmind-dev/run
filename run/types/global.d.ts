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

// Adding ModuleActions definition
interface ModuleActions {
  actionEnvSet(): Promise<void>;
  actionRunLocal(): Promise<void>;
  actionRunLocalEntry(): Promise<void>;
  actionRunRemote(): Promise<void>;
  actionSecretsSet(): Promise<void>;
  changeAllIds(): Promise<void>;
  cleanDotTerraformFolders(): Promise<void>;
  commitChangesReturn(): Promise<void>;
  createMetaFile(): Promise<void>;
  createShortUUID(): Promise<void>;
  devInstallDependencies(): Promise<void>;
  dockerBuildUnit(): Promise<void>;
  dockerComposeBuild(): Promise<void>;
  dockerComposeDown(): Promise<void>;
  dockerComposeExec(): Promise<void>;
  dockerComposeUp(): Promise<void>;
  envDevcontainer(): Promise<void>;
  getDockerImageDigest(): Promise<void>;
  getDockerfileAndImageName(): Promise<void>;
  hasuraMigrateApply(): Promise<void>;
  hasuraMigrateSquash(): Promise<void>;
  hasuraOpenConsole(): Promise<void>;
  hasuraSchemaExportToLocal(): Promise<void>;
  installDependencies(): Promise<void>;
  machineInit(): Promise<void>;
  metaDataApply(): Promise<void>;
  quickAmend(): Promise<void>;
  quickCommit(): Promise<void>;
  repoConvert(): Promise<void>;
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

interface CustomOptions {
  env?: Record<string, string>;
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

////////////////////////////////////////////////////////////////////////////////
// THE END
////////////////////////////////////////////////////////////////////////////////