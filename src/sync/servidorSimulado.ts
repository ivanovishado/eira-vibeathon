import type { TablaSincronizada } from '../db/schema'
import type { Fila } from './filas'
import { ErrorSincronizacion, type ClienteRemoto, type Cursor } from './remoto'

/**
 * Servidor en memoria que imita a Supabase para las pruebas: cursor por transacción,
 * consultas append-only, gana el `updated_at` más reciente y fallas a pedido.
 */
export function crearServidorSimulado() {
  const tablas = new Map<string, Map<string, Fila>>()
  let xid = 0
  const llamadas = { subir: 0, cambiosDesde: 0 }
  /** Si devuelve un error, la siguiente llamada falla con él. */
  let fallar:
    | ((
        op: 'subir' | 'cambiosDesde',
        tabla: string,
        filas?: Fila[],
      ) => ErrorSincronizacion | undefined)
    | undefined
  /** Simula que el servidor guardó pero la respuesta se perdió. */
  let perderRespuesta = 0

  const tabla = (t: string) => {
    if (!tablas.has(t)) tablas.set(t, new Map())
    return tablas.get(t)!
  }

  const comparar = (a: Fila, b: Cursor) =>
    Number(a.servidor_xid) - Number(b.xid) || String(a.id).localeCompare(b.id)

  const remoto: ClienteRemoto = {
    async subir(t: TablaSincronizada, filas: Fila[], soloAgregar: boolean) {
      llamadas.subir++
      const error = fallar?.('subir', t, filas)
      if (error) throw error
      const actual = tabla(t)
      xid++
      for (const fila of filas) {
        const previa = actual.get(String(fila.id))
        if (previa && soloAgregar) continue
        if (
          previa &&
          typeof fila.updated_at === 'string' &&
          fila.updated_at < String(previa.updated_at)
        )
          continue
        actual.set(String(fila.id), {
          ...structuredClone(fila),
          servidor_xid: String(xid),
        })
      }
      if (perderRespuesta > 0) {
        perderRespuesta--
        throw new ErrorSincronizacion('red', 'Se cortó la conexión')
      }
    },

    async cambiosDesde(t, cursor, limite) {
      llamadas.cambiosDesde++
      const error = fallar?.('cambiosDesde', t)
      if (error) throw error
      const desde = cursor ?? { xid: '0', id: '' }
      return [...tabla(t).values()]
        .filter((f) => comparar(f, desde) > 0)
        .sort((a, b) =>
          comparar(a, { xid: String(b.servidor_xid), id: String(b.id) }),
        )
        .slice(0, limite)
        .map((f) => structuredClone(f))
    },
  }

  return {
    remoto,
    llamadas,
    filas: (t: TablaSincronizada) => [...tabla(t).values()],
    /** Escribe directo en el servidor, como si lo hubiera subido otro dispositivo. */
    escribir(t: TablaSincronizada, fila: Fila) {
      xid++
      tabla(t).set(String(fila.id), { ...fila, servidor_xid: String(xid) })
    },
    fallarCon(f: typeof fallar) {
      fallar = f
    },
    perderRespuestas(n: number) {
      perderRespuesta = n
    },
  }
}
