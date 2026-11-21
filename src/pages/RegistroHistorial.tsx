import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { nombreCompleto } from '../db/repo'
import { CamposRegistro } from '../expediente/CamposRegistro'
import { validarRegistro, type Valores } from '../expediente/camposRegistro'
import { formatearFecha } from '../expediente/fechas'
import { PacienteNoEncontrada } from '../expediente/PacienteNoEncontrada'
import {
  fechaDeMarca,
  horaDeMarca,
  lineaIdentificacion,
} from '../expediente/presentacion'
import {
  guardarRegistro,
  REGISTROS,
  type ClaseRegistro,
} from '../expediente/registros'
import { useCapturaRegistro } from '../expediente/useCapturaRegistro'
import type { EstadoExpediente } from './Expediente'

/** Alta o corrección de un antecedente o de atención recibida fuera de EIRA. */
export function RegistroHistorial({ clase }: { clase: ClaseRegistro }) {
  const { pacienteId = '' } = useParams()
  const [busqueda] = useSearchParams()
  const corrigeA = busqueda.get('corrige') ?? undefined
  const def = REGISTROS[clase]
  const consulta = busqueda.toString()
  const iniciales = useMemo(() => {
    const q = new URLSearchParams(consulta)
    const v: Valores = {}
    for (const c of def.campos) {
      const valor = q.get(c.id)
      if (valor) v[c.id] = valor
    }
    return v
  }, [consulta, def])
  const navegar = useNavigate()
  const { estado, valores, guardadoEn, cambiar, cerrar, reabrir, descartar } =
    useCapturaRegistro(clase, pacienteId, corrigeA, iniciales)
  const [intentoGuardar, setIntentoGuardar] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [errorGuardado, setErrorGuardado] = useState<string>()

  if (estado.fase === 'cargando' || (estado.fase === 'lista' && !valores))
    return <p className="text-sm text-slate-500">Cargando…</p>
  if (estado.fase === 'sin-paciente') return <PacienteNoEncontrada />
  const urlExpediente = `/pacientes/${pacienteId}`
  if (estado.fase === 'sin-original')
    return (
      <section className="flex flex-col items-start gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <h1 className="text-xl font-semibold">Registro no encontrado</h1>
        <p className="text-sm text-slate-600">
          Lo que intentas corregir no existe en el expediente de esta paciente o
          ya se quitó.
        </p>
        <Link to={urlExpediente} className="text-pink-700 underline">
          Volver al expediente
        </Link>
      </section>
    )
  if (!valores) return null

  const { paciente, original, recuperadoEn } = estado
  const errores = intentoGuardar ? validarRegistro(def.campos, valores) : {}

  async function ejecutar(retirar: boolean) {
    setErrorGuardado(undefined)
    setGuardando(true)
    cerrar()
    try {
      const registro = await guardarRegistro(clase, pacienteId, valores ?? {}, {
        corrigeA,
        retirar,
      })
      navegar(urlExpediente, {
        replace: true,
        state: {
          mensaje: retirar ? 'Registro quitado del expediente.' : def.guardado,
          registroGuardado: registro.id,
        } satisfies EstadoExpediente,
      })
    } catch (e) {
      reabrir()
      setErrorGuardado(e instanceof Error ? e.message : String(e))
      setGuardando(false)
    }
  }

  function guardar(evento: React.FormEvent) {
    evento.preventDefault()
    setIntentoGuardar(true)
    const encontrados = Object.keys(validarRegistro(def.campos, valores ?? {}))
    if (encontrados.length) {
      document.getElementById(`campo-${encontrados[0]}`)?.focus()
      return
    }
    void ejecutar(false)
  }

  function quitar() {
    if (
      window.confirm(
        '¿Quitar este registro del expediente? Se conserva en el historial de cambios.',
      )
    )
      void ejecutar(true)
  }

  async function empezarDeNuevo() {
    if (!window.confirm('¿Descartar lo capturado en este borrador?')) return
    await descartar()
    navegar(urlExpediente, { replace: true })
  }

  return (
    <form noValidate onSubmit={guardar} className="flex flex-col gap-4">
      <div>
        <Link to={urlExpediente} className="text-sm text-pink-700 underline">
          ← Expediente
        </Link>
        <h1 className="mt-1 text-xl font-semibold">
          {original ? def.tituloCorregir : def.tituloNuevo}
        </h1>
        <p className="text-sm text-slate-600">
          {nombreCompleto(paciente)}
          {lineaIdentificacion(paciente) &&
            ` · ${lineaIdentificacion(paciente)}`}
        </p>
      </div>

      {original && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Corriges lo registrado el{' '}
          {formatearFecha(fechaDeMarca(original.createdAt))}. La versión
          anterior se conserva en el historial de cambios.
        </p>
      )}

      {recuperadoEn && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">
          <span>
            Recuperamos la captura sin terminar del{' '}
            {formatearFecha(fechaDeMarca(recuperadoEn))} a las{' '}
            {horaDeMarca(recuperadoEn)}
          </span>
          <button
            type="button"
            onClick={empezarDeNuevo}
            className="font-medium underline"
          >
            Descartar borrador
          </button>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <CamposRegistro
          campos={def.campos}
          valores={valores}
          errores={errores}
          onCambio={cambiar}
        />
      </div>

      {errorGuardado && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          No se pudo guardar: {errorGuardado}
        </p>
      )}

      {original && (
        <button
          type="button"
          onClick={quitar}
          disabled={guardando}
          className="self-start text-sm text-red-700 underline disabled:opacity-50"
        >
          Quitar del expediente (se registró por error)
        </button>
      )}

      <div className="sticky bottom-0 -mx-4 flex items-center justify-between gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <p className="text-xs text-slate-500" aria-live="polite">
          {guardadoEn
            ? `Borrador guardado a las ${horaDeMarca(guardadoEn)}`
            : 'Se guarda un borrador mientras escribes'}
        </p>
        <button
          type="submit"
          disabled={guardando}
          className="rounded-lg bg-pink-700 px-5 py-2.5 text-sm font-medium text-white shadow hover:bg-pink-800 disabled:opacity-50"
        >
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  )
}
