import type { Paciente } from '../db/schema'
import { nombreCompleto } from '../db/repo'
import { formatearFecha } from './fechas'
import { formatearTelefono, lineaIdentificacion } from './presentacion'

export function DatosPaciente({ paciente }: { paciente: Paciente }) {
  const lugar = [paciente.comunidad, paciente.municipio]
    .filter(Boolean)
    .join(', ')
  const filas: [string, React.ReactNode][] = [
    [
      'Celular',
      paciente.telefonos.length ? (
        paciente.telefonos.map((t) => (
          <a key={t} href={`tel:${t}`} className="mr-3 underline">
            {formatearTelefono(t)}
          </a>
        ))
      ) : (
        <span className="text-slate-400">Sin registro</span>
      ),
    ],
  ]
  if (lugar) filas.push(['Comunidad', lugar])
  if (paciente.fechaNacimiento)
    filas.push(['Nacimiento', formatearFecha(paciente.fechaNacimiento)])
  if (paciente.curp) filas.push(['CURP', paciente.curp])

  return (
    <div>
      <h1 className="text-xl font-semibold sm:text-2xl">
        {nombreCompleto(paciente)}
      </h1>
      <p className="text-sm text-slate-600">{lineaIdentificacion(paciente)}</p>
      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {filas.map(([etiqueta, valor]) => (
          <div key={etiqueta} className="flex gap-2">
            <dt className="w-24 shrink-0 text-slate-500">{etiqueta}</dt>
            <dd className="min-w-0 break-words">{valor}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
