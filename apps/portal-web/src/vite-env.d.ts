/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PORTAL_API?: string;
  readonly VITE_TRUSTID_API?: string;
  readonly VITE_TRUSTID_WEB?: string;
  readonly VITE_TRUSTID_CLIENT_ID?: string;
  readonly VITE_TRUSTID_REDIRECT_URI?: string;
  readonly VITE_TRUSTID_SCOPES?: string;
  readonly VITE_TRUSTID_MODE?: string;
  readonly VITE_ENABLE_TRUST_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
