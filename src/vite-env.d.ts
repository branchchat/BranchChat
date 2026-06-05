/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Backend origin, e.g. http://localhost:8000. Empty = local-first stub mode.
  readonly VITE_API_BASE?: string;
  // AI provider route to use: "gemini" (default) or "ollama".
  readonly VITE_PROVIDER?: "gemini" | "ollama";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
