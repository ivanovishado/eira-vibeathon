import { useLiveQuery } from 'dexie-react-hooks'
import { repo } from '../db/repo'
import { useEnLinea } from '../lib/useEnLinea'

export function EstadoConexion() {
  const enLinea = useEnLinea()
  const pendientes = useLiveQuery(() => repo.cambiosPendientes(), [], 0)

  return (
    <div className="flex items-center gap-2 text-xs" role="status">
      <span
        className={`inline-block size-2 rounded-full ${enLinea ? 'bg-emerald-400' : 'bg-amber-300'}`}
      />
      <span>{enLinea ? 'En línea' : 'Sin conexión'}</span>
      {pendientes > 0 && (
        <span className="rounded-full bg-white/20 px-2 py-0.5">
          {pendientes}{' '}
          {pendientes === 1 ? 'cambio pendiente' : 'cambios pendientes'}
        </span>
      )}
    </div>
  )
}
