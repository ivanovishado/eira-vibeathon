import { crearRepo } from '../db/repo'
import { db as dbPorDefecto, type EiraDB, type Hoja } from '../db/schema'
import {
  comoErrorSincronizacion,
  ErrorSincronizacion,
} from '../sync/remoto'
import { CAMPOS_LECTURA } from './campos'
import type { ServicioHojas } from './servicio'

/** Si una lectura quedó a medias (app cerrada), se vuelve a intentar tras este tiempo. */
export const LECTURA_ABANDONADA_MS = 3 * 60_000

export const rutaImagen = (hojaId: string) => `${hojaId}.jpg`

/** Hojas que este dispositivo puede mandar a leer: tiene la foto o ya está en Storage. */
export async function hojasPorLeer(
  db: EiraDB = dbPorDefecto,
  ahora = new Date(),
): Promise<Hoja[]> {
  const limite = new Date(ahora.getTime() - LECTURA_ABANDONADA_MS).toISOString()
  const candidatas = (
    await db.hojas.where('estado').anyOf('sin-enviar', 'leyendo').toArray()
  ).filter((h) => h.estado === 'sin-enviar' || h.updatedAt < limite)
  const conFoto = await db.imagenesHoja.bulkGet(candidatas.map((h) => h.id))
  return candidatas
    .filter((h, i) => h.rutaImagen || conFoto[i])
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/**
 * Sube la foto y pide la lectura de cada hoja pendiente, una por una. Un rechazo deja
 * esa hoja en "error" y sigue con las demás; un fallo de red o de sesión la regresa a
 * "sin enviar" y detiene la cola (el programador reintenta con espera).
 */
export async function leerHojasPendientes(
  servicio: ServicioHojas,
  db: EiraDB = dbPorDefecto,
): Promise<{ leidas: number; errores: number }> {
  const repo = crearRepo(db)
  const resultado = { leidas: 0, errores: 0 }
  // Solo actualiza si nadie (una persona u otro dispositivo) movió la hoja mientras.
  const siSigueLeyendo = (id: string, cambios: Partial<Hoja>) =>
    db.transaction('rw', [db.hojas, db.colaSalida], async () => {
      if ((await db.hojas.get(id))?.estado !== 'leyendo') return false
      await repo.actualizarHoja(id, cambios)
      return true
    })

  for (const pendiente of await hojasPorLeer(db)) {
    const id = pendiente.id
    const hoja = await db.transaction(
      'rw',
      [db.hojas, db.colaSalida],
      async () => {
        const h = await db.hojas.get(id)
        if (!h || (h.estado !== 'sin-enviar' && h.estado !== 'leyendo')) return
        return repo.actualizarHoja(id, {
          estado: 'leyendo',
          errorLectura: undefined,
        })
      },
    )
    if (!hoja) continue
    try {
      let ruta = hoja.rutaImagen
      if (!ruta) {
        const imagen = await db.imagenesHoja.get(id)
        if (!imagen) throw new ErrorSincronizacion(
            'rechazo',
            'La foto ya no está en este dispositivo.',
          )
        ruta = rutaImagen(id)
        await servicio.subir(ruta, imagen.datos, imagen.tipo)
        await siSigueLeyendo(id, { rutaImagen: ruta })
      }
      const lectura = await servicio.leer(ruta, CAMPOS_LECTURA)
      if (
        await siSigueLeyendo(id, {
          estado: 'por-revisar',
          rutaImagen: ruta,
          lectura: { ...lectura, leidaEn: new Date().toISOString() },
        })
      )
        resultado.leidas++
    } catch (e) {
      const error = comoErrorSincronizacion(e)
      if (error.tipo === 'rechazo') {
        await siSigueLeyendo(id, {
          estado: 'error',
          errorLectura: error.message,
        })
        resultado.errores++
        continue
      }
      await siSigueLeyendo(id, { estado: 'sin-enviar' })
      throw error
    }
  }
  return resultado
}
