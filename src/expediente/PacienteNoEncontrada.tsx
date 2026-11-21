import { Link } from 'react-router-dom'

export function PacienteNoEncontrada() {
  return (
    <section className="flex flex-col items-start gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <h1 className="text-xl font-semibold">Paciente no encontrada</h1>
      <p className="text-sm text-slate-600">
        Este expediente no existe en este dispositivo. Puede que se haya
        registrado en otra computadora y todavía no se sincronice.
      </p>
      <Link
        to="/"
        className="rounded-lg bg-pink-700 px-4 py-2 text-sm font-medium text-white"
      >
        Buscar paciente
      </Link>
    </section>
  )
}
