import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { nombreCompleto } from '../db/repo'
import type { Paciente } from '../db/schema'
import { calcularEdad, formatearFecha, formatearTelefono } from '../lib/formato'

export function TarjetaPaciente({
  paciente: p,
  children,
}: {
  paciente: Paciente
  children?: ReactNode
}) {
  const edad = calcularEdad(p.fechaNacimiento)
  const lugar = [p.comunidad, p.municipio].filter(Boolean).join(', ')
  return (
    <Link
      to={`/pacientes/${p.id}`}
      className="block rounded-xl border border-slate-200 bg-white p-3 hover:border-pink-300 hover:bg-pink-50 focus-visible:outline-2 focus-visible:outline-pink-700"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-medium">{nombreCompleto(p)}</span>
        {p.folio && <span className="text-xs text-slate-500">{p.folio}</span>}
      </div>
      <dl className="mt-1 grid grid-cols-1 gap-x-4 gap-y-0.5 text-sm text-slate-600 sm:grid-cols-3">
        <div>
          <dt className="sr-only">Nacimiento</dt>
          <dd>
            {p.fechaNacimiento
              ? `${edad} años · ${formatearFecha(p.fechaNacimiento)}`
              : 'Sin fecha de nacimiento'}
          </dd>
        </div>
        <div>
          <dt className="sr-only">Comunidad</dt>
          <dd>{lugar || 'Sin comunidad'}</dd>
        </div>
        <div>
          <dt className="sr-only">Celular</dt>
          <dd>
            {p.telefonos.length > 0
              ? p.telefonos.map(formatearTelefono).join(', ')
              : 'Sin celular'}
          </dd>
        </div>
      </dl>
      {children}
    </Link>
  )
}
