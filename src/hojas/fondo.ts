import { useSyncExternalStore } from 'react'
import { sincronizacionConfigurada } from '../cuenta/config'
import { leerCuenta, suscribirCuenta } from '../cuenta/cuenta'
import { db } from '../db/schema'
import {
  crearProgramador,
  type EstadoSincronizacion,
  type Programador,
} from '../sync/programador'
import { leerHojasPendientes } from './lectura'
import { crearServicioSupabase, type ServicioHojas } from './servicio'
import { crearServicioSimulado } from './servicioSimulado'

/** Solo sin Supabase: la demo lee con el lector simulado. */
export const lectorSimulado =
  !sincronizacionConfigurada && import.meta.env.VITE_LECTOR_SIMULADO === 'true'

let servicio: ServicioHojas | undefined
export function obtenerServicio(): ServicioHojas | undefined {
  if (!servicio && sincronizacionConfigurada) servicio = crearServicioSupabase()
  if (!servicio && lectorSimulado)
    servicio = crearServicioSimulado({ esperaMs: 1500 })
  return servicio
}

/** Hay red y sesión (o lector simulado): lo capturado se lee de inmediato. */
export const puedeLeer = () =>
  navigator.onLine && (lectorSimulado || Boolean(leerCuenta()))

let programador: Programador | undefined

function conCandado<T>(tarea: () => Promise<T>): Promise<T> {
  const locks = navigator.locks
  return locks ? locks.request('eira-lectura-hojas', tarea) : tarea()
}

/**
 * Lee en segundo plano las hojas capturadas: al abrir, al capturar, al volver la red
 * o la sesión, y con reintentos con espera. Sin servidor no hace nada.
 */
export function iniciarLecturaHojas(): Programador | undefined {
  const s = obtenerServicio()
  if (!s || programador) return programador
  const p = crearProgramador({
    puede: puedeLeer,
    sincronizar: () => conCandado(() => leerHojasPendientes(s)),
    agruparMs: 500,
    periodoMs: 2 * 60_000,
  })
  programador = p
  db.hojas.hook('creating', () => {
    p.pronto()
  })
  window.addEventListener('online', () => void p.ahora())
  window.addEventListener('offline', () => p.detener())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void p.ahora()
  })
  suscribirCuenta(() => {
    if (leerCuenta()) void p.ahora()
  })
  void p.ahora()
  return p
}

export const leerHojasAhora = () => programador?.ahora()

const SIN_ESTADO: EstadoSincronizacion = { sincronizando: false }
export function useLecturaHojas(): EstadoSincronizacion {
  return useSyncExternalStore(
    (o) => programador?.suscribir(o) ?? (() => undefined),
    () => (programador ? programador.obtenerEstado() : SIN_ESTADO),
  )
}

/** Por qué las hojas se quedan sin enviar, para explicarlo en pantalla. */
export function motivoSinLectura({
  configurado,
  simulado,
  enLinea,
  conCuenta,
  error,
}: {
  configurado: boolean
  simulado: boolean
  enLinea: boolean
  conCuenta: boolean
  error?: EstadoSincronizacion['error']
}): string | undefined {
  if (!configurado && !simulado)
    return 'Este dispositivo funciona solo con sus datos: no hay servidor para leer las hojas. Puedes pasarlas a mano desde la bandeja.'
  if (!enLinea)
    return 'Sin conexión: las hojas se guardan aquí y se mandan a leer al volver la red.'
  if (!simulado && !conCuenta)
    return 'Inicia sesión en Cuenta para que las hojas se manden a leer.'
  if (error?.tipo === 'sesion')
    return 'La sesión venció; vuelve a iniciar sesión en Cuenta para leer las hojas.'
  if (error?.tipo === 'red')
    return 'No se pudo contactar al servidor de lectura; se reintentará en un momento.'
  return undefined
}
