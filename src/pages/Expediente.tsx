import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useLocation, useParams } from 'react-router-dom'
import { db, type Brigada } from '../db/schema'
import { Antecedentes } from '../expediente/Antecedentes'
import { fechaAtencion, tituloAtencion } from '../expediente/atencionExterna'
import { claveBorrador } from '../expediente/captura'
import { DatosPaciente } from '../expediente/DatosPaciente'
import { formatearFecha, haceCuanto } from '../expediente/fechas'
import { construirHistorial, resumirHistorial } from '../expediente/historial'
import { FilaEstudio, LineaTiempo } from '../expediente/LineaTiempo'
import { PacienteNoEncontrada } from '../expediente/PacienteNoEncontrada'
import { rutaRegistro } from '../expediente/registros'
import { agruparVersiones } from '../expediente/versiones'

export interface EstadoExpediente {
  consultaGuardada?: string
  /** Antecedente o atención externa recién guardados. */
  registroGuardado?: string
  mensaje?: string
}

export function Expediente() {
  const { pacienteId = '' } = useParams()
  const { state } = useLocation() as { state: EstadoExpediente | null }
  const datos = useLiveQuery(async () => {
    const paciente = await db.pacientes.get(pacienteId)
    if (!paciente) return null
    const [consultas, estudios, borrador, antecedentes, externas] =
      await Promise.all([
        db.consultas.where('pacienteId').equals(pacienteId).toArray(),
        db.estudios.where('pacienteId').equals(pacienteId).toArray(),
        db.borradores.get(claveBorrador(pacienteId)),
        db.antecedentes.where('pacienteId').equals(pacienteId).toArray(),
        db.atencionesExternas.where('pacienteId').equals(pacienteId).toArray(),
      ])
    const idsBrigada = [
      ...new Set(consultas.flatMap((c) => (c.brigadaId ? [c.brigadaId] : []))),
    ]
    const brigadas = (await db.brigadas.bulkGet(idsBrigada)).filter(
      (b): b is Brigada => !!b,
    )
    return {
      paciente,
      historial: construirHistorial(consultas, estudios, brigadas, externas),
      antecedentes: agruparVersiones(antecedentes),
      hayBorrador: !!borrador,
    }
  }, [pacienteId])

  if (datos === undefined)
    return <p className="text-sm text-slate-500">Cargando expediente…</p>
  if (datos === null) return <PacienteNoEncontrada />

  const { paciente, historial, antecedentes, hayBorrador } = datos
  const resumen = resumirHistorial(historial)
  const ultima = resumen.ultimaConsulta?.consulta

  return (
    <section className="flex flex-col gap-4 pb-6">
      {(state?.consultaGuardada || state?.mensaje) && (
        <p
          role="status"
          className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-900"
        >
          {state.mensaje ?? 'Consulta guardada en este dispositivo.'}
        </p>
      )}

      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-start sm:justify-between">
        <DatosPaciente paciente={paciente} />
        <Link
          to={`/pacientes/${paciente.id}/consultas/nueva`}
          className="shrink-0 rounded-lg bg-pink-700 px-4 py-2.5 text-center text-sm font-medium text-white shadow hover:bg-pink-800"
        >
          {hayBorrador
            ? 'Continuar consulta en borrador'
            : 'Registrar consulta'}
        </Link>
      </div>

      <div className="rounded-xl border border-pink-200 bg-pink-50/60 p-4">
        <h2 className="text-sm font-semibold tracking-wide text-pink-900 uppercase">
          De un vistazo
        </h2>
        {ultima ? (
          <div className="mt-2 flex flex-col gap-2 text-sm">
            <p>
              <span className="text-slate-600">Última consulta:</span>{' '}
              <strong>{formatearFecha(ultima.fecha)}</strong> (
              {haceCuanto(ultima.fecha)}) · {ultima.motivo}
            </p>
            {ultima.diagnostico && (
              <p>
                <span className="text-slate-600">Diagnóstico:</span>{' '}
                {ultima.diagnostico}
              </p>
            )}
            {ultima.plan && (
              <p>
                <span className="text-slate-600">Plan:</span> {ultima.plan}
              </p>
            )}
            <p className="text-slate-600">
              {resumen.totalConsultas === 1
                ? '1 consulta registrada'
                : `${resumen.totalConsultas} consultas registradas`}
            </p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-600">Sin consultas previas.</p>
        )}
        {resumen.externasDesdeUltima.length > 0 && (
          <div className="mt-3">
            <h3 className="text-xs font-medium text-slate-600">
              {ultima
                ? 'Fuera de EIRA desde la última consulta'
                : 'Atención fuera de EIRA'}
            </h3>
            <ul className="mt-1 flex flex-col gap-1">
              {resumen.externasDesdeUltima.map((a) => (
                <li
                  key={a.id}
                  className="rounded-lg bg-sky-50 px-3 py-1.5 text-sm"
                >
                  <span className="font-medium text-sky-900">
                    {tituloAtencion(a)}
                  </span>
                  <span className="text-slate-500"> · {fechaAtencion(a)}</span>
                  <span className="text-slate-700"> · {a.resumen}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {resumen.ultimosEstudios.length > 0 && (
          <div className="mt-3">
            <h3 className="text-xs font-medium text-slate-600">
              Último estudio de cada tipo
            </h3>
            <ul className="mt-1 grid gap-1 sm:grid-cols-2">
              {resumen.ultimosEstudios.map((e) => (
                <li key={e.id}>
                  <FilaEstudio estudio={e} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <Antecedentes pacienteId={paciente.id} grupos={antecedentes} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Historial</h2>
        <Link
          to={rutaRegistro('externa', paciente.id)}
          className="rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-sm font-medium text-sky-900 hover:bg-sky-50"
        >
          + Atención fuera de EIRA
        </Link>
      </div>
      <LineaTiempo
        historial={historial}
        resaltar={state?.consultaGuardada ?? state?.registroGuardado}
      />
    </section>
  )
}
