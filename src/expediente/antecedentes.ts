import {
  TIPOS_ANTECEDENTE,
  type Antecedente,
  type TipoAntecedente,
} from '../db/schema'
import type { CampoRegistro, Opcion, Valores } from './camposRegistro'
import type { Versionado } from './versiones'

export type IdCampoAntecedente = Exclude<
  keyof Antecedente,
  'id' | 'pacienteId' | 'corrigeA' | 'retirado' | 'createdAt'
>

export const ETIQUETAS_TIPO_ANTECEDENTE: Record<TipoAntecedente, string> = {
  cancer: 'Cáncer',
  cronica: 'Enfermedad crónica',
  ginecoobstetrico: 'Gineco-obstétrico',
  quirurgico: 'Cirugía',
  alergia: 'Alergia',
  otro: 'Otro',
}

const opciones = <T extends string>(etiquetas: Record<T, string>): Opcion[] =>
  Object.entries<string>(etiquetas).map(([valor, etiqueta]) => ({
    valor,
    etiqueta,
  }))

/**
 * Campos de un antecedente. Son provisionales mientras no tengamos la hoja de EIRA:
 * para cambiar uno basta con editar esta lista (y, si es un dato nuevo, la interfaz
 * `Antecedente` en src/db/schema.ts).
 */
export const CAMPOS_ANTECEDENTE: CampoRegistro<IdCampoAntecedente>[] = [
  {
    id: 'ambito',
    etiqueta: 'De quién',
    tipo: 'opciones',
    requerido: true,
    opciones: [
      { valor: 'personal', etiqueta: 'De la paciente' },
      { valor: 'familiar', etiqueta: 'De un familiar' },
    ],
  },
  {
    id: 'parentesco',
    etiqueta: 'Familiar',
    tipo: 'texto',
    requerido: true,
    placeholder: 'Ej. madre, abuela materna',
    sugerencias: [
      'Madre',
      'Padre',
      'Hermana',
      'Hermano',
      'Hija',
      'Abuela materna',
      'Abuela paterna',
      'Tía materna',
      'Tía paterna',
      'Prima',
    ],
    visibleSi: (v) => v.ambito === 'familiar',
  },
  {
    id: 'tipo',
    etiqueta: 'Tipo',
    tipo: 'opciones',
    requerido: true,
    opciones: opciones(ETIQUETAS_TIPO_ANTECEDENTE),
  },
  {
    id: 'descripcion',
    etiqueta: '¿Cuál?',
    tipo: 'texto',
    requerido: true,
    placeholder: 'Ej. diabetes tipo 2, cesárea',
    segun: (v) =>
      v.tipo === 'cancer'
        ? {
            etiqueta: 'Tipo de cáncer',
            placeholder: 'Ej. mama',
            sugerencias: [
              'Mama',
              'Cervicouterino',
              'Ovario',
              'Endometrio',
              'Colon',
              'Tiroides',
            ],
          }
        : {},
  },
  {
    id: 'cuando',
    etiqueta: 'Cuándo',
    tipo: 'texto',
    placeholder: 'Año o edad, ej. 2015 o a los 45 años',
  },
  {
    id: 'notas',
    etiqueta: 'Notas',
    tipo: 'parrafo',
    placeholder: 'Tratamiento, estado actual, dónde la atendieron…',
  },
]

/** Accesos rápidos para lo que más interesa a EIRA. */
export const ATAJOS_ANTECEDENTE: { etiqueta: string; valores: Valores }[] = [
  {
    etiqueta: 'Cáncer en la familia',
    valores: { ambito: 'familiar', tipo: 'cancer' },
  },
  {
    etiqueta: 'Cáncer de la paciente',
    valores: { ambito: 'personal', tipo: 'cancer' },
  },
  { etiqueta: 'Otro antecedente', valores: {} },
]

/** Cáncer primero; luego de la paciente antes que de la familia. */
export function ordenarAntecedentes<T extends Versionado<Antecedente>>(
  lista: T[],
): T[] {
  const peso = (a: Antecedente) =>
    TIPOS_ANTECEDENTE.indexOf(a.tipo) * 2 + (a.ambito === 'personal' ? 0 : 1)
  return [...lista].sort(
    (a, b) =>
      peso(a.vigente) - peso(b.vigente) ||
      a.origen.createdAt.localeCompare(b.origen.createdAt),
  )
}

/** "Mama · Madre · 2015" */
export function describirAntecedente(a: Antecedente): string {
  return [
    a.descripcion,
    a.ambito === 'familiar' ? a.parentesco : undefined,
    a.cuando,
  ]
    .filter(Boolean)
    .join(' · ')
}
