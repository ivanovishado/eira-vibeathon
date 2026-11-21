import type { SupabaseClient } from '@supabase/supabase-js'
import { obtenerCliente } from '../cuenta/cliente'
import { aSnake } from './filas'
import { ErrorSincronizacion, type ClienteRemoto } from './remoto'

const ID_CERO = '00000000-0000-0000-0000-000000000000'

/** Clasifica un error de PostgREST según si conviene reintentar. */
export function clasificar(
  error: { message: string; code?: string },
  status: number,
): ErrorSincronizacion {
  const mensaje = error.message || `Error ${status}`
  if (status === 401 || error.code === 'PGRST301' || error.code === 'PGRST303')
    return new ErrorSincronizacion(
      'sesion',
      'La sesión venció; vuelve a iniciar sesión para sincronizar.',
    )
  if (status === 0 || status === 408 || status === 429 || status >= 500)
    return new ErrorSincronizacion('red', mensaje)
  return new ErrorSincronizacion('rechazo', mensaje)
}

/** Servidor real: tablas por PostgREST y descarga por la función `cambios_desde`. */
export function crearRemotoSupabase(
  obtener: () => Promise<SupabaseClient> = obtenerCliente,
): ClienteRemoto {
  async function conSesion() {
    const cliente = await obtener()
    const { data, error } = await cliente.auth.getSession()
    if (error)
      throw new ErrorSincronizacion(
        error.name === 'AuthRetryableFetchError' ? 'red' : 'sesion',
        error.message,
      )
    if (!data.session)
      throw new ErrorSincronizacion('sesion', 'Inicia sesión para sincronizar.')
    return cliente
  }

  return {
    async subir(tabla, filas, soloAgregar) {
      const cliente = await conSesion()
      const { error, status } = await cliente
        .from(aSnake(tabla))
        .upsert(filas, { onConflict: 'id', ignoreDuplicates: soloAgregar })
      if (error) throw clasificar(error, status)
    },

    async cambiosDesde(tabla, cursor, limite) {
      const cliente = await conSesion()
      const { data, error, status } = await cliente.rpc('cambios_desde', {
        tabla: aSnake(tabla),
        desde_xid: cursor?.xid ?? '0',
        desde_id: cursor?.id ?? ID_CERO,
        limite,
      })
      if (error) throw clasificar(error, status)
      return (data ?? []) as Record<string, unknown>[]
    },
  }
}
