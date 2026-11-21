import type { ResultadoLectura } from '../../supabase/functions/_shared/lecturaHoja.ts'
import { ErrorSincronizacion, type TipoError } from '../sync/remoto'
import { LECTURAS_DEMO } from './demo'
import type { ServicioHojas } from './servicio'

/**
 * Servidor de lectura en memoria con la misma interfaz que el real: para pruebas y
 * para la demo sin llave de Gemini (`VITE_LECTOR_SIMULADO=true`). Devuelve una de
 * las lecturas de demo según el tamaño de la foto.
 */
export function crearServicioSimulado({
  esperaMs = 0,
  lecturas = LECTURAS_DEMO,
}: {
  esperaMs?: number
  lecturas?: Omit<ResultadoLectura, 'modelo'>[]
} = {}) {
  const archivos = new Map<string, { datos: ArrayBuffer; tipo: string }>()
  const fallas: TipoError[] = []
  let lecturasPedidas = 0
  const esperar = () =>
    esperaMs ? new Promise((r) => setTimeout(r, esperaMs)) : Promise.resolve()
  const quizaFallar = () => {
    const tipo = fallas.shift()
    if (tipo) throw new ErrorSincronizacion(tipo, `Falla simulada (${tipo})`)
  }

  const servicio: ServicioHojas = {
    async subir(ruta, datos, tipo) {
      await esperar()
      quizaFallar()
      archivos.set(ruta, { datos: datos.slice(0), tipo })
    },
    async leer(ruta) {
      await esperar()
      quizaFallar()
      const archivo = archivos.get(ruta)
      if (!archivo)
        throw new ErrorSincronizacion('rechazo', `No existe la foto ${ruta}`)
      lecturasPedidas++
      const lectura = lecturas[archivo.datos.byteLength % lecturas.length]
      return structuredClone({ ...lectura, modelo: 'simulado' })
    },
    async descargar(ruta) {
      await esperar()
      quizaFallar()
      const archivo = archivos.get(ruta)
      if (!archivo)
        throw new ErrorSincronizacion('rechazo', `No existe la foto ${ruta}`)
      return { datos: archivo.datos.slice(0), tipo: archivo.tipo }
    },
  }
  return {
    ...servicio,
    archivos,
    /** Las próximas llamadas fallan con estos tipos, en orden. */
    fallar(...tipos: TipoError[]) {
      fallas.push(...tipos)
    },
    get lecturasPedidas() {
      return lecturasPedidas
    },
  }
}
