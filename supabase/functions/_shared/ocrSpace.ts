/**
 * Lector con OCR.space (https://ocr.space/ocrapi): manda la foto, revisa errores y
 * cuotas, y convierte el texto en campos con `analizarTextoHoja`. Sin dependencias
 * de Deno ni del navegador. La llave solo vive en el servidor o en un script.
 */
import {
  ErrorLectura,
  type CampoLectura,
  type ResultadoLectura,
} from './lecturaHoja.ts'
import { analizarTextoHoja } from './textoHoja.ts'

export const URL_OCR_SPACE = 'https://api.ocr.space/parse/image'
/** Engine 3 es el que lee letra manuscrita (cuota gratuita aparte: 1,000 al mes). */
export const MOTOR_POR_DEFECTO = '3'
/** Límite de archivo del plan gratuito (OCR.space lo reporta como 1024 KB). */
export const TAMANO_MAXIMO_OCR = 1024 * 1024
/** Reintentos dentro de una misma lectura ante 429 breves, 5xx o fallos de red. */
const INTENTOS = 3
/** Un 429 que pide esperar más que esto ya no es momentáneo: se agotó la cuota. */
const ESPERA_MAXIMA_CUOTA_S = 600

interface RespuestaOcrSpace {
  ParsedResults?: {
    ParsedText?: string
    FileParseExitCode?: number | string
    ErrorMessage?: string | string[]
  }[]
  OCRExitCode?: number | string
  IsErroredOnProcessing?: boolean
  ErrorMessage?: string | string[]
  ErrorDetails?: string | string[]
  error?: string
  retryAfter?: number
}

const texto = (v: unknown) =>
  (Array.isArray(v) ? v.join(' ') : typeof v === 'string' ? v : '').trim()

const horas = (s: number) =>
  s >= 5400
    ? `unas ${Math.round(s / 3600)} h`
    : `unos ${Math.max(1, Math.round(s / 60))} min`

/** Error ya clasificado de una respuesta; `esperaS` si conviene reintentar ya. */
export class FallaOcrSpace extends ErrorLectura {
  readonly esperaS?: number
  constructor(tipo: ErrorLectura['tipo'], mensaje: string, esperaS?: number) {
    super(tipo, mensaje)
    this.esperaS = esperaS
  }
}

/** Clasifica una respuesta HTTP de error de OCR.space (429, 403, 5xx…). */
export function errorHttpOcrSpace(
  status: number,
  cuerpo: string,
): FallaOcrSpace {
  let datos: RespuestaOcrSpace = {}
  try {
    datos = JSON.parse(cuerpo)
  } catch {
    /* algunas respuestas son texto plano */
  }
  const detalle = (texto(datos.error) || cuerpo).slice(0, 300)
  const codigo = /^E\d{3}/.exec(detalle)?.[0]
  if (status === 429) {
    if (codigo === 'E581' || codigo === 'E584')
      return new FallaOcrSpace(
        'config',
        'La llave de demostración de OCR.space se agotó; configura una llave propia (OCR_SPACE_API_KEY).',
      )
    if (codigo === 'E583')
      return new FallaOcrSpace(
        'config',
        'La llave de OCR.space es antigua y tiene límites reducidos; pide una nueva en https://ocr.space/ocrapi/freekey.',
      )
    const espera = Number(datos.retryAfter)
    if (Number.isFinite(espera) && espera > ESPERA_MAXIMA_CUOTA_S)
      return new FallaOcrSpace(
        'config',
        `Se agotó la cuota de OCR.space; se libera en ${horas(espera)}.`,
      )
    return new FallaOcrSpace(
      'red',
      'OCR.space está saturado; se reintentará en un momento.',
      Number.isFinite(espera) && espera > 0 ? espera : 2,
    )
  }
  if (status === 401 || status === 403)
    return new FallaOcrSpace(
      'config',
      codigo === 'E554'
        ? 'OCR.space rechazó la llave: demasiadas llaves desde la misma IP.'
        : /\d+ number of times/i.test(detalle)
          ? `Se agotó la cuota de OCR.space: ${detalle}`
          : `La llave de OCR.space no es válida (${detalle}).`,
    )
  if (status === 408 || status >= 500)
    return new FallaOcrSpace(
      'red',
      `OCR.space no respondió (${status}); se reintentará.`,
      2,
    )
  return new FallaOcrSpace(
    'peticion',
    `OCR.space rechazó la foto (${status}): ${detalle}`,
  )
}

/**
 * Revisa el cuerpo de una respuesta 200 (OCR.space puede marcar el error dentro) y
 * convierte el texto en campos.
 */
