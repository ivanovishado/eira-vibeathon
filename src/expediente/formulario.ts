import type { DatosConsulta } from '../db/repo'
import type {
  Consulta,
  Estudio,
  SignosVitales,
  TipoEstudio,
} from '../db/schema'
import { TIPOS_ESTUDIO } from '../db/schema'
import { esValores, validarRegistro, type Valores } from './camposRegistro'
import { hoyLocal } from './fechas'
import { REGISTROS, type ClaseRegistro } from './registros'

/**
 * Campos del formulario de consulta. Son provisionales mientras no tengamos la hoja en
 * papel de EIRA: para agregar, quitar o reordenar un campo basta con editar esta lista
 * (y, si es un dato nuevo, la interfaz `Consulta` en src/db/schema.ts).
 */
export type IdCampo =
  | Exclude<
      keyof Consulta,
      'id' | 'pacienteId' | 'signosVitales' | 'corrigeA' | 'createdAt'
    >
  | `signosVitales.${keyof SignosVitales}`

export type TipoCampo = 'texto' | 'parrafo' | 'numero' | 'fecha' | 'brigada'

export interface CampoConsulta {
  id: IdCampo
  etiqueta: string
  tipo: TipoCampo
  seccion: SeccionConsulta
  requerido?: boolean
  placeholder?: string
  unidad?: string
  min?: number
  max?: number
  paso?: number
  patron?: RegExp
  mensajePatron?: string
}

export type SeccionConsulta = 'visita' | 'signos' | 'clinica'

export const SECCIONES: { id: SeccionConsulta; titulo: string }[] = [
  { id: 'visita', titulo: 'Visita' },
  { id: 'signos', titulo: 'Signos vitales' },
  { id: 'clinica', titulo: 'Valoración' },
]

export const CAMPOS_CONSULTA: CampoConsulta[] = [
  {
    id: 'fecha',
    etiqueta: 'Fecha',
    tipo: 'fecha',
    seccion: 'visita',
    requerido: true,
  },
  { id: 'brigadaId', etiqueta: 'Brigada', tipo: 'brigada', seccion: 'visita' },
  {
    id: 'medico',
    etiqueta: 'Médica o médico',
    tipo: 'texto',
    seccion: 'visita',
    requerido: true,
    placeholder: 'Nombre de quien atiende',
  },
  {
    id: 'motivo',
    etiqueta: 'Motivo de consulta',
    tipo: 'texto',
    seccion: 'visita',
    requerido: true,
    placeholder: 'Ej. tamizaje de rutina',
  },
  {
    id: 'signosVitales.pesoKg',
    etiqueta: 'Peso',
    tipo: 'numero',
    seccion: 'signos',
    unidad: 'kg',
    min: 20,
    max: 250,
    paso: 0.1,
  },
  {
    id: 'signosVitales.tallaCm',
    etiqueta: 'Talla',
    tipo: 'numero',
    seccion: 'signos',
    unidad: 'cm',
    min: 100,
    max: 220,
  },
  {
    id: 'signosVitales.presionArterial',
    etiqueta: 'Presión arterial',
    tipo: 'texto',
    seccion: 'signos',
    unidad: 'mmHg',
    placeholder: '120/80',
    patron: /^\d{2,3}\/\d{2,3}$/,
    mensajePatron: 'Escribe sistólica/diastólica, por ejemplo 120/80.',
  },
  {
    id: 'signosVitales.frecuenciaCardiaca',
    etiqueta: 'Frecuencia cardiaca',
    tipo: 'numero',
    seccion: 'signos',
    unidad: 'lpm',
    min: 30,
    max: 220,
  },
  {
    id: 'signosVitales.temperaturaC',
    etiqueta: 'Temperatura',
    tipo: 'numero',
    seccion: 'signos',
    unidad: '°C',
    min: 34,
    max: 43,
    paso: 0.1,
  },
  {
    id: 'antecedentes',
    etiqueta: 'Antecedentes',
    tipo: 'parrafo',
    seccion: 'clinica',
  },
  {
    id: 'exploracion',
    etiqueta: 'Exploración física',
    tipo: 'parrafo',
    seccion: 'clinica',
  },
  {
    id: 'diagnostico',
    etiqueta: 'Diagnóstico',
    tipo: 'parrafo',
    seccion: 'clinica',
  },
  { id: 'plan', etiqueta: 'Plan', tipo: 'parrafo', seccion: 'clinica' },
]

