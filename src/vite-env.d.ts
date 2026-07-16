/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APPSCRIPT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
