import { Link, NavLink, Outlet } from 'react-router-dom'
import { EstadoConexion } from './EstadoConexion'

export function Layout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 bg-pink-700 text-white shadow">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="text-lg font-semibold">
            Expedientes EIRA
          </Link>
          <div className="flex items-center gap-4">
            <EstadoConexion />
            <NavLink
              to="/ajustes"
              className="text-sm underline-offset-4 hover:underline"
            >
              Ajustes
            </NavLink>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4">
        <Outlet />
      </main>
    </div>
  )
}
