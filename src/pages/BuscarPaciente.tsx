import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '../db/schema'

// Fase 1: búsqueda por nombre o celular.
export function BuscarPaciente() {
  const total = useLiveQuery(() => db.pacientes.count(), [], 0)

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Buscar paciente</h1>
      <p className="text-sm text-slate-600">
        {total === 0 ? (
          <>
            No hay expedientes en este dispositivo. Puedes cargar datos
            ficticios en{' '}
            <Link to="/ajustes" className="text-pink-700 underline">
              Ajustes
            </Link>
            .
          </>
        ) : (
          `${total.toLocaleString('es-MX')} expedientes en este dispositivo.`
        )}
      </p>
    </section>
  )
}
