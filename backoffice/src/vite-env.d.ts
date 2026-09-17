/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NEON_AUTH_URL: string
  readonly VITE_NEON_DATA_API_URL: string
  readonly VITE_NOME_ESTABELECIMENTO?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
