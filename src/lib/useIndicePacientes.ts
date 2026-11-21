import { liveQuery } from 'dexie'
import { useSyncExternalStore } from 'react'
import { db } from '../db/schema'
import { crearIndice, type IndicePacientes } from './busqueda'

// Un solo índice en memoria para toda la app: se arma al abrir y se rehace cuando cambia
// la tabla de pacientes. Así volver a la búsqueda es inmediato.
let indice: IndicePacientes | undefined
let suscrito = false
const oyentes = new Set<() => void>()

function suscribir(oyente: () => void) {
  oyentes.add(oyente)
  if (!suscrito) {
    suscrito = true
    liveQuery(() => db.pacientes.toArray()).subscribe({
      next: (lista) => {
        indice = crearIndice(lista)
        oyentes.forEach((o) => o())
      },
      error: (e: unknown) => console.error('No se pudo leer pacientes', e),
    })
  }
  return () => oyentes.delete(oyente)
}

/** Índice de búsqueda de pacientes; undefined mientras se carga la primera vez. */
export function useIndicePacientes(): IndicePacientes | undefined {
  return useSyncExternalStore(suscribir, () => indice)
}
