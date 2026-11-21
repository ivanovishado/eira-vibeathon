import { comoErrorSincronizacion, type TipoError } from './remoto'

export interface EstadoSincronizacion {
  sincronizando: boolean
  /** Último error; se limpia con la siguiente sincronización exitosa. */
  error?: { tipo: TipoError; mensaje: string; en: string }
  ultimoExito?: string
  proximoIntento?: string
}

export interface OpcionesProgramador {
  sincronizar: () => Promise<unknown>
  /** Si hay red y sesión; si no, no se intenta. */
  puede: () => boolean
  esperaBaseMs?: number
  esperaMaxMs?: number
  /** Cada cuánto se sincroniza mientras la app está abierta. */
  periodoMs?: number
  /** Espera tras un cambio local, para juntar varios en un envío. */
  agruparMs?: number
  azar?: () => number
  ahora?: () => Date
}

/**
 * Decide cuándo sincronizar: al abrir, al volver la red o la pestaña, periódicamente,
 * poco después de cada cambio local y a petición. Tras un fallo reintenta con espera
 * exponencial. Nunca corre dos sincronizaciones a la vez.
 */
export function crearProgramador({
  sincronizar,
  puede,
  esperaBaseMs = 5_000,
  esperaMaxMs = 5 * 60_000,
  periodoMs = 5 * 60_000,
  agruparMs = 3_000,
  azar = Math.random,
  ahora = () => new Date(),
}: OpcionesProgramador) {
  let estado: EstadoSincronizacion = { sincronizando: false }
  const oyentes = new Set<() => void>()
  let fallos = 0
  let temporizador: ReturnType<typeof setTimeout> | undefined
  let enCurso: Promise<void> | undefined
  let otraVez = false

  function cambiar(cambios: Partial<EstadoSincronizacion>) {
    estado = { ...estado, ...cambios }
    oyentes.forEach((o) => o())
  }

  function programar(ms: number) {
    clearTimeout(temporizador)
    temporizador = setTimeout(() => void ejecutar(), ms)
    cambiar({ proximoIntento: new Date(ahora().getTime() + ms).toISOString() })
  }

  function espera() {
    const base = Math.min(esperaMaxMs, esperaBaseMs * 2 ** (fallos - 1))
    return Math.round(base * (0.8 + 0.4 * azar()))
  }

  async function correr() {
    clearTimeout(temporizador)
    cambiar({ sincronizando: true, proximoIntento: undefined })
    try {
      await sincronizar()
      fallos = 0
      cambiar({
        sincronizando: false,
        error: undefined,
        ultimoExito: ahora().toISOString(),
      })
      programar(periodoMs)
    } catch (e) {
      const error = comoErrorSincronizacion(e)
      fallos++
      cambiar({
        sincronizando: false,
        error: {
          tipo: error.tipo,
          mensaje: error.message,
          en: ahora().toISOString(),
        },
      })
      // Sin sesión no tiene caso reintentar: se espera a que la médica inicie sesión.
      if (error.tipo === 'sesion') cambiar({ proximoIntento: undefined })
      else programar(espera())
    }
  }

  /** Sincroniza ahora si se puede; si ya hay una en curso, encadena otra al terminar. */
  function ejecutar(): Promise<void> {
    if (enCurso) {
      otraVez = true
      return enCurso
    }
    if (!puede()) {
      clearTimeout(temporizador)
      cambiar({ proximoIntento: undefined })
      return Promise.resolve()
    }
    enCurso = (async () => {
      do {
        otraVez = false
        await correr()
      } while (otraVez && puede())
    })().finally(() => {
      enCurso = undefined
    })
    return enCurso
  }

  return {
    obtenerEstado: () => estado,
    suscribir(oyente: () => void) {
      oyentes.add(oyente)
      return () => {
        oyentes.delete(oyente)
      }
    },
    /** Sincronizar ahora (botón, red de vuelta, sesión iniciada). Reinicia la espera. */
    ahora(): Promise<void> {
      fallos = 0
      return ejecutar()
    },
    /** Hubo un cambio local: sincronizar en unos segundos. */
    pronto() {
      if (enCurso) {
        otraVez = true
        return
      }
      if (fallos === 0 && puede()) programar(agruparMs)
    },
    detener() {
      clearTimeout(temporizador)
    },
  }
}

export type Programador = ReturnType<typeof crearProgramador>
