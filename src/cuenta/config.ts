const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const llave = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? ''

export const configSupabase = { url, llave }

/** Sin estas variables la app funciona solo con los datos del dispositivo. */
export const sincronizacionConfigurada = Boolean(url && llave)
