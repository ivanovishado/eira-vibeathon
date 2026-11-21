import { useSyncExternalStore } from 'react'
import { obtenerCliente } from './cliente'

/**
 * Cuenta de la médica guardada en el dispositivo. Mientras exista, la app la considera
 * con sesión aunque no haya red o el token haya vencido: solo la sincronización
 * necesita un token vigente, y lo renueva sola cuando vuelve la conexión.
 */
export interface Cuenta {
  id: string
  correo: string
  nombre: string
  /** El nombre cambió sin conexión y falta guardarlo en el servidor. */
  nombreSinSubir?: boolean
}

const CLAVE = 'eira:cuenta'
const oyentes = new Set<() => void>()
let actual: Cuenta | undefined = leerGuardada()

function leerGuardada(): Cuenta | undefined {
  try {
    const texto = localStorage.getItem(CLAVE)
    return texto ? (JSON.parse(texto) as Cuenta) : undefined
  } catch {
    return undefined
  }
}

function guardar(cuenta: Cuenta | undefined) {
  actual = cuenta
  if (cuenta) localStorage.setItem(CLAVE, JSON.stringify(cuenta))
  else localStorage.removeItem(CLAVE)
  oyentes.forEach((o) => o())
}

export const leerCuenta = () => actual

export function suscribirCuenta(oyente: () => void) {
  oyentes.add(oyente)
  return () => {
    oyentes.delete(oyente)
  }
}

export function useCuenta(): Cuenta | undefined {
  return useSyncExternalStore(suscribirCuenta, leerCuenta)
}

/** Valor inicial del campo médico en una consulta nueva. */
export function medicoDeCuenta(): { medico?: string } {
  const nombre = actual?.nombre.trim()
  return nombre ? { medico: nombre } : {}
}

function mensajeAuth(error: { message: string; status?: number }): string {
  if (error.status === 400 && /invalid login/i.test(error.message))
    return 'Correo o contraseña incorrectos.'
  if (/email not confirmed/i.test(error.message))
    return 'Falta confirmar el correo de esta cuenta.'
  if (!error.status || /fetch|network/i.test(error.message))
    return 'No hay conexión con el servidor. Intenta de nuevo con internet.'
  return error.message
}

export async function iniciarSesion(
  correo: string,
  contrasena: string,
): Promise<Cuenta> {
  const cliente = await obtenerCliente()
  const { data, error } = await cliente.auth.signInWithPassword({
    email: correo.trim(),
    password: contrasena,
  })
  if (error) throw new Error(mensajeAuth(error))
  const meta = data.user.user_metadata as { nombre?: unknown }
  const anterior = actual?.id === data.user.id ? actual : undefined
  const cuenta: Cuenta = {
    id: data.user.id,
    correo: data.user.email ?? correo.trim(),
    nombre: anterior?.nombreSinSubir
      ? anterior.nombre
      : typeof meta.nombre === 'string'
        ? meta.nombre
        : (anterior?.nombre ?? ''),
    nombreSinSubir: anterior?.nombreSinSubir,
  }
  guardar(cuenta)
  return cuenta
}

/** Cambia el nombre en el dispositivo y, cuando haya red, en la cuenta. */
export async function cambiarNombre(nombre: string): Promise<void> {
  if (!actual) return
  guardar({ ...actual, nombre: nombre.trim(), nombreSinSubir: true })
  await subirNombrePendiente().catch(() => undefined)
}

export async function subirNombrePendiente(): Promise<void> {
  const cuenta = actual
  if (!cuenta?.nombreSinSubir) return
  const cliente = await obtenerCliente()
  const { error } = await cliente.auth.updateUser({
    data: { nombre: cuenta.nombre },
  })
  if (error) throw new Error(mensajeAuth(error))
  if (actual?.id === cuenta.id && actual.nombre === cuenta.nombre)
    guardar({ ...actual, nombreSinSubir: undefined })
}

/** Cierra la sesión en este dispositivo; no borra los expedientes locales. */
export async function cerrarSesion(): Promise<void> {
  guardar(undefined)
  const cliente = await obtenerCliente()
  await cliente.auth.signOut({ scope: 'local' }).catch(() => undefined)
}
