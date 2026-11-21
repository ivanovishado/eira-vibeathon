/**
 * Tipos comunes de la lectura de hojas y el lector con Gemini (prompt, esquema de
 * salida y análisis de la respuesta). Sin dependencias de Deno ni del navegador: lo
 * usan la Edge Function `leer-hoja`, el script `npm run leer-hoja` y la app.
 * El lector por omisión es OCR.space (`ocrSpace.ts`); ver `lectores.ts`.
 */

export const MODELO_POR_DEFECTO = 'gemini-2.5-flash'
/** Tiempo máximo que la Edge Function dedica a leer una hoja (con reintentos). */
export const LIMITE_LECTOR_MS = 90_000
export const URL_GEMINI = 'https://generativelanguage.googleapis.com/v1beta'

export type TipoCampoLectura = 'texto' | 'parrafo' | 'numero' | 'fecha'

/** Campo que se pide leer. La app los deriva de sus formularios (`CAMPOS_LECTURA`). */
export interface CampoLectura {
  /** `paciente.nombres`, `consulta.signosVitales.pesoKg`… */
  id: string
  etiqueta: string
  tipo: TipoCampoLectura
  /** Pista de formato para el modelo ("10 dígitos", "120/80"). */
  ayuda?: string
  /**
   * Cómo aparece la etiqueta impresa en la hoja (la primera es la principal). El
   * lector OCR ubica cada valor por estas etiquetas; si faltan, usa `etiqueta`.
   */
  enHoja?: string[]
}

export interface ResultadoLectura {
  valores: Record<string, string>
  dudosos: string[]
  ilegibles: string[]
  modelo: string
}

/**
 * - `peticion`: la petición no es válida.
 * - `modelo`: el modelo no devolvió una lectura utilizable (bloqueo, JSON inválido).
 * - `red`: el servicio no respondió o está saturado; conviene reintentar.
 * - `config`: falta la llave, es inválida o se agotó la cuota; lo arregla quien
 *   administra el servidor, no reintentar.
 */
export type TipoErrorLectura = 'peticion' | 'modelo' | 'red' | 'config'

export class ErrorLectura extends Error {
  readonly tipo: TipoErrorLectura
  constructor(tipo: TipoErrorLectura, mensaje: string) {
    super(mensaje)
    this.name = 'ErrorLectura'
    this.tipo = tipo
  }
}

const ESTADOS = ['claro', 'dudoso', 'ilegible', 'vacio'] as const
type EstadoCampo = (typeof ESTADOS)[number]
const TIPOS: TipoCampoLectura[] = ['texto', 'parrafo', 'numero', 'fecha']
const MAX_CAMPOS = 80
const ID_VALIDO = /^[a-zA-Z][\w.]{0,79}$/

/** Valida la lista de campos que manda el cliente. */
export function validarCampos(entrada: unknown): CampoLectura[] {
  if (!Array.isArray(entrada) || entrada.length === 0)
    throw new ErrorLectura('peticion', 'Falta la lista de campos.')
  if (entrada.length > MAX_CAMPOS)
    throw new ErrorLectura('peticion', 'Demasiados campos.')
  const vistos = new Set<string>()
  return entrada.map((c) => {
    const campo = c as Partial<CampoLectura>
    if (
      typeof campo?.id !== 'string' ||
      !ID_VALIDO.test(campo.id) ||
      vistos.has(campo.id) ||
      typeof campo.etiqueta !== 'string' ||
      !campo.etiqueta.trim() ||
      campo.etiqueta.length > 100 ||
      !TIPOS.includes(campo.tipo as TipoCampoLectura) ||
      (campo.ayuda !== undefined &&
        (typeof campo.ayuda !== 'string' || campo.ayuda.length > 200)) ||
      (campo.enHoja !== undefined &&
        (!Array.isArray(campo.enHoja) ||
          campo.enHoja.length > 5 ||
          campo.enHoja.some(
            (e) => typeof e !== 'string' || !e.trim() || e.length > 100,
          )))
    )
      throw new ErrorLectura('peticion', 'Campo de lectura no válido.')
    vistos.add(campo.id)
    return {
      id: campo.id,
      etiqueta: campo.etiqueta.trim(),
      tipo: campo.tipo as TipoCampoLectura,
      ...(campo.ayuda ? { ayuda: campo.ayuda } : {}),
      ...(campo.enHoja?.length
        ? { enHoja: campo.enHoja.map((e) => e.trim()) }
        : {}),
    }
  })
}

/** Gemini no acepta puntos en los nombres de propiedad. */
const llave = (id: string) => id.replaceAll('.', '__')

const FORMATO: Record<TipoCampoLectura, string> = {
  texto: 'texto',
  parrafo: 'texto, puede ser largo',
  numero: 'número con punto decimal, sin unidades',
  fecha: 'fecha AAAA-MM-DD',
}

