import type {
  CampoLectura,
  TipoCampoLectura,
} from '../../supabase/functions/_shared/lecturaHoja.ts'
import type { LecturaHoja } from '../db/schema'
import {
  CAMPOS_CONSULTA,
  errorDeCampo,
  type IdCampo,
} from '../expediente/formulario'
import {
  CAMPOS_PACIENTE,
  FORM_VACIO,
  validarPaciente,
  type FormPaciente,
} from '../lib/formPaciente'

const PACIENTE = 'paciente.'
const CONSULTA = 'consulta.'

/**
 * Campos que se piden al lector, derivados de los formularios de paciente y de
 * consulta: si cambian los formularios, cambia la lectura. `enHoja` es la etiqueta
 * impresa en el papel con la que el OCR ubica cada valor.
 */
export const CAMPOS_LECTURA: CampoLectura[] = [
  ...(Object.keys(CAMPOS_PACIENTE) as (keyof FormPaciente)[]).map((id) => {
    const c = CAMPOS_PACIENTE[id]
    return {
      id: PACIENTE + id,
      etiqueta: `Paciente: ${c.etiqueta}`,
      tipo: (c.fecha ? 'fecha' : 'texto') as TipoCampoLectura,
      ...(c.ayuda ? { ayuda: c.ayuda } : {}),
      enHoja: c.enHoja ?? [c.etiqueta],
    }
  }),
  // La brigada se elige de la lista local; no se lee de la hoja.
  ...CAMPOS_CONSULTA.filter((c) => c.tipo !== 'brigada').map((c) => ({
    id: CONSULTA + c.id,
    etiqueta: `Consulta: ${c.etiqueta}${c.unidad ? ` (${c.unidad})` : ''}`,
    tipo: c.tipo as TipoCampoLectura,
    ...(c.patron && c.placeholder ? { ayuda: `como ${c.placeholder}` } : {}),
    enHoja: c.enHoja ?? [c.etiqueta],
  })),
]

export type MarcaLectura = 'dudoso' | 'ilegible'

function porPrefijo<K extends string>(
  lectura: LecturaHoja | undefined,
  prefijo: string,
) {
  const valores: Partial<Record<K, string>> = {}
  const marcas: Partial<Record<K, MarcaLectura>> = {}
  if (!lectura) return { valores, marcas }
  const conocidos = new Set(CAMPOS_LECTURA.map((c) => c.id))
  for (const [id, valor] of Object.entries(lectura.valores))
    if (id.startsWith(prefijo) && conocidos.has(id) && valor.trim())
      valores[id.slice(prefijo.length) as K] = valor.trim()
  for (const id of lectura.dudosos)
    if (id.startsWith(prefijo)) marcas[id.slice(prefijo.length) as K] = 'dudoso'
  // Lo ilegible queda vacío, aunque viniera algo o el formulario tenga un valor por
  // omisión (fecha de hoy, médico recordado).
  for (const id of lectura.ilegibles)
    if (id.startsWith(prefijo)) {
      const campo = id.slice(prefijo.length) as K
      marcas[campo] = 'ilegible'
      valores[campo] = ''
    }
  return { valores, marcas }
}

/**
 * Lo leído que no pasa la validación del formulario no llega como si fuera bueno:
 * queda vacío y marcado dudoso, igual que lo que el lector no pudo interpretar.
 */
function descartarInvalido<K extends string>(
  valores: Partial<Record<K, string>>,
  marcas: Partial<Record<K, MarcaLectura>>,
  campo: K,
) {
  valores[campo] = ''
  marcas[campo] ??= 'dudoso'
}

/** Celular de la hoja a 10 dígitos (sin espacios, guiones ni lada 52/521). */
export function normalizarCelularLeido(texto: string): string {
  const digitos = texto.replace(/\D/g, '')
  const sinLada = /^521?(\d{10})$/.exec(digitos)
  return sinLada ? sinLada[1] : digitos
}

/** Formulario de paciente con lo leído; lo demás vacío. */
export function pacienteDeLectura(
  lectura?: LecturaHoja,
  hoy = new Date(),
): {
  form: FormPaciente
  marcas: Partial<Record<keyof FormPaciente, MarcaLectura>>
} {
  const { valores, marcas } = porPrefijo<keyof FormPaciente>(lectura, PACIENTE)
  if (valores.celular) valores.celular = normalizarCelularLeido(valores.celular)
  if (valores.curp)
    valores.curp = valores.curp.replace(/\s+/g, '').toUpperCase()
  const form = { ...FORM_VACIO, ...valores }
  const errores = validarPaciente(form, hoy)
  for (const campo of ['fechaNacimiento', 'celular', 'curp'] as const)
    if (errores[campo] || (campo === 'celular' && form.celular.length > 10)) {
      descartarInvalido(valores, marcas, campo)
      form[campo] = ''
    }
  return { form, marcas }
}

/** Valores leídos para el formulario de consulta (punto de partida, no definitivos). */
export function consultaDeLectura(lectura?: LecturaHoja): {
  valores: Partial<Record<IdCampo, string>>
  marcas: Partial<Record<IdCampo, MarcaLectura>>
} {
  const { valores, marcas } = porPrefijo<IdCampo>(lectura, CONSULTA)
  for (const campo of CAMPOS_CONSULTA) {
    const v = valores[campo.id]
    if (v && errorDeCampo(campo, v))
      descartarInvalido(valores, marcas, campo.id)
  }
  return { valores, marcas }
}

export const TEXTO_MARCA: Record<MarcaLectura, string> = {
  dudoso: 'Leído con duda: compáralo con la foto.',
  ilegible: 'Ilegible en la hoja: captúralo viendo la foto.',
}
