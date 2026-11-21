import type { AtencionExterna, TipoAtencionExterna } from '../db/schema'
import type { CampoRegistro } from './camposRegistro'
import { formatearFecha, formatearMes } from './fechas'

export type IdCampoAtencionExterna = Exclude<
  keyof AtencionExterna,
  'id' | 'pacienteId' | 'corrigeA' | 'retirado' | 'createdAt' | 'consultaId'
>

export const ETIQUETAS_TIPO_ATENCION: Record<TipoAtencionExterna, string> = {
  consulta: 'Consulta',
  estudio: 'Estudio',
  diagnostico: 'Diagnóstico',
  tratamiento: 'Tratamiento',
  hospitalizacion: 'Hospitalización o cirugía',
  otro: 'Otro',
}

/**
 * Campos de la atención recibida fuera de EIRA. Son provisionales: para cambiar uno
 * basta con editar esta lista (y, si es un dato nuevo, `AtencionExterna` en
 * src/db/schema.ts).
 */
export const CAMPOS_ATENCION_EXTERNA: CampoRegistro<IdCampoAtencionExterna>[] =
  [
    {
      id: 'tipo',
      etiqueta: 'Qué fue',
      tipo: 'opciones',
      requerido: true,
      opciones: Object.entries(ETIQUETAS_TIPO_ATENCION).map(
        ([valor, etiqueta]) => ({ valor, etiqueta }),
      ),
    },
    {
      id: 'especialidad',
      etiqueta: 'Especialidad o área',
      tipo: 'texto',
      placeholder: 'Ej. nutrición, ginecología',
      sugerencias: [
        'Nutrición',
        'Ginecología',
        'Oncología',
        'Medicina general',
        'Cirugía',
        'Psicología',
        'Radiología',
      ],
    },
    {
      id: 'fecha',
      etiqueta: 'Fecha',
      tipo: 'fecha',
      requerido: true,
      noFutura: true,
    },
    {
      id: 'fechaAproximada',
      etiqueta: 'La fecha es aproximada',
      tipo: 'casilla',
    },
    {
      id: 'lugar',
      etiqueta: 'Dónde o con quién',
      tipo: 'texto',
      placeholder: 'Ej. Centro de Salud Tuxpan, Dra. López',
    },
    {
      id: 'resumen',
      etiqueta: 'Resumen',
      tipo: 'parrafo',
      requerido: true,
      placeholder: 'Qué le dijeron, resultados, indicaciones…',
    },
  ]

/** "14 mar 2026" o, si es aproximada, "aprox. mar 2026". */
export function fechaAtencion(a: AtencionExterna): string {
  return a.fechaAproximada
    ? `aprox. ${formatearMes(a.fecha)}`
    : formatearFecha(a.fecha)
}

export function tituloAtencion(a: AtencionExterna): string {
  return a.especialidad || ETIQUETAS_TIPO_ATENCION[a.tipo]
}