export function construirPrompt(campos: CampoLectura[]): string {
  const lista = campos
    .map(
      (c) =>
        `- ${llave(c.id)}: ${c.etiqueta} (${FORMATO[c.tipo]}${c.ayuda ? `; ${c.ayuda}` : ''})`,
    )
    .join('\n')
  return `La imagen es una hoja de consulta médica en papel de una brigada de salud en México, llenada a mano en español.

Transcribe lo que está escrito en cada campo de la lista. Reglas:
- Copia solo lo que se ve escrito. No completes, no corrijas datos clínicos y no adivines.
- estado "claro": se lee con seguridad.
- estado "dudoso": hay algo escrito pero no estás seguro de alguna letra o número; pon tu mejor lectura.
- estado "ilegible": hay algo escrito pero no se puede leer; valor null.
- estado "vacio": el campo no aparece o está en blanco; valor null.
- Fechas en formato AAAA-MM-DD. Si la hoja trae día/mes/año, conviértela (los años de dos dígitos son dudosos).
- Números con punto decimal y sin unidades. Presión arterial como sistólica/diastólica (por ejemplo 120/80).
- Teléfonos solo con dígitos. CURP en mayúsculas.
- Nombres y apellidos con mayúscula inicial.

Campos:
${lista}`
}

/** Esquema de salida estructurada (subconjunto OpenAPI de Gemini). */
export function construirEsquema(campos: CampoLectura[]) {
  const propiedades: Record<string, unknown> = {}
  for (const c of campos)
    propiedades[llave(c.id)] = {
      type: 'OBJECT',
      description: c.etiqueta,
      properties: {
        valor: { type: 'STRING', nullable: true },
        estado: { type: 'STRING', enum: [...ESTADOS] },
      },
      required: ['valor', 'estado'],
      propertyOrdering: ['valor', 'estado'],
    }
  const orden = campos.map((c) => llave(c.id))
  return {
    type: 'OBJECT',
    properties: propiedades,
    required: orden,
    propertyOrdering: orden,
  }
}

export function construirPeticion(
  campos: CampoLectura[],
  imagenBase64: string,
  tipoImagen: string,
) {
  return {
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: tipoImagen, data: imagenBase64 } },
          { text: construirPrompt(campos) },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: construirEsquema(campos),
    },
  }
}

const dos = (n: number) => String(n).padStart(2, '0')

/**
 * AAAA-MM-DD válida, o la conversión de D/M/AAAA (también D/M/AA: el siglo se supone
 * y se avisa con `sigloSupuesto`); undefined si no es una fecha posible.
 */
export function normalizarFecha(
  texto: string,
  hoy = new Date(),
): { fecha: string; convertida: boolean; sigloSupuesto?: true } | undefined {
  const valida = (a: number, m: number, d: number) => {
    const f = new Date(Date.UTC(a, m - 1, d))
    return (
      f.getUTCFullYear() === a &&
      f.getUTCMonth() === m - 1 &&
      f.getUTCDate() === d
    )
  }
  const limpio = texto.trim().replace(/\s*([/.-])\s*/g, '$1')
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(limpio)
  if (m) {
    const [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
    return valida(a, mes, d)
      ? { fecha: `${a}-${dos(mes)}-${dos(d)}`, convertida: false }
      : undefined
  }
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})$/.exec(limpio)
  if (m) {
    const [d, mes] = [Number(m[1]), Number(m[2])]
    let a = Number(m[3])
    const corto = m[3].length === 2
    if (corto) {
      const siglo = Math.floor(hoy.getFullYear() / 100) * 100
      a += a > hoy.getFullYear() - siglo ? siglo - 100 : siglo
    }
    if (!valida(a, mes, d)) return undefined
    return {
      fecha: `${a}-${dos(mes)}-${dos(d)}`,
      convertida: true,
      ...(corto ? { sigloSupuesto: true as const } : {}),
    }
  }
  return undefined
}

/**
 * Número con coma o punto decimal, sin unidades. Corrige las confusiones típicas del
 * OCR (O→0, l/I→1) y lo avisa con `corregido`; undefined si no es un número.
 */
export function normalizarNumero(
  texto: string,
): { numero: string; corregido: boolean } | undefined {
  let t = texto.trim().replace(/\s*(kg|cm|lpm|°\s*c|ºc|c)\.?$/i, '')
  const original = t
  t = t.replace(/[oO]/g, '0').replace(/[lI|]/g, '1')
  t = t.replace(/\s+/g, '').replace(',', '.')
  if (!/^-?\d+(\.\d+)?$/.test(t)) return undefined
  return {
    numero: String(Number(t)),
    corregido: t !== original.replace(/\s+/g, '').replace(',', '.'),
  }
}

/** Títulos de sección que manda el cliente: lista corta de textos cortos. */
export function validarTitulos(titulos: unknown): string[] {
  if (titulos === undefined) return []
  if (
    !Array.isArray(titulos) ||
    titulos.length > 20 ||
    titulos.some((t) => typeof t !== 'string' || t.length > 100)
  )
    throw new ErrorLectura('peticion', 'Títulos de la hoja no válidos.')
  return titulos.map((t: string) => t.trim()).filter(Boolean)
}