export function analizarRespuestaOcrSpace(
  respuesta: unknown,
  campos: CampoLectura[],
  modelo: string,
  titulos: string[] = [],
): ResultadoLectura {
  const r = respuesta as RespuestaOcrSpace
  if (!r || typeof r !== 'object')
    throw new ErrorLectura(
      'modelo',
      'OCR.space devolvió una respuesta sin formato.',
    )
  const pagina = r.ParsedResults?.[0]
  const salida = Number(r.OCRExitCode)
  if (
    r.IsErroredOnProcessing ||
    salida >= 3 ||
    Number(pagina?.FileParseExitCode) < 1
  ) {
    const mensaje =
      texto(r.ErrorMessage) ||
      texto(pagina?.ErrorMessage) ||
      texto(r.ErrorDetails)
    if (/size|tama/i.test(mensaje))
      throw new FallaOcrSpace(
        'peticion',
        'La foto pesa más de lo que acepta OCR.space (1 MB); vuelve a fotografiarla.',
      )
    if (
      Number(pagina?.FileParseExitCode) === -20 ||
      /time ?out|timed out/i.test(mensaje)
    )
      throw new FallaOcrSpace(
        'red',
        'OCR.space tardó demasiado; se reintentará.',
        2,
      )
    throw new FallaOcrSpace(
      'modelo',
      `OCR.space no pudo leer la foto${mensaje ? `: ${mensaje.slice(0, 200)}` : ''}.`,
    )
  }
  const textoHoja = (r.ParsedResults ?? [])
    .map((p) => p.ParsedText ?? '')
    .join('\n')
  if (!textoHoja.trim())
    throw new ErrorLectura(
      'modelo',
      'No se encontró texto en la foto; revisa que la hoja se vea completa y enfocada.',
    )
  const lectura = analizarTextoHoja(textoHoja, campos, modelo, titulos)
  if (
    lectura.dudosos.length === campos.length &&
    !Object.keys(lectura.valores).length
  )
    throw new ErrorLectura(
      'modelo',
      'No se reconoció ninguna etiqueta de la hoja; ¿es una hoja de consulta?',
    )
  return lectura
}

export interface OpcionesOcrSpace {
  apiKey: string
  campos: CampoLectura[]
  /** Títulos de sección impresos en la hoja (no son valores). */
  titulos?: string[]
  imagen: Uint8Array
  tipoImagen: string
  motor?: string
  url?: string
  fetch?: typeof fetch
  signal?: AbortSignal
  /** Para pruebas: cómo esperar entre reintentos. */
  esperar?: (ms: number, signal?: AbortSignal) => Promise<void>
  /** Para el script: recibe la respuesta cruda. */
  alResponder?: (respuesta: unknown) => void
}

const esperarPorDefecto = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolver, rechazar) => {
    const t = setTimeout(resolver, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      rechazar(signal.reason)
    })
  })

const EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/** Pide la lectura a OCR.space, con reintentos breves ante saturación o fallos de red. */
export async function leerHojaConOcrSpace({
  apiKey,
  campos,
  titulos = [],
  imagen,
  tipoImagen,
  motor = MOTOR_POR_DEFECTO,
  url = URL_OCR_SPACE,
  fetch: f = fetch,
  signal,
  esperar = esperarPorDefecto,
  alResponder,
}: OpcionesOcrSpace): Promise<ResultadoLectura> {
  if (imagen.byteLength > TAMANO_MAXIMO_OCR)
    throw new ErrorLectura(
      'peticion',
      `La foto pesa ${(imagen.byteLength / 1024 / 1024).toFixed(1)} MB y el lector acepta hasta 1 MB; vuelve a fotografiarla.`,
    )
  const modelo = `ocr.space (Engine ${motor})`
  let ultimo: FallaOcrSpace | undefined
  for (let intento = 1; intento <= INTENTOS; intento++) {
    if (ultimo)
      await esperar(Math.min(10, ultimo.esperaS ?? 2) * 1000 * intento, signal)
    const formulario = new FormData()
    formulario.append(
      'file',
      new Blob([new Uint8Array(imagen)], { type: tipoImagen }),
      `hoja.${EXTENSION[tipoImagen] ?? 'jpg'}`,
    )
    formulario.append('OCREngine', motor)
    formulario.append('scale', 'true')
    formulario.append('detectOrientation', 'true')
    let respuesta: Response
    try {
      respuesta = await f(url, {
        method: 'POST',
        headers: { apikey: apiKey },
        body: formulario,
        signal,
      })
    } catch (e) {
      if (signal?.aborted)
        throw new ErrorLectura(
          'red',
          'OCR.space tardó demasiado; se reintentará.',
        )
      ultimo = new FallaOcrSpace(
        'red',
        `No se pudo contactar a OCR.space: ${e instanceof Error ? e.message : String(e)}`,
        1,
      )
      continue
    }
    try {
      if (!respuesta.ok)
        throw errorHttpOcrSpace(
          respuesta.status,
          await respuesta.text().catch(() => ''),
        )
      let datos: unknown
      try {
        datos = await respuesta.json()
      } catch {
        throw new FallaOcrSpace(
          'red',
          'OCR.space devolvió una respuesta incompleta.',
          2,
        )
      }
      alResponder?.(datos)
      return analizarRespuestaOcrSpace(datos, campos, modelo, titulos)
    } catch (e) {
      if (
        e instanceof FallaOcrSpace &&
        e.esperaS !== undefined &&
        e.esperaS <= 10
      ) {
        ultimo = e
        continue
      }
      throw e
    }
  }
  throw new ErrorLectura('red', ultimo?.message ?? 'OCR.space no respondió.')
}
