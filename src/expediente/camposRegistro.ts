import { formatearFecha, hoyLocal } from './fechas'

/**
 * Formularios sencillos definidos por una lista de campos (antecedentes, atención
 * externa). Todo se captura como texto; `aDatos` lo convierte al guardar.
 */
export type TipoCampoRegistro =
  'texto' | 'parrafo' | 'fecha' | 'opciones' | 'casilla'

export type Valores<K extends string = string> = Partial<Record<K, string>>

export interface Opcion {
  valor: string
  etiqueta: string
}

export interface CampoRegistro<K extends string = string> {
  id: K
  etiqueta: string
  tipo: TipoCampoRegistro
  requerido?: boolean
  placeholder?: string
  opciones?: Opcion[]
  /** Valores frecuentes que se ofrecen al escribir; se puede escribir otro. */
  sugerencias?: string[]
  /** La fecha no puede ser posterior a hoy. */
  noFutura?: boolean
  /** Solo se muestra y se guarda si devuelve true. */
  visibleSi?: (v: Valores<K>) => boolean
  /** Cambia etiqueta, ayuda o sugerencias según lo ya capturado. */
  segun?: (
    v: Valores<K>,
  ) => Partial<
    Pick<CampoRegistro<K>, 'etiqueta' | 'placeholder' | 'sugerencias'>
  >
}

/** Valor de una casilla marcada. */
export const MARCADA = 'si'

const leer = <K extends string>(v: Valores<K>, id: K) => (v[id] ?? '').trim()

/** Campos que aplican a lo capturado, con etiquetas y sugerencias ya resueltas. */
export function camposVisibles<K extends string>(
  campos: CampoRegistro<K>[],
  v: Valores<K>,
): CampoRegistro<K>[] {
  return campos
    .filter((c) => !c.visibleSi || c.visibleSi(v))
    .map((c) => (c.segun ? { ...c, ...c.segun(v) } : c))
}

export function validarRegistro<K extends string>(
  campos: CampoRegistro<K>[],
  v: Valores<K>,
  hoy = hoyLocal(),
): Partial<Record<K, string>> {
  const errores: Partial<Record<K, string>> = {}
  for (const campo of camposVisibles(campos, v)) {
    const valor = leer(v, campo.id)
    if (!valor) {
      if (campo.requerido) errores[campo.id] = 'Campo obligatorio.'
      continue
    }
    if (campo.tipo === 'fecha') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(valor))
        errores[campo.id] = 'Fecha no válida.'
      else if (campo.noFutura && valor > hoy)
        errores[campo.id] = 'La fecha no puede ser posterior a hoy.'
    } else if (
      campo.tipo === 'opciones' &&
      !campo.opciones?.some((o) => o.valor === valor)
    ) {
      errores[campo.id] = 'Elige una opción.'
    }
  }
  return errores
}

/** Convierte lo capturado en los datos que se guardan (sin campos vacíos u ocultos). */
export function aDatos<K extends string>(
  campos: CampoRegistro<K>[],
  v: Valores<K>,
): Partial<Record<K, string | boolean>> {
  const datos: Partial<Record<K, string | boolean>> = {}
  for (const campo of camposVisibles(campos, v)) {
    const valor = leer(v, campo.id)
    if (!valor) continue
    datos[campo.id] = campo.tipo === 'casilla' ? valor === MARCADA : valor
  }
  return datos
}

/** Lo contrario de `aDatos`: precarga el formulario con un registro guardado. */
export function aValores<K extends string>(
  campos: CampoRegistro<K>[],
  registro: object,
): Valores<K> {
  const v: Valores<K> = {}
  const r = registro as Partial<Record<K, unknown>>
  for (const campo of campos) {
    const valor = r[campo.id]
    if (valor === undefined || valor === null || valor === false) continue
    v[campo.id] = valor === true ? MARCADA : String(valor)
  }
  return v
}

/** Texto para mostrar el valor de un campo de un registro guardado. */
export function textoCampo<K extends string>(
  campo: CampoRegistro<K>,
  registro: object,
): string {
  const valor = (registro as Partial<Record<K, unknown>>)[campo.id]
  if (valor === undefined || valor === null || valor === '') return ''
  if (campo.tipo === 'casilla') return valor ? 'Sí' : ''
  if (campo.tipo === 'fecha') return formatearFecha(String(valor))
  if (campo.tipo === 'opciones')
    return (
      campo.opciones?.find((o) => o.valor === valor)?.etiqueta ?? String(valor)
    )
  return String(valor)
}

/** Etiquetas de los campos que cambian entre dos versiones de un registro. */
export function camposCambiados<K extends string>(
  campos: CampoRegistro<K>[],
  antes: object,
  despues: object,
): string[] {
  return campos
    .filter((c) => textoCampo(c, antes) !== textoCampo(c, despues))
    .map((c) => c.etiqueta)
}

/** Comprueba que unos valores leídos de un borrador tengan la forma esperada. */
export function esValores(datos: unknown): datos is Valores {
  return (
    !!datos &&
    typeof datos === 'object' &&
    !Array.isArray(datos) &&
    Object.values(datos).every((v) => typeof v === 'string')
  )
}
