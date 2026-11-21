import { useCallback, useEffect, useRef, useState } from 'react'
import {
  db,
  type Antecedente,
  type AtencionExterna,
  type Paciente,
} from '../db/schema'
import { aValores, type Valores } from './camposRegistro'
import {
  claveBorradorRegistro,
  leerBorradorRegistro,
  REGISTROS,
  type ClaseRegistro,
} from './registros'
import { ESPERA_BORRADOR_MS } from './useCapturaConsulta'

export type EstadoRegistro =
  | { fase: 'cargando' }
  | { fase: 'sin-paciente' }
  | { fase: 'sin-original' }
  | {
      fase: 'lista'
      paciente: Paciente
      original?: Antecedente | AtencionExterna
      recuperadoEn?: string
    }

/**
 * Captura de un antecedente o atención externa con borrador automático, igual que la
 * de consulta: se guarda poco después de cada cambio, al ocultar la pestaña y al salir.
 */
export function useCapturaRegistro(
  clase: ClaseRegistro,
  pacienteId: string,
  corrigeA?: string,
  iniciales: Valores = {},
) {
  const clave = claveBorradorRegistro(clase, pacienteId, corrigeA)
  const [carga, setCarga] = useState<{
    clave: string
    estado: EstadoRegistro
  }>()
  const estado: EstadoRegistro =
    carga?.clave === clave ? carga.estado : { fase: 'cargando' }
  const [valores, setValores] = useState<Valores>()
  const [guardadoEn, setGuardadoEn] = useState<string>()
  const actual = useRef<Valores | undefined>(undefined)
  const pendiente = useRef(false)
  const cerrado = useRef(false)
  const temporizador = useRef<ReturnType<typeof setTimeout>>(undefined)
  const inicialesRef = useRef(iniciales)

  useEffect(() => {
    let vigente = true
    cerrado.current = false
    pendiente.current = false
    const setEstado = (e: EstadoRegistro) => setCarga({ clave, estado: e })
    void (async () => {
      const def = REGISTROS[clase]
      const paciente = await db.pacientes.get(pacienteId)
      if (!paciente) {
        if (vigente) setEstado({ fase: 'sin-paciente' })
        return
      }
      const original = corrigeA
        ? await db
            .table<Antecedente | AtencionExterna, string>(def.tabla)
            .get(corrigeA)
        : undefined
      if (
        corrigeA &&
        (original?.pacienteId !== pacienteId || original.retirado)
      ) {
        if (vigente) setEstado({ fase: 'sin-original' })
        return
      }
      const borrador = await leerBorradorRegistro(clave)
      const inicial =
        borrador?.valores ??
        (original ? aValores(def.campos, original) : inicialesRef.current)
      if (!vigente) return
      actual.current = inicial
      setValores(inicial)
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
  }, [clase, pacienteId, corrigeA, clave])

  const guardarAhora = useCallback(async () => {
    clearTimeout(temporizador.current)
    if (!pendiente.current || cerrado.current || !actual.current) return
    pendiente.current = false
    const updatedAt = new Date().toISOString()
    await db.borradores.put({ clave, datos: actual.current, updatedAt })
    setGuardadoEn(updatedAt)
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

  const cambiar = useCallback(
    (id: string, valor: string) => {
      if (!actual.current) return
      const nuevos = { ...actual.current, [id]: valor }
      actual.current = nuevos
      setValores(nuevos)
      pendiente.current = true
      clearTimeout(temporizador.current)
      temporizador.current = setTimeout(
        () => void guardarAhora(),
        ESPERA_BORRADOR_MS,
      )
    },
    [guardarAhora],
  )

  const cerrar = useCallback(() => {
    clearTimeout(temporizador.current)
    cerrado.current = true
  }, [])

  const reabrir = useCallback(() => {
    cerrado.current = false
    pendiente.current = true
    void guardarAhora()
  }, [guardarAhora])

  const descartar = useCallback(async () => {
    cerrar()
    await db.borradores.delete(clave)
  }, [cerrar, clave])

  return {
    estado,
    valores,
    guardadoEn,
    cambiar,
    cerrar,
    reabrir,
    descartar,
  }
}
