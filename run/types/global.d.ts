////////////////////////////////////////////////////////////////////////////////
// TYPE DEFINITION
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

interface CustomOptions {
  env?: Record<string, string>;
  run?: string;
  url?: CustomOptionsUrl;
  utils: CustomOptionsUtils;
  input?: string[];
  metaConfig?: any;
  currentPath?: string;
}

// type for the Argument

type CustomArgs = string | string[];
