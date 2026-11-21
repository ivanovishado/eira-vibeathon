/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** Demo sin servidor: lee las hojas con el lector simulado. */
  readonly VITE_LECTOR_SIMULADO?: string
}
