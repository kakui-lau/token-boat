/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONSOLE_DATA_MODE?: "demo" | "live";
  readonly VITE_CONSOLE_API_BASE_URL?: string;
  readonly VITE_CONSOLE_API_PROXY_TARGET?: string;
  readonly VITE_CONSOLE_LEGACY_PROXY_TARGET?: string;
  readonly VITE_CONSOLE_WALLETCONNECT_PROJECT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
