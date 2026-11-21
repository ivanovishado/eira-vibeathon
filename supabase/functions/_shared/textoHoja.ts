/**
 * De texto plano (lo que devuelve un OCR) a campos: ubica cada valor por la etiqueta
 * impresa en la hoja (`CampoLectura.enHoja`), tolerando acentos, mayúsculas,
 * puntuación, unidades entre paréntesis, abreviaturas ("Frec." por "Frecuencia") y
 * errores de una o dos letras. Sin dependencias de Deno ni del navegador.
 */
import {
  normalizarFecha,
  normalizarNumero,
  type CampoLectura,
  type ResultadoLectura,
} from './lecturaHoja.ts'

const VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'o', 'y', 'e'])
/** Unidades que a veces se imprimen sin paréntesis ("Peso kg"). */
const UNIDADES = new Set(['kg', 'cm', 'lpm', 'c', 'mmhg'])

/** Palabras significativas de una etiqueta, sin acentos, unidades ni puntuación. */
export function palabrasEtiqueta(texto: string): string[] {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((p) => p && !VACIAS.has(p))
    .filter(
      (p, i, todas) => i === 0 || !UNIDADES.has(p) || i < todas.length - 1,
    )
}

function distancia(a: string, b: string): number {
  let previa = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const fila = [i]
    for (let j = 1; j <= b.length; j++)
      fila[j] = Math.min(
        previa[j] + 1,
        fila[j - 1] + 1,
        previa[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    previa = fila
  }
  return previa[b.length]
}

/** `leida` (de la foto) equivale a `impresa` (de la definición del campo). */
function mismaPalabra(leida: string, impresa: string): boolean {
  if (leida === impresa) return true
  // Abreviatura: "frec" por "frecuencia".
  if (leida.length >= 3 && impresa.startsWith(leida)) return true
  const corta = Math.min(leida.length, impresa.length)
  if (corta < 5) return false
  return distancia(leida, impresa) <= (corta >= 9 ? 2 : 1)
}

const coincide = (leidas: string[], impresas: string[]) =>
  leidas.length === impresas.length &&
  leidas.every((p, i) => mismaPalabra(p, impresas[i]))

interface Etiqueta {
  campo: number
  palabras: string[]
}

export function etiquetasDe(campos: CampoLectura[]): Etiqueta[] {
  return campos.flatMap((c, campo) =>
    (c.enHoja?.length
      ? c.enHoja
      : // Clientes anteriores mandan "Paciente: Nombre(s)".
        [c.etiqueta.replace(/^[^:]*:\s*/, '')]
    )
      .map((e) => ({ campo, palabras: palabrasEtiqueta(e) }))
      .filter((e) => e.palabras.length > 0),
  )
}

/** Campo cuya etiqueta es exactamente `texto` (la de más palabras si hay varias). */
function campoDeEtiqueta(texto: string, etiquetas: Etiqueta[]) {
  const leidas = palabrasEtiqueta(texto)
  if (!leidas.length) return undefined
  return etiquetas.find((e) => coincide(leidas, e.palabras))?.campo
}

/**
 * Si la línea es una etiqueta, el campo y lo que venga después en la misma línea
 * ("Celular: 951…", "Peso (kg) 68.5").
 */
function separarEtiqueta(
  linea: string,
  etiquetas: Etiqueta[],
): { campo: number; resto: string } | undefined {
  const dosPuntos = linea.indexOf(':')
  if (dosPuntos > 0) {
    const campo = campoDeEtiqueta(linea.slice(0, dosPuntos), etiquetas)
    if (campo !== undefined)
      return { campo, resto: linea.slice(dosPuntos + 1).trim() }
  }
  const campo = campoDeEtiqueta(linea, etiquetas)
  if (campo !== undefined) return { campo, resto: '' }
  // Etiqueta seguida de un número o fecha en la misma línea.
  const m = /^(.*?[^\d\s])\s+(-?\d[\d\s/.,-]*.*)$/.exec(linea)
  if (m) {
    const campo = campoDeEtiqueta(m[1], etiquetas)
    if (campo !== undefined) return { campo, resto: m[2].trim() }
  }
  return undefined
}

/** Quita el marcado que agrega el OCR (títulos `#`, negritas, viñetas). */
function limpiarLinea(linea: string): { texto: string; titulo: boolean } {
  const titulo = /^\s*#/.test(linea)
  const texto = linea
    .replace(/^\s*#+\s*/, '')
    .replace(/\*\*|__/g, '')
    .replace(/^\s*[-•]\s+/, '')
    .trim()
  return { texto, titulo }
}

const celdas = (linea: string) =>
  linea
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => limpiarLinea(c).texto)

const esSeparadorTabla = (linea: string) => /^\s*\|?[\s:|-]+\|?\s*$/.test(linea)

/**
 * Convierte tablas Markdown (el Engine 3 de OCR.space las devuelve así) en pares
 * etiqueta / valor: una fila de etiquetas seguida de una fila de valores, o filas
 * "etiqueta | valor".
 */
function aplanarTablas(lineas: string[], etiquetas: Etiqueta[]): string[] {
  const salida: string[] = []
  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i]
    if (!linea.trim().startsWith('|')) {
      salida.push(linea)
      continue
    }
    if (esSeparadorTabla(linea)) continue
    const fila = celdas(linea)
    const sonEtiquetas = fila.map(
      (c) => campoDeEtiqueta(c, etiquetas) !== undefined,
    )
    if (sonEtiquetas.every(Boolean) && fila.length > 1) {
      let j = i + 1
      while (j < lineas.length && esSeparadorTabla(lineas[j])) j++
      const valores =
        j < lineas.length && lineas[j].trim().startsWith('|')
          ? celdas(lineas[j])
          : []
      const sonValores = !valores.some(
        (c) => campoDeEtiqueta(c, etiquetas) !== undefined,
      )
      fila.forEach((c, k) =>
        salida.push(c, sonValores ? (valores[k] ?? '') : '', ''),
      )
      if (sonValores && valores.length) i = j
    } else if (sonEtiquetas[0]) {
      salida.push(fila[0], fila.slice(1).join(' ').trim(), '')
    } else salida.push(fila.join(' '))
  }
  return salida
}

