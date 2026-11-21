/**
 * Elige el lector de hojas según la configuración (`LECTOR_HOJAS`): OCR.space por
 * omisión, Gemini como alternativa. Cada uno solo pide su propia llave.
 */
import {
  ErrorLectura,
  leerHojaConGemini,
  MODELO_POR_DEFECTO,
  type CampoLectura,
  type ResultadoLectura,
} from './lecturaHoja.ts'
import { leerHojaConOcrSpace, MOTOR_POR_DEFECTO } from './ocrSpace.ts'

export const LECTORES = ['ocrspace', 'gemini'] as const
export type Lector = (typeof LECTORES)[number]
export const LECTOR_POR_DEFECTO: Lector = 'ocrspace'

/** Lee variables de entorno: `Deno.env.get` en la función, `process.env` en el script. */
export type Entorno = (nombre: string) => string | undefined

export function elegirLector(entorno: Entorno): Lector {
  const valor = (entorno('LECTOR_HOJAS') || LECTOR_POR_DEFECTO)
    .trim()
    .toLowerCase()
  if (!(LECTORES as readonly string[]).includes(valor))
    throw new ErrorLectura(
      'config',
      `LECTOR_HOJAS="${valor}" no es válido; usa ${LECTORES.join(' o ')}.`,
    )
  return valor as Lector
}

export interface PeticionLectura {
  campos: CampoLectura[]
  /** Títulos de sección impresos; solo los usa el lector de texto (OCR.space). */
  titulos?: string[]
  imagen: Uint8Array
  tipoImagen: string
  signal?: AbortSignal
  fetch?: typeof fetch
  alResponder?: (respuesta: unknown) => void
}

function llave(entorno: Entorno, nombre: string): string {
  const valor = entorno(nombre)?.trim()
  if (!valor)
    throw new ErrorLectura(
      'config',
      `Falta configurar ${nombre} en el servidor.`,
    )
  return valor
}

export async function leerHoja(
  entorno: Entorno,
  peticion: PeticionLectura,
  lector: Lector = elegirLector(entorno),
): Promise<ResultadoLectura> {
  if (lector === 'gemini') {
    const { alResponder: _, titulos: __, ...resto } = peticion
    return leerHojaConGemini({
      ...resto,
      apiKey: llave(entorno, 'GEMINI_API_KEY'),
      modelo: entorno('GEMINI_MODEL') || MODELO_POR_DEFECTO,
      url: entorno('GEMINI_API_URL') || undefined,
    })
  }
  return leerHojaConOcrSpace({
    ...peticion,
    apiKey: llave(entorno, 'OCR_SPACE_API_KEY'),
    motor: entorno('OCR_SPACE_ENGINE') || MOTOR_POR_DEFECTO,
    url: entorno('OCR_SPACE_URL') || undefined,
  })
}
