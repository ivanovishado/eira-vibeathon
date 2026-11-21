import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { sincronizacionConfigurada } from '../cuenta/config'
import { useCuenta } from '../cuenta/cuenta'
import { repo } from '../db/repo'
import { useEnLinea } from '../lib/useEnLinea'
import { useSincronizacion } from '../sync/sincronizacion'

export function EstadoConexion() {
  const enLinea = useEnLinea()
  const pendientes = useLiveQuery(() => repo.cambiosPendientes(), [], 0)
  const cuenta = useCuenta()
  const sync = useSincronizacion()

  const contenido = (
    <>
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
      {sincronizacionConfigurada &&
        (!cuenta ? (
          <span className="rounded-full bg-white/20 px-2 py-0.5">
            Sin cuenta
          </span>
        ) : sync.sincronizando ? (
          <span>Sincronizando…</span>
        ) : (
          sync.error &&
          sync.error.tipo !== 'red' && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-800">
              Error al sincronizar
            </span>
          )
        ))}
    </>
  )

  if (!sincronizacionConfigurada)
    return (
      <div className="flex items-center gap-2 text-xs" role="status">
        {contenido}
      </div>
    )
  return (
    <Link
      to="/cuenta"
      className="flex flex-wrap items-center gap-2 text-xs"
      role="status"
      title="Cuenta y sincronización"
    >
      {contenido}
    </Link>
  )
}