export const ETIQUETAS_ESTUDIO: Record<TipoEstudio, string> = {
  mastografia: 'Mastografía',
  ultrasonido: 'Ultrasonido',
  papanicolaou: 'Papanicolaou',
  nutricion: 'Nutrición',
  otro: 'Otro estudio',
}

export interface EstudioCaptura {
  /** Identificador local de la fila del formulario. */
  clave: string
  tipo: TipoEstudio
  /** YYYY-MM-DD; si queda vacío se usa la fecha de la consulta. */
  fecha: string
  resultado: string
}

/** Antecedente o atención externa capturada dentro de la consulta. */
export interface FilaRegistro {
  clave: string
  valores: Valores
}

/** Lo que el médico lleva capturado; es también lo que se guarda como borrador. */
export interface CapturaConsulta {
  valores: Partial<Record<IdCampo, string>>
  estudios: EstudioCaptura[]
  /** Lo que pasó desde la última visita (opcional en borradores anteriores). */
  externas?: FilaRegistro[]
  antecedentes?: FilaRegistro[]
  corrigeA?: string
}

/** Las filas de registros se identifican como `externa.<clave>.<campo>`. */
export type Errores = Partial<
  Record<IdCampo | `estudio.${string}` | `${ClaseRegistro}.${string}`, string>
>

/** Filas de antecedentes y atención externa, por clase. */
export const FILAS_CAPTURA = {
  externa: 'externas',
  antecedente: 'antecedentes',
} as const satisfies Record<ClaseRegistro, keyof CapturaConsulta>

export function capturaVacia(
  recordados: Partial<Record<IdCampo, string>> = {},
  hoy = hoyLocal(),
): CapturaConsulta {
  return { valores: { ...recordados, fecha: hoy }, estudios: [] }
}

let contador = 0
export function nuevoEstudio(tipo: TipoEstudio): EstudioCaptura {
  return {
    clave: `e${Date.now()}-${contador++}`,
    tipo,
    fecha: '',
    resultado: '',
  }
}

export function nuevaFila(valores: Valores = {}): FilaRegistro {
  return { clave: `r${Date.now()}-${contador++}`, valores }
}

function leer(c: CapturaConsulta, id: IdCampo) {
  return (c.valores[id] ?? '').trim()
}

export function validarCaptura(c: CapturaConsulta): Errores {
  const errores: Errores = {}
  for (const campo of CAMPOS_CONSULTA) {
    const v = leer(c, campo.id)
    if (!v) {
      if (campo.requerido) errores[campo.id] = 'Campo obligatorio.'
      continue
    }
    if (campo.tipo === 'numero') {
      const n = Number(v.replace(',', '.'))
      if (!Number.isFinite(n)) errores[campo.id] = 'Debe ser un número.'
      else if (
        (campo.min !== undefined && n < campo.min) ||
        (campo.max !== undefined && n > campo.max)
      )
        errores[campo.id] =
          `Debe estar entre ${campo.min} y ${campo.max}${campo.unidad ? ` ${campo.unidad}` : ''}.`
    } else if (campo.tipo === 'fecha' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      errores[campo.id] = 'Fecha no válida.'
    } else if (campo.patron && !campo.patron.test(v)) {
      errores[campo.id] = campo.mensajePatron ?? 'Formato no válido.'
    }
  }
  for (const e of c.estudios) {
    if (!TIPOS_ESTUDIO.includes(e.tipo))
      errores[`estudio.${e.clave}`] = 'Tipo de estudio no válido.'
    else if (e.fecha && !/^\d{4}-\d{2}-\d{2}$/.test(e.fecha))
      errores[`estudio.${e.clave}`] = 'Fecha no válida.'
  }
  for (const clase of ['externa', 'antecedente'] as const)
    for (const fila of c[FILAS_CAPTURA[clase]] ?? [])
      for (const [campo, error] of Object.entries(
        validarRegistro(REGISTROS[clase].campos, fila.valores),
      ))
        errores[`${clase}.${fila.clave}.${campo}`] = error
  const fechaConsulta = c.valores.fecha ?? ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(fechaConsulta))
    for (const fila of c[FILAS_CAPTURA.externa] ?? []) {
      const clave = `externa.${fila.clave}.fecha` as const
      if (!errores[clave] && (fila.valores.fecha ?? '') > fechaConsulta)
        errores[clave] = 'No puede ser posterior a la fecha de la consulta.'
    }
  return errores
}

