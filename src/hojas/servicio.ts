import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CampoLectura,
  ResultadoLectura,
} from '../../supabase/functions/_shared/lecturaHoja.ts'
import { obtenerCliente } from '../cuenta/cliente'
import { ErrorSincronizacion } from '../sync/remoto'

export const BUCKET_HOJAS = 'hojas'

/**
 * Lo que la app necesita del servidor para leer hojas. Los errores son
 * `ErrorSincronizacion`: `red` y `sesion` se reintentan, `rechazo` no.
 */
export interface ServicioHojas {
  subir(ruta: string, datos: ArrayBuffer, tipo: string): Promise<void>
  leer(ruta: string, campos: CampoLectura[]): Promise<ResultadoLectura>
  descargar(ruta: string): Promise<{ datos: ArrayBuffer; tipo: string }>
}

function porEstado(status: number | undefined, mensaje: string) {
  if (status === 401 || status === 403)
    return new ErrorSincronizacion(
      'sesion',
      'La sesión venció; vuelve a iniciar sesión para leer hojas.',
    )
  if (!status || status === 408 || status === 429 || status >= 500)
    return new ErrorSincronizacion('red', mensaje)
  return new ErrorSincronizacion('rechazo', mensaje)
}

/** Storage privado para las fotos y la Edge Function `leer-hoja` para la lectura. */
export function crearServicioSupabase(
  obtener: () => Promise<SupabaseClient> = obtenerCliente,
): ServicioHojas {
  async function conSesion() {
    const cliente = await obtener()
    const { data, error } = await cliente.auth.getSession()
    if (error)
      throw new ErrorSincronizacion(
        error.name === 'AuthRetryableFetchError' ? 'red' : 'sesion',
        error.message,
      )
    if (!data.session)
      throw new ErrorSincronizacion('sesion', 'Inicia sesión para leer hojas.')
    return cliente
  }

  function errorStorage(error: unknown) {
    const e = error as { message?: string; statusCode?: string; status?: number }
    const status = e.status ?? (Number(e.statusCode) || undefined)
    return porEstado(status, e.message ?? String(error))
  }

  return {
    async subir(ruta, datos, tipo) {
      const cliente = await conSesion()
      const { error } = await cliente.storage
        .from(BUCKET_HOJAS)
        .upload(ruta, new Blob([datos], { type: tipo }), {
          contentType: tipo,
          upsert: true,
        })
      if (error) throw errorStorage(error)
    },

    async leer(ruta, campos) {
      const cliente = await conSesion()
      const { data, error } = await cliente.functions.invoke<ResultadoLectura>(
        'leer-hoja',
        { body: { ruta, campos } },
      )
      if (error) {
        const respuesta = (error as { context?: Response }).context
        let mensaje = error.message
        if (respuesta instanceof Response) {
          const cuerpo = (await respuesta
            .clone()
            .json()
            .catch(() => undefined)) as { error?: string } | undefined
          if (cuerpo?.error) mensaje = cuerpo.error
        }
        throw porEstado(
          respuesta instanceof Response ? respuesta.status : undefined,
          mensaje,
        )
      }
      if (!data || typeof data !== 'object' || !('valores' in data))
        throw new ErrorSincronizacion('rechazo', 'Respuesta de lectura inválida.')
      return data
    },

    async descargar(ruta) {
      const cliente = await conSesion()
      const { data, error } = await cliente.storage
        .from(BUCKET_HOJAS)
        .download(ruta)
      if (error) throw errorStorage(error)
      return { datos: await data.arrayBuffer(), tipo: data.type || 'image/jpeg' }
    },
  }
}
