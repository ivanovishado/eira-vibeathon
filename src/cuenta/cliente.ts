import type { SupabaseClient } from '@supabase/supabase-js'
import { configSupabase } from './config'

/** Una red mala puede dejar una petición colgada; mejor fallar y reintentar. */
const LIMITE_PETICION_MS = 20_000

const conLimitePropio = new WeakSet<AbortSignal>()

/**
 * Señal con un límite distinto al general, para las pocas peticiones que tardan
 * más por diseño (la lectura de una hoja). Pásala como `signal` de la llamada.
 */
export function limitePropio(ms: number): AbortSignal {
  const signal = AbortSignal.timeout(ms)
  conLimitePropio.add(signal)
  return signal
}

export const fetchConLimite: typeof fetch = (entrada, init) => {
  if (init?.signal && conLimitePropio.has(init.signal))
    return fetch(entrada, init)
  const limite = AbortSignal.timeout(LIMITE_PETICION_MS)
  const signal =
    init?.signal && 'any' in AbortSignal
      ? AbortSignal.any([init.signal, limite])
      : (init?.signal ?? limite)
  return fetch(entrada, { ...init, signal })
}

let cliente: Promise<SupabaseClient> | undefined

/** Cliente de Supabase; se carga bajo demanda para no pesar en el modo solo local. */
export function obtenerCliente(): Promise<SupabaseClient> {
  cliente ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(configSupabase.url, configSupabase.llave, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: 'eira-sesion',
      },
      global: { fetch: fetchConLimite },
    }),
  )
  return cliente
}