/** Convierte la captura (todo texto) en los datos tipados de una consulta. */
export function aDatosConsulta(
  c: CapturaConsulta,
  pacienteId: string,
): DatosConsulta {
  const datos: Record<string, unknown> = { pacienteId }
  const signos: Record<string, unknown> = {}
  for (const campo of CAMPOS_CONSULTA) {
    const v = leer(c, campo.id)
    if (!v) continue
    const valor = campo.tipo === 'numero' ? Number(v.replace(',', '.')) : v
    const [raiz, hoja] = campo.id.split('.')
    if (hoja) signos[hoja] = valor
    else datos[raiz] = valor
  }
  if (Object.keys(signos).length) datos.signosVitales = signos
  if (c.corrigeA) datos.corrigeA = c.corrigeA
  return datos as unknown as DatosConsulta
}

export function aDatosEstudios(
  c: CapturaConsulta,
  pacienteId: string,
  consultaId: string,
  fechaConsulta: string,
) {
  return c.estudios.map((e) => ({
    pacienteId,
    consultaId,
    tipo: e.tipo,
    fecha: e.fecha || fechaConsulta,
    resultado: e.resultado.trim() || undefined,
  }))
}

/** Valor de un campo dentro de una consulta guardada, como texto. */
export function valorDeConsulta(consulta: Consulta, id: IdCampo): string {
  const [raiz, hoja] = id.split('.')
  const v = hoja
    ? consulta.signosVitales?.[hoja as keyof SignosVitales]
    : consulta[raiz as keyof Consulta]
  return v === undefined || v === null ? '' : String(v)
}

/** Captura precargada con una consulta anterior, para registrar su corrección. */
export function capturaParaCorregir(
  original: Consulta,
  estudios: Estudio[],
): CapturaConsulta {
  const valores: CapturaConsulta['valores'] = {}
  for (const campo of CAMPOS_CONSULTA) {
    const v = valorDeConsulta(original, campo.id)
    if (v) valores[campo.id] = v
  }
  return {
    valores,
    corrigeA: original.id,
    estudios: estudios.map((e) => ({
      ...nuevoEstudio(e.tipo),
      fecha: e.fecha === original.fecha ? '' : e.fecha,
      resultado: e.resultado ?? '',
    })),
  }
}

/** Etiquetas de los campos que cambian entre una consulta y su corrección. */
export function camposCorregidos(
  original: Consulta,
  correccion: Consulta,
): string[] {
  return CAMPOS_CONSULTA.filter(
    (c) =>
      valorDeConsulta(original, c.id) !== valorDeConsulta(correccion, c.id),
  ).map((c) => c.etiqueta)
}

/** Comprueba que un borrador leído de la base tenga la forma esperada. */
export function esCaptura(datos: unknown): datos is CapturaConsulta {
  if (!datos || typeof datos !== 'object') return false
  const d = datos as Partial<CapturaConsulta>
  return (
    typeof d.valores === 'object' &&
    d.valores !== null &&
    Array.isArray(d.estudios) &&
    d.estudios.every(
      (e) =>
        e &&
        typeof e.clave === 'string' &&
        typeof e.fecha === 'string' &&
        typeof e.resultado === 'string' &&
        TIPOS_ESTUDIO.includes(e.tipo),
    ) &&
    [d.externas, d.antecedentes].every(
      (filas) =>
        filas === undefined ||
        (Array.isArray(filas) &&
          filas.every(
            (f) => f && typeof f.clave === 'string' && esValores(f.valores),
          )),
    )
  )
}
