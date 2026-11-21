import { useSyncExternalStore } from 'react'
import { sincronizacionConfigurada } from '../cuenta/config'
import {
  leerCuenta,
  subirNombrePendiente,
  suscribirCuenta,
} from '../cuenta/cuenta'
import { db } from '../db/schema'
import { crearMotor } from './motor'
import {
  crearProgramador,
  type EstadoSincronizacion,
  type Programador,
} from './programador'
import { crearRemotoSupabase } from './supabase'

let programador: Programador | undefined

/** Evita que dos pestañas abiertas sincronicen al mismo tiempo. */
function conCandado<T>(tarea: () => Promise<T>): Promise<T> {
  const locks = navigator.locks
  return locks ? locks.request('eira-sincronizacion', tarea) : tarea()
}

/** Arranca la sincronización en segundo plano. No hace nada en modo solo local. */
export function iniciarSincronizacion(): Programador | undefined {
  if (!sincronizacionConfigurada || programador) return programador
  const motor = crearMotor(crearRemotoSupabase())
  const p = crearProgramador({
    puede: () => navigator.onLine && Boolean(leerCuenta()),
    sincronizar: () =>
      conCandado(async () => {
        await subirNombrePendiente().catch(() => undefined)
        return motor.sincronizar()
      }),
  })
  programador = p

  db.colaSalida.hook('creating', () => {
    p.pronto()
  })
  window.addEventListener('online', () => void p.ahora())
  window.addEventListener('offline', () => p.detener())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void p.ahora()
  })
  let cuentaId = leerCuenta()?.id
  suscribirCuenta(() => {
    const id = leerCuenta()?.id
    const sinSesion = p.obtenerEstado().error?.tipo === 'sesion'
    if (id && (id !== cuentaId || sinSesion)) void p.ahora()
    cuentaId = id
  })
  void p.ahora()
  return p
}

export const sincronizarAhora = () => programador?.ahora()

const SIN_ESTADO: EstadoSincronizacion = { sincronizando: false }

export function useSincronizacion(): EstadoSincronizacion {
  return useSyncExternalStore(
    (o) => programador?.suscribir(o) ?? (() => undefined),
    () => (programador ? programador.obtenerEstado() : SIN_ESTADO),
  )
}
