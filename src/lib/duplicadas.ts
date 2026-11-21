import type { Paciente } from '../db/schema'
import { palabrasNombre, palabrasParecidas } from './fonetica'
import { normalizarTelefono } from './normalize'

export type MotivoDuplicada = 'celular' | 'nombre' | 'fechaNacimiento'

export const ETIQUETA_MOTIVO: Record<MotivoDuplicada, string> = {
  celular: 'Mismo celular',
  nombre: 'Nombre parecido',
  fechaNacimiento: 'Misma fecha de nacimiento',
}

export interface PosibleDuplicada {
  paciente: Paciente
  motivos: MotivoDuplicada[]
}

export type DatosComparables = Pick<
  Paciente,
  'nombres' | 'apellidoPaterno' | 'apellidoMaterno' | 'fechaNacimiento'
> & { telefonos: string[] }

interface Palabras {
  nombres: string[]
  paterno: string[]
  materno: string[]
}

const cache = new WeakMap<Paciente, Palabras>()

function palabras(p: DatosComparables): Palabras {
  return {
    nombres: palabrasNombre(p.nombres),
    paterno: palabrasNombre(p.apellidoPaterno),
    materno: palabrasNombre(p.apellidoMaterno ?? ''),
  }
}

function palabrasDe(p: Paciente): Palabras {
  let r = cache.get(p)
  if (!r) {
    r = palabras(p)
    cache.set(p, r)
  }
  return r
}

/** Cada palabra de la lista más corta se parece a alguna de la otra ("María" ⊂ "María José"). */
export function contenidas(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false
  const [corta, larga] = a.length <= b.length ? [a, b] : [b, a]
  return corta.every((x) => larga.some((y) => palabrasParecidas(x, y)))
}

const PESO: Record<MotivoDuplicada, number> = {
  celular: 4,
  nombre: 3,
  fechaNacimiento: 2,
}

/**
 * Expedientes que podrían ser de la misma persona que se va a registrar:
 * - mismo celular;
 * - nombre parecido (nombres y apellido paterno parecidos, y apellido materno parecido si
 *   ambas lo tienen);
 * - misma fecha de nacimiento con apellido paterno o nombres parecidos. Sola, la fecha no
 *   basta: con 40,000 expedientes varias personas comparten cumpleaños.
 */
export function buscarPosiblesDuplicadas(
  pacientes: Iterable<Paciente>,
  datos: DatosComparables,
  limite = 5,
): { duplicadas: PosibleDuplicada[]; total: number } {
  const nueva = palabras(datos)
  const telefonos = new Set(
    datos.telefonos.map(normalizarTelefono).filter((t) => t.length === 10),
  )
  const encontradas: (PosibleDuplicada & { peso: number })[] = []

  for (const p of pacientes) {
    const motivos: MotivoDuplicada[] = []
    if (p.telefonos.some((t) => telefonos.has(t))) motivos.push('celular')

    const actual = palabrasDe(p)
    const paterno = contenidas(nueva.paterno, actual.paterno)
    const nombres = contenidas(nueva.nombres, actual.nombres)
    const materno =
      nueva.materno.length === 0 ||
      actual.materno.length === 0 ||
      contenidas(nueva.materno, actual.materno)
    if (paterno && nombres && materno) motivos.push('nombre')

    const mismaFecha =
      !!datos.fechaNacimiento && datos.fechaNacimiento === p.fechaNacimiento
    if (mismaFecha && (motivos.length > 0 || paterno || nombres)) {
      motivos.push('fechaNacimiento')
    }

    if (motivos.length > 0) {
      const peso = motivos.reduce((s, m) => s + PESO[m], 0)
      encontradas.push({ paciente: p, motivos, peso })
    }
  }

  encontradas.sort(
    (a, b) =>
      b.peso - a.peso ||
      a.paciente.nombreBusqueda.localeCompare(b.paciente.nombreBusqueda),
  )
  return {
    duplicadas: encontradas
      .slice(0, limite)
      .map(({ paciente, motivos }) => ({ paciente, motivos })),
    total: encontradas.length,
  }
}
