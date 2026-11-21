import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef } from 'react'
import { Link, NavLink, Outlet, useMatch } from 'react-router-dom'
import { db } from '../db/schema'
import { EstadoConexion } from './EstadoConexion'

export function Layout() {
  // La revisión de hojas pone foto y campos lado a lado: necesita más ancho.
  const ancho = useMatch('/hojas/:hojaId') ? 'max-w-7xl' : 'max-w-3xl'
  const porRevisar = useLiveQuery(
    () => db.hojas.where('estado').equals('por-revisar').count(),
    [],
    0,
  )
  const encabezado = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = encabezado.current
    if (!el) return
    const medir = () =>
      document.documentElement.style.setProperty(
        '--alto-encabezado',
        `${el.offsetHeight}px`,
      )
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    medir()
    return () => ro.disconnect()
  }, [])
  return (
    <div className="flex min-h-dvh flex-col">
      <header
        ref={encabezado}
        className="sticky top-0 z-10 bg-pink-700 text-white shadow"
      >
        <div
          className={`mx-auto flex w-full ${ancho} flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3`}
        >
          <Link to="/" className="text-lg font-semibold">
            Expedientes EIRA
          </Link>
          <div className="flex items-center gap-4">
            <EstadoConexion />
            <NavLink
              to="/hojas"
              className="flex items-center gap-1 text-sm underline-offset-4 hover:underline"
            >
              Hojas
              {porRevisar > 0 && (
                <span
                  className="rounded-full bg-white px-1.5 text-xs font-semibold text-pink-800"
                  aria-label={`${porRevisar} por revisar`}
                >
                  {porRevisar}
                </span>
              )}
            </NavLink>
            <NavLink
              to="/ajustes"
              className="text-sm underline-offset-4 hover:underline"
            >
              Ajustes
            </NavLink>
          </div>
        </div>
      </header>
      <main className={`mx-auto w-full ${ancho} flex-1 px-4 py-4`}>
        <Outlet />
      </main>
    </div>
  )
}
