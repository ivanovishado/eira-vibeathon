import { useCallback, useEffect, useRef, useState } from 'react'
import { db, type Consulta, type Paciente } from '../db/schema'
import {
  claveBorrador,
  descartarBorrador,
  guardarBorrador,
  leerBorrador,
  leerRecordados,
} from './captura'
import {
  capturaParaCorregir,
  capturaVacia,
  type CapturaConsulta,
} from './formulario'

export type EstadoCaptura =
  | { fase: 'cargando' }
  | { fase: 'sin-paciente' }
  | { fase: 'sin-original' }
  | {
      fase: 'lista'
      paciente: Paciente
      original?: Consulta
      /** Si se recuperó un borrador, cuándo se guardó. */
      recuperadoEn?: string
    }

/** Espera tras la última tecla antes de guardar el borrador. */
export const ESPERA_BORRADOR_MS = 400

/**
 * Estado del formulario de consulta con guardado automático del borrador: se guarda
 * poco después de cada cambio, al ocultar la pestaña y al salir de la pantalla.
 */
export function useCapturaConsulta(pacienteId: string, corrigeA?: string) {
  const clave = claveBorrador(pacienteId, corrigeA)
  const [carga, setCarga] = useState<{ clave: string; estado: EstadoCaptura }>()
  const estado: EstadoCaptura =
    carga?.clave === clave ? carga.estado : { fase: 'cargando' }
  const [captura, setCaptura] = useState<CapturaConsulta>()
  const [guardadoEn, setGuardadoEn] = useState<string>()
  const actual = useRef<CapturaConsulta | undefined>(undefined)
  const pendiente = useRef(false)
  const cerrado = useRef(false)
  const temporizador = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    let vigente = true
    cerrado.current = false
    pendiente.current = false
    const setEstado = (e: EstadoCaptura) => setCarga({ clave, estado: e })
    void (async () => {
      const paciente = await db.pacientes.get(pacienteId)
      if (!paciente) {
        if (vigente) setEstado({ fase: 'sin-paciente' })
        return
      }
      const original = corrigeA ? await db.consultas.get(corrigeA) : undefined
      if (corrigeA && original?.pacienteId !== pacienteId) {
        if (vigente) setEstado({ fase: 'sin-original' })
        return
      }
      const borrador = await leerBorrador(clave)
      const inicial =
        borrador?.captura ??
        (original
          ? capturaParaCorregir(
              original,
              await db.estudios
                .where('consultaId')
                .equals(original.id)
                .toArray(),
            )
          : capturaVacia(await leerRecordados()))
      if (!vigente) return
      actual.current = inicial
      setCaptura(inicial)
      setGuardadoEn(borrador?.updatedAt)
      setEstado({
        fase: 'lista',
        paciente,
        original,
        recuperadoEn: borrador?.updatedAt,
      })
    })()
    return () => {
      vigente = false
    }
  }, [pacienteId, corrigeA, clave])

  const guardarAhora = useCallback(async () => {
    clearTimeout(temporizador.current)
    if (!pendiente.current || cerrado.current || !actual.current) return
    pendiente.current = false
    setGuardadoEn(await guardarBorrador(clave, actual.current))
  }, [clave])

  useEffect(() => {
    const alOcultar = () => {
      if (document.visibilityState === 'hidden') void guardarAhora()
    }
    const alSalir = () => void guardarAhora()
    document.addEventListener('visibilitychange', alOcultar)
    window.addEventListener('pagehide', alSalir)
    return () => {
      document.removeEventListener('visibilitychange', alOcultar)
      window.removeEventListener('pagehide', alSalir)
      void guardarAhora()
    }
  }, [guardarAhora])

  const actualizar = useCallback(
    (cambio: (c: CapturaConsulta) => CapturaConsulta) => {
      if (!actual.current) return
      const nueva = cambio(actual.current)
      actual.current = nueva
      setCaptura(nueva)
      pendiente.current = true
      clearTimeout(temporizador.current)
      temporizador.current = setTimeout(
        () => void guardarAhora(),
        ESPERA_BORRADOR_MS,
      )
    },
    [guardarAhora],
  )

  /** Deja de guardar el borrador (antes de registrar la consulta). */
  const cerrar = useCallback(() => {
    clearTimeout(temporizador.current)
    cerrado.current = true
  }, [])

  /** Reanuda el guardado si el registro falló. */
  const reabrir = useCallback(() => {
    cerrado.current = false
    pendiente.current = true
    void guardarAhora()
  }, [guardarAhora])

  const descartar = useCallback(async () => {
    cerrar()
    await descartarBorrador(clave)
  }, [cerrar, clave])

  return {
    estado,
    captura,
    guardadoEn,
    actualizar,
    cerrar,
    reabrir,
    descartar,
  }
}
