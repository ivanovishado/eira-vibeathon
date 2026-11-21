import {
  db as dbPorDefecto,
  type CambioPendiente,
  type EiraDB,
  type TablaSincronizada,
} from '../db/schema'
import { aFilaRemota, aRegistroLocal, type Fila } from './filas'
import {
  comoErrorSincronizacion,
  ErrorSincronizacion,
  type ClienteRemoto,
  type Cursor,
} from './remoto'
import { ORDEN_TABLAS, TABLAS_SINCRONIZADAS } from './tablas'

// El estado de la sincronización vive en `borradores` (clave-valor local) para no
// cambiar el esquema y para guardarlo en la misma transacción que los datos.
const claveCursor = (tabla: TablaSincronizada) => `sync:cursor:${tabla}`
export const CLAVE_ULTIMA_DESCARGA = 'sync:ultimaDescarga'

export interface OpcionesMotor {
  loteSubida?: number
  loteDescarga?: number
  ahora?: () => string
}

export interface ResultadoSincronizacion {
  enviados: number
  recibidos: number
}

/**
 * Sube la cola de salida y descarga los cambios del servidor. Cada paso confirma en
 * transacciones cortas, así un corte a medias solo repite trabajo ya idempotente.
 */
export function crearMotor(
  remoto: ClienteRemoto,
  db: EiraDB = dbPorDefecto,
  {
    loteSubida = 200,
    loteDescarga = 500,
    ahora = () => new Date().toISOString(),
  }: OpcionesMotor = {},
) {
  const sumarIntento = (entradas: CambioPendiente[]) =>
    db.colaSalida
      .where('seq')
      .anyOf(entradas.map((e) => e.seq!))
      .modify((c) => {
        c.intentos += 1
      })

  const quitar = (entradas: CambioPendiente[]) =>
    db.colaSalida.bulkDelete(entradas.map((e) => e.seq!))

  /** Envía los registros de una tabla; si el servidor rechaza el lote, los aísla uno por uno. */
  async function enviarTabla(
    tabla: TablaSincronizada,
    entradas: CambioPendiente[],
  ): Promise<{ enviados: number; rechazo?: ErrorSincronizacion }> {
    const config = TABLAS_SINCRONIZADAS[tabla]
    const ids = [...new Set(entradas.map((e) => e.registroId))]
    const registros = (await db.table(tabla).bulkGet(ids)).filter(
      (r): r is { id: string } => Boolean(r),
    )
    const filas = registros.map((r) => aFilaRemota(config, r))
    try {
      if (filas.length) await remoto.subir(tabla, filas, config.soloAgregar)
      await quitar(entradas)
      return { enviados: filas.length }
    } catch (e) {
      const error = comoErrorSincronizacion(e)
      if (error.tipo !== 'rechazo' || filas.length <= 1) {
        await sumarIntento(entradas)
        if (error.tipo !== 'rechazo') throw error
        return { enviados: 0, rechazo: error }
      }
    }
    let enviados = 0
    let rechazo: ErrorSincronizacion | undefined
    for (const fila of filas) {
      const suyas = entradas.filter((e) => e.registroId === fila.id)
      try {
        await remoto.subir(tabla, [fila], config.soloAgregar)
        await quitar(suyas)
        enviados++
      } catch (e) {
        const error = comoErrorSincronizacion(e)
        await sumarIntento(suyas)
        if (error.tipo !== 'rechazo') throw error
        rechazo = error
      }
    }
    // Entradas de registros que ya no existen localmente: nada que subir.
    const existentes = new Set(filas.map((f) => f.id))
    await quitar(entradas.filter((e) => !existentes.has(e.registroId)))
    return { enviados, rechazo }
  }

  /** Recorre la cola una vez. Un registro rechazado no detiene a los demás. */
  async function subir(): Promise<number> {
    let desde = 0
    let enviados = 0
    let rechazados = 0
    let ultimoRechazo: ErrorSincronizacion | undefined
    for (;;) {
      const lote = await db.colaSalida
        .where('seq')
        .above(desde)
        .limit(loteSubida)
        .toArray()
      if (!lote.length) break
      desde = lote.at(-1)!.seq!
      for (const tabla of ORDEN_TABLAS) {
        const entradas = lote.filter((e) => e.tabla === tabla)
        if (!entradas.length) continue
        const r = await enviarTabla(tabla, entradas)
        enviados += r.enviados
        if (r.rechazo) {
          rechazados++
          ultimoRechazo = r.rechazo
        }
      }
    }
    if (ultimoRechazo)
      throw new ErrorSincronizacion(
        'rechazo',
        `El servidor rechazó ${rechazados === 1 ? 'un cambio' : 'algunos cambios'}: ${ultimoRechazo.message}`,
      )
    return enviados
  }

  async function leerCursor(tabla: TablaSincronizada) {
    const b = await db.borradores.get(claveCursor(tabla))
    return b?.datos as Cursor | undefined
  }

  async function guardarPagina(tabla: TablaSincronizada, filas: Fila[]) {
    const config = TABLAS_SINCRONIZADAS[tabla]
    const ultima = filas.at(-1)!
    const cursor: Cursor = {
      xid: String(ultima.servidor_xid),
      id: String(ultima.id),
    }
    await db.transaction(
      'rw',
      [db.table(tabla), db.colaSalida, db.borradores],
      async () => {
        // Un cambio local que aún no sube gana sobre lo que trae el servidor.
        const pendientes = new Set(
          (await db.colaSalida.where('tabla').equals(tabla).toArray()).map(
            (c) => c.registroId,
          ),
        )
        await db
          .table(tabla)
          .bulkPut(
            filas
              .map((f) => aRegistroLocal(config, f))
              .filter((r) => !pendientes.has(r.id as string)),
          )
        await db.borradores.put({
          clave: claveCursor(tabla),
          datos: cursor,
          updatedAt: ahora(),
        })
      },
    )
    return cursor
  }

  /** Descarga todo lo nuevo desde el último cursor de cada tabla. */
  async function descargar(): Promise<number> {
    const inicio = ahora()
    let recibidos = 0
    for (const tabla of ORDEN_TABLAS) {
      let cursor = await leerCursor(tabla)
      for (;;) {
        const filas = await remoto.cambiosDesde(tabla, cursor, loteDescarga)
        if (!filas.length) break
        cursor = await guardarPagina(tabla, filas)
        recibidos += filas.length
        if (filas.length < loteDescarga) break
      }
    }
    await db.borradores.put({
      clave: CLAVE_ULTIMA_DESCARGA,
      datos: inicio,
      updatedAt: inicio,
    })
    return recibidos
  }

  /** Sube y luego descarga. Un rechazo no impide descargar, pero se reporta al final. */
  async function sincronizar(): Promise<ResultadoSincronizacion> {
    let enviados = 0
    let rechazo: ErrorSincronizacion | undefined
    try {
      enviados = await subir()
    } catch (e) {
      const error = comoErrorSincronizacion(e)
      if (error.tipo !== 'rechazo') throw error
      rechazo = error
    }
    const recibidos = await descargar()
    if (rechazo) throw rechazo
    return { enviados, recibidos }
  }

  return { subir, descargar, sincronizar }
}

export async function ultimaDescargaCompleta(
  db: EiraDB = dbPorDefecto,
): Promise<string | undefined> {
  const b = await db.borradores.get(CLAVE_ULTIMA_DESCARGA)
  return typeof b?.datos === 'string' ? b.datos : undefined
}
