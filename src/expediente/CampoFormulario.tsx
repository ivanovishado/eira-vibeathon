import type { Brigada } from '../db/schema'
import { formatearFecha } from './fechas'
import type { CampoConsulta } from './formulario'

/** Aviso sobre un valor leído de una hoja (dudoso o ilegible). */
export interface MarcaCampo {
  texto: string
}

const estiloEntrada =
  'w-full rounded-lg border bg-white px-3 py-2 text-base outline-none focus:border-pink-600 focus:ring-2 focus:ring-pink-200 sm:text-sm'

export function CampoFormulario({
  campo,
  valor,
  error,
  brigadas,
  onCambio,
  marca,
}: {
  campo: CampoConsulta
  valor: string
  error?: string
  marca?: MarcaCampo
  brigadas: Brigada[]
  onCambio: (valor: string) => void
}) {
  const id = `campo-${campo.id}`
  const comunes = {
    id,
    name: campo.id,
    value: valor,
    'aria-invalid': !!error,
    'aria-describedby':
      [error && `${id}-error`, marca && `${id}-marca`]
        .filter(Boolean)
        .join(' ') || undefined,
    className: `${estiloEntrada} ${error ? 'border-red-500' : marca ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-200' : 'border-slate-300'}`,
  }
  let entrada: React.ReactNode
  switch (campo.tipo) {
    case 'parrafo':
      entrada = (
        <textarea
          {...comunes}
          rows={3}
          placeholder={campo.placeholder}
          onChange={(e) => onCambio(e.target.value)}
        />
      )
      break
    case 'brigada':
      entrada = (
        <select {...comunes} onChange={(e) => onCambio(e.target.value)}>
          <option value="">Sin brigada</option>
          {brigadas.map((b) => (
            <option key={b.id} value={b.id}>
              {b.lugar} · {formatearFecha(b.fecha)}
            </option>
          ))}
        </select>
      )
      break
    default:
      entrada = (
        <input
          {...comunes}
          type={campo.tipo === 'fecha' ? 'date' : 'text'}
          inputMode={campo.tipo === 'numero' ? 'decimal' : undefined}
          placeholder={campo.placeholder}
          onChange={(e) => onCambio(e.target.value)}
        />
      )
  }
  return (
    <div
      className={`flex flex-col gap-1 ${campo.tipo === 'parrafo' ? 'sm:col-span-full' : ''}`}
    >
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {campo.etiqueta}
        {campo.unidad && (
          <span className="font-normal text-slate-500"> ({campo.unidad})</span>
        )}
        {campo.requerido && <span className="text-pink-700"> *</span>}
      </label>
      {entrada}
      {marca && (
        <p id={`${id}-marca`} className="text-xs text-amber-800">
          {marca.texto}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}
