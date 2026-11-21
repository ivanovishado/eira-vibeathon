import type { Consulta, Paciente } from '../db/schema'
import { edad, hoyLocal } from './fechas'
import {
  CAMPOS_CONSULTA,
  valorDeConsulta,
  type SeccionConsulta,
} from './formulario'

/** Fecha local (YYYY-MM-DD) de una marca de tiempo ISO. */
export const fechaDeMarca = (iso: string) => hoyLocal(new Date(iso))

export const horaDeMarca = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  })

/** Campos con valor de una sección, listos para mostrarse. */
export function camposConValor(consulta: Consulta, seccion: SeccionConsulta) {
  return CAMPOS_CONSULTA.filter((c) => c.seccion === seccion).flatMap((c) => {
    const valor = valorDeConsulta(consulta, c.id)
    return valor
      ? [
          {
            id: c.id,
            etiqueta: c.etiqueta,
            valor: c.unidad ? `${valor} ${c.unidad}` : valor,
          },
        ]
      : []
  })
}

/** Nombre, edad y folio en una línea; se usa como contexto en varias pantallas. */
export function lineaIdentificacion(p: Paciente): string {
  return [
    p.fechaNacimiento ? `${edad(p.fechaNacimiento)} años` : undefined,
    p.folio ? `Folio ${p.folio}` : undefined,
  ]
    .filter(Boolean)
    .join(' · ')
}

export function formatearTelefono(t: string): string {
  return t.length === 10 ? `${t.slice(0, 3)} ${t.slice(3, 6)} ${t.slice(6)}` : t
}
