import { normalizarTexto } from './normalize'

/** Partículas que no distinguen a una persona: "María del Carmen", "de la Cruz". */
const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y'])

/** Palabras normalizadas de un nombre, sin partículas. */
export function palabrasNombre(texto: string): string[] {
  return normalizarTexto(texto)
    .split(' ')
    .filter((p) => p && !PARTICULAS.has(p))
}

/**
 * Clave fonética para el español de México: dos palabras que suenan igual dan la misma
 * clave, aunque se escriban distinto ("Hernández" y "Ernandes", "González" y
 * "Gonzales", "Núñez" y "Nunes", "Yolanda" e "Iolanda"). Recibe texto ya normalizado.
 */
export function claveFonetica(palabra: string): string {
  let clave = cache.get(palabra)
  if (clave === undefined) {
    clave = calcularClave(palabra)
    cache.set(palabra, clave)
  }
  return clave
}

/** El vocabulario de nombres es chico; memorizar evita recalcular en cada búsqueda. */
const cache = new Map<string, string>()

function calcularClave(palabra: string): string {
  return (
    palabra
      .replace(/gu([ei])/g, 'G$1')
      .replace(/g([ei])/g, 'j$1')
      .replace(/G/g, 'g')
      .replace(/ch/g, 'C')
      .replace(/qu/g, 'k')
      .replace(/c([ei])/g, 's$1')
      .replace(/[cq]/g, 'k')
      .replace(/z/g, 's')
      .replace(/ll/g, 'y')
      .replace(/y/g, 'i')
      .replace(/v/g, 'b')
      .replace(/w/g, 'u')
      .replace(/h/g, '')
      .replace(/nb/g, 'mb')
      // Letras dobles: "Barragán" y "Baragan".
      .replace(/(.)\1+/g, '$1')
  )
}

/** Distancia de edición (Levenshtein) entre dos palabras cortas. */
export function distancia(a: string, b: string): number {
  if (a === b) return 0
  let previa = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const actual = [i]
    for (let j = 1; j <= b.length; j++) {
      actual[j] = Math.min(
        previa[j] + 1,
        actual[j - 1] + 1,
        previa[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    previa = actual
  }
  return previa[b.length]
}

/** Errores de dedo que se toleran según el largo (una letra cambiada de lugar cuenta 2). */
export function erroresTolerados(palabra: string): number {
  if (palabra.length < 4) return 0
  return palabra.length < 7 ? 1 : 2
}

/** Dos palabras normalizadas que probablemente son el mismo nombre o apellido. */
export function palabrasParecidas(a: string, b: string): boolean {
  if (a === b) return true
  if (claveFonetica(a) === claveFonetica(b)) return true
  const tolerancia = erroresTolerados(a.length < b.length ? a : b)
  return (
    tolerancia > 0 &&
    Math.abs(a.length - b.length) <= tolerancia &&
    distancia(a, b) <= tolerancia
  )
}
