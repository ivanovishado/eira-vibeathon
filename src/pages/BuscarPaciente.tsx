import { useDeferredValue, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { TarjetaPaciente } from '../components/TarjetaPaciente'
import { useIndicePacientes } from '../lib/useIndicePacientes'

const LIMITE = 50

export function BuscarPaciente() {
  const [params, setParams] = useSearchParams()
  const consulta = params.get('q') ?? ''
  const diferida = useDeferredValue(consulta)
  const indice = useIndicePacientes()
  const resultado = useMemo(
    () => indice?.buscar(diferida, LIMITE),
    [indice, diferida],
  )
  const total = indice?.pacientes.size
  const hayConsulta = diferida.trim() !== ''
  const altaUrl = consulta.trim()
    ? `/pacientes/nueva?q=${encodeURIComponent(consulta.trim())}`
    : '/pacientes/nueva'

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Buscar paciente</h1>
        <Link
          to={altaUrl}
          className="rounded-lg bg-pink-700 px-4 py-2 text-sm font-medium text-white hover:bg-pink-800"
        >
          Nueva paciente
        </Link>
      </div>

      <form role="search" onSubmit={(e) => e.preventDefault()}>
        <label htmlFor="consulta" className="sr-only">
          Nombre completo o celular
        </label>
        <input
          id="consulta"
          type="search"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          value={consulta}
          onChange={(e) =>
            setParams(e.target.value ? { q: e.target.value } : {}, {
              replace: true,
            })
          }
          placeholder="Nombre completo o celular"
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-lg shadow-sm focus:border-pink-700 focus:ring-2 focus:ring-pink-200 focus:outline-none"
        />
        <p className="mt-1 text-xs text-slate-500">
          Nombres y apellidos en cualquier orden, con o sin acentos. Del celular
          bastan los últimos 4 dígitos.
        </p>
      </form>

      {total === undefined ? (
        <p className="text-sm text-slate-600">Cargando expedientes…</p>
      ) : total === 0 ? (
        <p className="text-sm text-slate-600">
          No hay expedientes en este dispositivo. Puedes cargar datos ficticios
          en{' '}
          <Link to="/ajustes" className="text-pink-700 underline">
            Ajustes
          </Link>
          .
        </p>
      ) : !hayConsulta || !resultado ? (
        <p className="text-sm text-slate-600">
          {total.toLocaleString('es-MX')} expedientes en este dispositivo.
        </p>
      ) : resultado.total === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
          <p>No se encontró ningún expediente para «{diferida.trim()}».</p>
          <p className="mt-1">
            Prueba con un solo apellido o con los últimos dígitos del celular, o{' '}
            <Link to={altaUrl} className="text-pink-700 underline">
              registra a una paciente nueva
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-slate-600" aria-live="polite">
            {resultado.total > resultado.pacientes.length
              ? `Mostrando ${resultado.pacientes.length} de ${resultado.total.toLocaleString('es-MX')}. Escribe más para afinar.`
              : resultado.total === 1
                ? '1 expediente encontrado.'
                : `${resultado.total} expedientes encontrados.`}
          </p>
          <ul className="flex flex-col gap-2">
            {resultado.pacientes.map((p) => (
              <li key={p.id}>
                <TarjetaPaciente paciente={p} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
