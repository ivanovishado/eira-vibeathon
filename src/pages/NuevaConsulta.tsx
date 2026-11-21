import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { nombreCompleto } from '../db/repo'
import { db, TIPOS_ESTUDIO, type TipoEstudio } from '../db/schema'
import { registrarConsulta } from '../expediente/captura'
import { CampoFormulario } from '../expediente/CampoFormulario'
import { formatearFecha } from '../expediente/fechas'
import {
  CAMPOS_CONSULTA,
  ETIQUETAS_ESTUDIO,
  nuevoEstudio,
  SECCIONES,
  validarCaptura,
  type EstudioCaptura,
  type Errores,
  type IdCampo,
} from '../expediente/formulario'
import { PacienteNoEncontrada } from '../expediente/PacienteNoEncontrada'
import {
  fechaDeMarca,
  horaDeMarca,
  lineaIdentificacion,
} from '../expediente/presentacion'
import { useCapturaConsulta } from '../expediente/useCapturaConsulta'
import type { EstadoExpediente } from './Expediente'

const estiloEntrada =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base outline-none focus:border-pink-600 focus:ring-2 focus:ring-pink-200 sm:text-sm'

export function NuevaConsulta() {
  const { pacienteId = '' } = useParams()
  const [busqueda] = useSearchParams()
  const corrigeA = busqueda.get('corrige') ?? undefined
  const navegar = useNavigate()
  const {
    estado,
    captura,
    guardadoEn,
    actualizar,
    cerrar,
    reabrir,
    descartar,
  } = useCapturaConsulta(pacienteId, corrigeA)
  const brigadas = useLiveQuery(
    () => db.brigadas.orderBy('fecha').reverse().toArray(),
    [],
    [],
  )
  const [intentoGuardar, setIntentoGuardar] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [errorGuardado, setErrorGuardado] = useState<string>()

  if (estado.fase === 'cargando' || (estado.fase === 'lista' && !captura))
    return <p className="text-sm text-slate-500">Cargando…</p>
  if (estado.fase === 'sin-paciente') return <PacienteNoEncontrada />
  if (estado.fase === 'sin-original')
    return (
      <section className="flex flex-col items-start gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <h1 className="text-xl font-semibold">Consulta no encontrada</h1>
        <p className="text-sm text-slate-600">
          La consulta que intentas corregir no existe en el expediente de esta
          paciente.
        </p>
        <Link
          to={`/pacientes/${pacienteId}`}
          className="text-pink-700 underline"
        >
          Volver al expediente
        </Link>
      </section>
    )
  if (!captura) return null

  const { paciente, original, recuperadoEn } = estado
  const errores: Errores = intentoGuardar ? validarCaptura(captura) : {}
  const urlExpediente = `/pacientes/${paciente.id}`

  const cambiarCampo = (id: IdCampo, valor: string) =>
    actualizar((c) => ({ ...c, valores: { ...c.valores, [id]: valor } }))
  const cambiarEstudio = (clave: string, cambios: Partial<EstudioCaptura>) =>
    actualizar((c) => ({
      ...c,
      estudios: c.estudios.map((e) =>
        e.clave === clave ? { ...e, ...cambios } : e,
      ),
    }))
  const agregarEstudio = (tipo: TipoEstudio) =>
    actualizar((c) => ({ ...c, estudios: [...c.estudios, nuevoEstudio(tipo)] }))
  const quitarEstudio = (clave: string) =>
    actualizar((c) => ({
      ...c,
      estudios: c.estudios.filter((e) => e.clave !== clave),
    }))

  async function guardar(evento: React.FormEvent) {
    evento.preventDefault()
    if (!captura) return
    setIntentoGuardar(true)
    setErrorGuardado(undefined)
    const encontrados = Object.keys(validarCaptura(captura))
    if (encontrados.length) {
      document.getElementById(`campo-${encontrados[0]}`)?.focus()
      return
    }
    setGuardando(true)
    cerrar()
    try {
      const consulta = await registrarConsulta(pacienteId, captura)
      navegar(urlExpediente, {
        replace: true,
        state: { consultaGuardada: consulta.id } satisfies EstadoExpediente,
      })
    } catch (e) {
      reabrir()
      setErrorGuardado(e instanceof Error ? e.message : String(e))
      setGuardando(false)
    }
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
          {original ? 'Corregir consulta' : 'Nueva consulta'}
        </h1>
        <p className="text-sm text-slate-600">
          {nombreCompleto(paciente)}
          {lineaIdentificacion(paciente) &&
            ` · ${lineaIdentificacion(paciente)}`}
        </p>
      </div>

      {original && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Corriges la consulta del {formatearFecha(original.fecha)} (registrada
          el {formatearFecha(fechaDeMarca(original.createdAt))}). La original se
          conserva en el historial y esta queda marcada como su corrección.
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

      {SECCIONES.map((s) => (
        <fieldset
          key={s.id}
          className="rounded-xl border border-slate-200 bg-white p-4"
        >
          <legend className="px-1 text-sm font-semibold text-slate-800">
            {s.titulo}
          </legend>
          <div
            className={`grid gap-3 ${s.id === 'signos' ? 'grid-cols-2 sm:grid-cols-3' : 'sm:grid-cols-2'}`}
          >
            {CAMPOS_CONSULTA.filter((c) => c.seccion === s.id).map((c) => (
              <CampoFormulario
                key={c.id}
                campo={c}
                valor={captura.valores[c.id] ?? ''}
                error={errores[c.id]}
                brigadas={brigadas}
                onCambio={(v) => cambiarCampo(c.id, v)}
              />
            ))}
          </div>
        </fieldset>
      ))}

      <fieldset className="rounded-xl border border-slate-200 bg-white p-4">
        <legend className="px-1 text-sm font-semibold text-slate-800">
          Estudios
        </legend>
        {captura.estudios.length > 0 && (
          <ul className="mb-3 flex flex-col gap-3">
            {captura.estudios.map((e) => (
              <li
                key={e.clave}
                className="rounded-lg border border-pink-200 bg-pink-50/50 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-medium text-pink-900">
                    {ETIQUETAS_ESTUDIO[e.tipo]}
                  </h3>
                  <button
                    type="button"
                    onClick={() => quitarEstudio(e.clave)}
                    className="text-sm text-slate-600 underline"
                    aria-label={`Quitar ${ETIQUETAS_ESTUDIO[e.tipo]}`}
                  >
                    Quitar
                  </button>
                </div>
                <div className="mt-2 grid gap-3 sm:grid-cols-[12rem_1fr]">
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="font-medium text-slate-700">Fecha</span>
                    <input
                      type="date"
                      value={e.fecha || captura.valores.fecha || ''}
                      onChange={(ev) =>
                        cambiarEstudio(e.clave, { fecha: ev.target.value })
                      }
                      className={estiloEntrada}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="font-medium text-slate-700">
                      Resultado
                    </span>
                    <textarea
                      rows={2}
                      value={e.resultado}
                      placeholder="Vacío si aún no hay resultado"
                      onChange={(ev) =>
                        cambiarEstudio(e.clave, { resultado: ev.target.value })
                      }
                      className={estiloEntrada}
                    />
                  </label>
                </div>
                {errores[`estudio.${e.clave}`] && (
                  <p className="mt-1 text-xs text-red-700">
                    {errores[`estudio.${e.clave}`]}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          {TIPOS_ESTUDIO.map((tipo) => (
            <button
              key={tipo}
              type="button"
              onClick={() => agregarEstudio(tipo)}
              className="rounded-full border border-pink-300 bg-white px-3 py-1.5 text-sm text-pink-800 hover:bg-pink-50"
            >
              + {ETIQUETAS_ESTUDIO[tipo]}
            </button>
          ))}
        </div>
      </fieldset>

      {errorGuardado && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          No se pudo guardar: {errorGuardado}
        </p>
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
          {guardando ? 'Guardando…' : 'Guardar consulta'}
        </button>
      </div>
    </form>
  )
}