/** Valores en texto por campo, como aparecen en la hoja; `encontrados` = etiquetas vistas. */
export function ubicarValores(
  texto: string,
  campos: CampoLectura[],
): { valores: Map<number, string>; encontrados: Set<number> } {
  const etiquetas = etiquetasDe(campos)
  const lineas = aplanarTablas(texto.replace(/\r/g, '').split('\n'), etiquetas)
  const valores = new Map<number, string>()
  const encontrados = new Set<number>()
  let actual: { campo: number; partes: string[] } | undefined

  const cerrar = () => {
    if (!actual) return
    const { campo, partes } = actual
    const unaLinea =
      campos[campo].tipo === 'fecha' || campos[campo].tipo === 'numero'
    const valor = (unaLinea ? partes.slice(0, 1) : partes)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (valor && !valores.has(campo)) valores.set(campo, valor)
    actual = undefined
  }

  for (const cruda of lineas) {
    const { texto: linea, titulo } = limpiarLinea(cruda)
    if (!linea) {
      // Una línea en blanco cierra el valor (así no se cuelan los títulos de sección).
      if (actual?.partes.length) cerrar()
      continue
    }
    const etiqueta = separarEtiqueta(linea, etiquetas)
    if (etiqueta) {
      cerrar()
      encontrados.add(etiqueta.campo)
      actual = {
        campo: etiqueta.campo,
        partes: etiqueta.resto ? [etiqueta.resto] : [],
      }
      continue
    }
    if (titulo) {
      cerrar()
      continue
    }
    actual?.partes.push(linea)
  }
  cerrar()
  return { valores, encontrados }
}

/**
 * Lectura a partir del texto del OCR. Sin ayuda de un modelo, se marca dudoso:
 * - el campo cuya etiqueta no aparece en el texto o que no trae valor;
 * - la fecha con año de dos dígitos o el número con letras corregidas (O→0);
 * - la fecha o el número imposibles (quedan vacíos, como con Gemini).
 * La validación propia de cada formulario (CURP, celular, rangos) la aplica la app.
 */
export function analizarTextoHoja(
  texto: string,
  campos: CampoLectura[],
  modelo: string,
): ResultadoLectura {
  const { valores: crudos, encontrados } = ubicarValores(texto, campos)
  const valores: Record<string, string> = {}
  const dudosos: string[] = []
  campos.forEach((c, i) => {
    if (!encontrados.has(i)) {
      dudosos.push(c.id)
      return
    }
    let valor = crudos.get(i)
    // Sin modelo no se distingue un espacio en blanco de un garabato que el OCR omitió.
    if (!valor) return void dudosos.push(c.id)
    if (c.tipo === 'fecha') {
      const f = normalizarFecha(valor)
      if (!f) return void dudosos.push(c.id)
      valor = f.fecha
      if (f.sigloSupuesto) dudosos.push(c.id)
    } else if (c.tipo === 'numero') {
      const n = normalizarNumero(valor)
      if (!n) return void dudosos.push(c.id)
      valor = n.numero
      if (n.corregido) dudosos.push(c.id)
    }
    valores[c.id] = valor
  })
  return { valores, dudosos, ilegibles: [], modelo }
}
