import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useLocation, useParams } from 'react-router-dom'
import { db, type Brigada } from '../db/schema'
import { claveBorrador } from '../expediente/captura'
import { DatosPaciente } from '../expediente/DatosPaciente'
import { formatearFecha, haceCuanto } from '../expediente/fechas'
import { construirHistorial, resumirHistorial } from '../expediente/historial'
import { FilaEstudio, LineaTiempo } from '../expediente/LineaTiempo'
import { PacienteNoEncontrada } from '../expediente/PacienteNoEncontrada'

export interface EstadoExpediente {
  consultaGuardada?: string
}

export function Expediente() {
  const { pacienteId = '' } = useParams()
  const { state } = useLocation() as { state: EstadoExpediente | null }
  const datos = useLiveQuery(async () => {
    const paciente = await db.pacientes.get(pacienteId)
    if (!paciente) return null
    const [consultas, estudios, borrador] = await Promise.all([
      db.consultas.where('pacienteId').equals(pacienteId).toArray(),
      db.estudios.where('pacienteId').equals(pacienteId).toArray(),
      db.borradores.get(claveBorrador(pacienteId)),
    ])
    const idsBrigada = [
      ...new Set(consultas.flatMap((c) => (c.brigadaId ? [c.brigadaId] : []))),
    ]
    const brigadas = (await db.brigadas.bulkGet(idsBrigada)).filter(
      (b): b is Brigada => !!b,
    )
    return {
      paciente,
      historial: construirHistorial(consultas, estudios, brigadas),
      hayBorrador: !!borrador,
    }
  }, [pacienteId])

  if (datos === undefined)
    return <p className="text-sm text-slate-500">Cargando expediente…</p>
  if (datos === null) return <PacienteNoEncontrada />

  const { paciente, historial, hayBorrador } = datos
  const resumen = resumirHistorial(historial)
  const ultima = resumen.ultimaConsulta?.consulta

  return (
    <section className="flex flex-col gap-4 pb-6">
      {state?.consultaGuardada && (
        <p
          role="status"
          className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-900"
        >
          Consulta guardada en este dispositivo.
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

      <h2 className="text-lg font-semibold">Historial</h2>
      <LineaTiempo historial={historial} resaltar={state?.consultaGuardada} />
    </section>
  )
}
