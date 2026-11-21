import type { EstadoHoja, Hoja } from '../db/schema'

export const ETIQUETA_ESTADO: Record<EstadoHoja, string> = {
  'sin-enviar': 'Sin enviar',
  leyendo: 'Leyendo',
  'por-revisar': 'Por revisar',
  confirmada: 'Confirmada',
  descartada: 'Descartada',
  error: 'Error de lectura',
}

const TRANSICIONES: Record<EstadoHoja, EstadoHoja[]> = {
  'sin-enviar': ['leyendo', 'confirmada', 'descartada'],
  // Si falla la red o la sesión, la hoja vuelve a "sin enviar" para reintentar.
  leyendo: ['por-revisar', 'error', 'sin-enviar', 'confirmada', 'descartada'],
  'por-revisar': ['confirmada', 'descartada'],
  error: ['sin-enviar', 'leyendo', 'confirmada', 'descartada'],
  descartada: ['sin-enviar', 'por-revisar'],
  // Ya generó una consulta: para cambiarla se corrige la consulta.
  confirmada: [],
}

export function puedeCambiar(de: EstadoHoja, a: EstadoHoja): boolean {
  return TRANSICIONES[de].includes(a)
}

/** Hojas que aún esperan algo de una persona o de la lectura. */
export const PENDIENTES: EstadoHoja[] = [
  'sin-enviar',
  'leyendo',
  'por-revisar',
  'error',
]

export const esPendiente = (h: Pick<Hoja, 'estado'>) =>
  PENDIENTES.includes(h.estado)

/** Se puede abrir para revisar o capturar a mano. */
export const sePuedeRevisar = (h: Pick<Hoja, 'estado'>) =>
  h.estado !== 'confirmada' && h.estado !== 'descartada'
