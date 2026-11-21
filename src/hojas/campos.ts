import type {
  CampoLectura,
  TipoCampoLectura,
} from '../../supabase/functions/_shared/lecturaHoja.ts'
import type { LecturaHoja } from '../db/schema'
import { CAMPOS_CONSULTA, type IdCampo } from '../expediente/formulario'
import {
  CAMPOS_PACIENTE,
  FORM_VACIO,
  type FormPaciente,
} from '../lib/formPaciente'

const PACIENTE = 'paciente.'
const CONSULTA = 'consulta.'

/**
 * Campos que se piden al modelo, derivados de los formularios de paciente y de
 * consulta: si cambian los formularios, cambia la lectura.
 */
export const CAMPOS_LECTURA: CampoLectura[] = [
  ...(Object.keys(CAMPOS_PACIENTE) as (keyof FormPaciente)[]).map((id) => {
    const c = CAMPOS_PACIENTE[id]
    return {
      id: PACIENTE + id,
      etiqueta: `Paciente: ${c.etiqueta}`,
      tipo: (c.fecha ? 'fecha' : 'texto') as TipoCampoLectura,
      ...(c.ayuda ? { ayuda: c.ayuda } : {}),
    }
  }),
  // La brigada se elige de la lista local; no se lee de la hoja.
  ...CAMPOS_CONSULTA.filter((c) => c.tipo !== 'brigada').map((c) => ({
    id: CONSULTA + c.id,
    etiqueta: `Consulta: ${c.etiqueta}${c.unidad ? ` (${c.unidad})` : ''}`,
    tipo: c.tipo as TipoCampoLectura,
    ...(c.patron && c.placeholder ? { ayuda: `como ${c.placeholder}` } : {}),
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
  // Lo ilegible nunca lleva valor, aunque viniera alguno.
  for (const id of lectura.ilegibles)
    if (id.startsWith(prefijo)) {
      const campo = id.slice(prefijo.length) as K
      marcas[campo] = 'ilegible'
      delete valores[campo]
    }
  return { valores, marcas }
}

/** Formulario de paciente con lo leído; lo demás vacío. */
export function pacienteDeLectura(lectura?: LecturaHoja): {
  form: FormPaciente
  marcas: Partial<Record<keyof FormPaciente, MarcaLectura>>
} {
  const { valores, marcas } = porPrefijo<keyof FormPaciente>(lectura, PACIENTE)
  return { form: { ...FORM_VACIO, ...valores }, marcas }
}

/** Valores leídos para el formulario de consulta (punto de partida, no definitivos). */
export function consultaDeLectura(lectura?: LecturaHoja): {
  valores: Partial<Record<IdCampo, string>>
  marcas: Partial<Record<IdCampo, MarcaLectura>>
} {
  return porPrefijo<IdCampo>(lectura, CONSULTA)
}

export const TEXTO_MARCA: Record<MarcaLectura, string> = {
  dudoso: 'Leído con duda: compáralo con la foto.',
  ilegible: 'Ilegible en la hoja: captúralo viendo la foto.',
}
