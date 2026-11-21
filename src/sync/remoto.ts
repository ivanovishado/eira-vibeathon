import type { TablaSincronizada } from '../db/schema'
import type { Fila } from './filas'

/** Posición de descarga: último cambio recibido de una tabla. */
export interface Cursor {
  xid: string
  id: string
}

/** Lo que la sincronización necesita del servidor; en pruebas se simula. */
export interface ClienteRemoto {
  /** Inserta o reemplaza filas por `id`. Con `soloAgregar` ignora las que ya existen. */
  subir(
    tabla: TablaSincronizada,
    filas: Fila[],
    soloAgregar: boolean,
  ): Promise<void>
  /** Cambios posteriores al cursor, ordenados; cada fila trae `servidor_xid` e `id`. */
  cambiosDesde(
    tabla: TablaSincronizada,
    cursor: Cursor | undefined,
    limite: number,
  ): Promise<Fila[]>
}

/**
 * - `red`: sin conexión, tiempo agotado o servidor caído; se reintenta.
 * - `sesion`: falta iniciar sesión o la sesión venció.
 * - `rechazo`: el servidor rechazó los datos; reintentar igual no lo arregla.
 */
export type TipoError = 'red' | 'sesion' | 'rechazo'

export class ErrorSincronizacion extends Error {
  readonly tipo: TipoError
  constructor(tipo: TipoError, mensaje: string) {
    super(mensaje)
    this.name = 'ErrorSincronizacion'
    this.tipo = tipo
  }
}

export function comoErrorSincronizacion(e: unknown): ErrorSincronizacion {
  if (e instanceof ErrorSincronizacion) return e
  return new ErrorSincronizacion(
    'red',
    e instanceof Error ? e.message : String(e),
  )
}
