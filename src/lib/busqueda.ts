import MiniSearch, { type Query } from 'minisearch'
import type { Paciente } from '../db/schema'
import { claveFonetica, erroresTolerados, palabrasNombre } from './fonetica'
import { normalizarTelefono, normalizarTexto } from './normalize'

export interface ResultadoBusqueda {
  pacientes: Paciente[]
  total: number
}

export interface IndicePacientes {
  /** Por nombre (tolerante a acentos, orden y errores), por celular, o ambos. */
  buscar(consulta: string, limite?: number): ResultadoBusqueda
  pacientes: ReadonlyMap<string, Paciente>
  /** Comunidades registradas, para sugerir al capturar. */
  comunidades: string[]
}

/** Desde cuántos dígitos se interpreta un número como celular. */
export const MIN_DIGITOS_CELULAR = 3

const sinResultados: ResultadoBusqueda = { pacientes: [], total: 0 }

export function separarConsulta(consulta: string) {
  const texto = normalizarTexto(consulta)
  const digitos = texto
    .split(' ')
    .filter((t) => /^\d+$/.test(t))
    .join('')
  const palabras = palabrasNombre(texto.replace(/\d+/g, ' '))
  return { palabras, digitos }
}

function porNombre(a: Paciente, b: Paciente) {
  return a.nombreBusqueda.localeCompare(b.nombreBusqueda)
}

export function crearIndice(lista: readonly Paciente[]): IndicePacientes {
  const pacientes = new Map(lista.map((p) => [p.id, p]))
  const minisearch = new MiniSearch<{ id: string; nombre: string }>({
    fields: ['nombre', 'fonetico'],
    extractField: (doc, campo) =>
      campo === 'fonetico' ? doc.nombre : doc[campo as 'id' | 'nombre'],
    tokenize: (texto) => palabrasNombre(texto),
    processTerm: (termino, campo) =>
      campo === 'fonetico' ? claveFonetica(termino) : termino,
  })
  minisearch.addAll(lista.map((p) => ({ id: p.id, nombre: p.nombreBusqueda })))

  function buscarPorNombre(palabras: string[]): string[] {
    const consulta: Query = {
      combineWith: 'AND',
      queries: palabras.map((palabra) => ({
        combineWith: 'OR',
        queries: [
          {
            queries: [palabra],
            fields: ['nombre'],
            prefix: true,
            fuzzy: (t: string) => erroresTolerados(t) || false,
            boost: { nombre: 2 },
            processTerm: (t: string) => t,
          },
          {
            queries: [palabra],
            fields: ['fonetico'],
            prefix: true,
            fuzzy: (clave: string) => erroresTolerados(clave) || false,
            processTerm: claveFonetica,
          },
        ],
      })),
    }
    return minisearch.search(consulta).map((r) => r.id as string)
  }

  function buscar(consulta: string, limite = 50): ResultadoBusqueda {
    const { palabras, digitos } = separarConsulta(consulta)
    const celular =
      digitos.length >= MIN_DIGITOS_CELULAR ? normalizarTelefono(digitos) : ''
    if (palabras.length === 0 && !celular) return sinResultados

    const coincideCelular = (p: Paciente) =>
      p.telefonos.some((t) => t.endsWith(celular))
    let encontradas: Paciente[]
    if (palabras.length > 0) {
      encontradas = buscarPorNombre(palabras).map((id) => pacientes.get(id)!)
      if (celular) encontradas = encontradas.filter(coincideCelular)
    } else {
      encontradas = [...pacientes.values()]
        .filter(coincideCelular)
        .sort(porNombre)
    }
    return {
      pacientes: encontradas.slice(0, limite),
      total: encontradas.length,
    }
  }

  const comunidades = [
    ...new Set(lista.map((p) => p.comunidad?.trim()).filter(Boolean)),
  ].sort((a, b) => a!.localeCompare(b!, 'es')) as string[]

  return { buscar, pacientes, comunidades }
}