/**
 * Convierte el JSON del modelo en valores por campo. Lo ilegible o vacío queda sin
 * valor; lo que no tiene el formato esperado se descarta y se marca dudoso.
 */
export function analizarLectura(
  datos: unknown,
  campos: CampoLectura[],
  modelo: string,
): ResultadoLectura {
  if (!datos || typeof datos !== 'object')
    throw new ErrorLectura('modelo', 'La lectura no tiene el formato esperado.')
  const objeto = datos as Record<string, unknown>
  const valores: Record<string, string> = {}
  const dudosos: string[] = []
  const ilegibles: string[] = []
  for (const c of campos) {
    const crudo = objeto[llave(c.id)] as
      { valor?: unknown; estado?: unknown } | undefined
    const estado: EstadoCampo = ESTADOS.includes(crudo?.estado as EstadoCampo)
      ? (crudo!.estado as EstadoCampo)
      : 'vacio'
    if (estado === 'ilegible') {
      ilegibles.push(c.id)
      continue
    }
    let valor =
      typeof crudo?.valor === 'string' || typeof crudo?.valor === 'number'
        ? String(crudo.valor).trim()
        : ''
    if (!valor || estado === 'vacio') continue
    let dudoso = estado === 'dudoso'
    if (c.tipo === 'fecha') {
      const f = normalizarFecha(valor)
      if (!f) {
        dudosos.push(c.id)
        continue
      }
      valor = f.fecha
      if (f.sigloSupuesto) dudoso = true
    } else if (c.tipo === 'numero') {
      const n = normalizarNumero(valor)
      if (!n) {
        dudosos.push(c.id)
        continue
      }
      valor = n.numero
      if (n.corregido) dudoso = true
    }
    valores[c.id] = valor
    if (dudoso) dudosos.push(c.id)
  }
  return { valores, dudosos, ilegibles, modelo }
}

/** Extrae y analiza el texto JSON de una respuesta de `generateContent`. */
export function analizarRespuestaGemini(
  respuesta: unknown,
  campos: CampoLectura[],
  modelo: string,
): ResultadoLectura {
  const r = respuesta as {
    promptFeedback?: { blockReason?: string }
    candidates?: {
      finishReason?: string
      content?: { parts?: { text?: string; thought?: boolean }[] }
    }[]
  }
  if (r?.promptFeedback?.blockReason)
    throw new ErrorLectura(
      'modelo',
      `El modelo rechazó la imagen (${r.promptFeedback.blockReason}).`,
    )
  const candidato = r?.candidates?.[0]
  const texto = (candidato?.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text)
    .join('')
  if (!texto)
    throw new ErrorLectura(
      'modelo',
      `El modelo no devolvió lectura${candidato?.finishReason ? ` (${candidato.finishReason})` : ''}.`,
    )
  let datos: unknown
  try {
    datos = JSON.parse(texto)
  } catch {
    throw new ErrorLectura('modelo', 'La lectura no es JSON válido.')
  }
  return analizarLectura(datos, campos, modelo)
}

/** Base64 sin depender de Buffer (Node) ni de FileReader (navegador). */
export function aBase64(bytes: Uint8Array): string {
  let binario = ''
  for (let i = 0; i < bytes.length; i += 0x8000)
    binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binario)
}

export interface OpcionesGemini {
  apiKey: string
  campos: CampoLectura[]
  imagen: Uint8Array
  tipoImagen: string
  modelo?: string
  url?: string
  fetch?: typeof fetch
  signal?: AbortSignal
}

/** Pide la lectura a Gemini. Necesita la llave: solo se llama desde el servidor o un script. */
export async function leerHojaConGemini({
  apiKey,
  campos,
  imagen,
  tipoImagen,
  modelo = MODELO_POR_DEFECTO,
  url = URL_GEMINI,
  fetch: f = fetch,
  signal,
}: OpcionesGemini): Promise<ResultadoLectura> {
  let respuesta: Response
  try {
    respuesta = await f(
      `${url}/models/${encodeURIComponent(modelo)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(
          construirPeticion(campos, aBase64(imagen), tipoImagen),
        ),
        signal,
      },
    )
  } catch (e) {
    throw new ErrorLectura(
      'red',
      `No se pudo contactar al modelo: ${e instanceof Error ? e.message : String(e)}`,
    )
  }
  if (!respuesta.ok) {
    const detalle = (await respuesta.text().catch(() => '')).slice(0, 300)
    throw new ErrorLectura(
      respuesta.status === 429 || respuesta.status >= 500 ? 'red' : 'modelo',
      `Gemini respondió ${respuesta.status}${detalle ? `: ${detalle}` : ''}`,
    )
  }
  return analizarRespuestaGemini(await respuesta.json(), campos, modelo)
}
