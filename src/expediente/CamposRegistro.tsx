import {
  camposVisibles,
  MARCADA,
  type CampoRegistro,
  type Valores,
} from './camposRegistro'

const estiloEntrada =
  'w-full rounded-lg border bg-white px-3 py-2 text-base outline-none focus:border-pink-600 focus:ring-2 focus:ring-pink-200 sm:text-sm'

/**
 * Campos de un antecedente o atención externa. `prefijo` distingue varias filas en el
 * mismo formulario: el id de cada entrada es `campo-<prefijo><campo>`.
 */
export function CamposRegistro({
  campos,
  valores,
  errores = {},
  prefijo = '',
  onCambio,
}: {
  campos: CampoRegistro[]
  valores: Valores
  errores?: Partial<Record<string, string>>
  prefijo?: string
  onCambio: (id: string, valor: string) => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {camposVisibles(campos, valores).map((campo) => (
        <Campo
          key={campo.id}
          campo={campo}
          valor={valores[campo.id] ?? ''}
          error={errores[`${prefijo}${campo.id}`] ?? errores[campo.id]}
          id={`campo-${prefijo}${campo.id}`}
          onCambio={(v) => onCambio(campo.id, v)}
        />
      ))}
    </div>
  )
}

function Campo({
  campo,
  valor,
  error,
  id,
  onCambio,
}: {
  campo: CampoRegistro
  valor: string
  error?: string
  id: string
  onCambio: (valor: string) => void
}) {
  const descripcion = error ? `${id}-error` : undefined
  const mensaje = error && (
    <p id={descripcion} className="text-xs text-red-700">
      {error}
    </p>
  )
  const obligatorio = campo.requerido && (
    <span className="text-pink-700"> *</span>
  )

  if (campo.tipo === 'opciones')
    return (
      <fieldset
        className="flex flex-col gap-1 sm:col-span-full"
        aria-describedby={descripcion}
      >
        <legend className="mb-1 text-sm font-medium text-slate-700">
          {campo.etiqueta}
          {obligatorio}
        </legend>
        <div className="flex flex-wrap gap-2">
          {campo.opciones?.map((o, i) => (
            <label
              key={o.valor}
              className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm has-focus-visible:ring-2 has-focus-visible:ring-pink-200 ${
                valor === o.valor
                  ? 'border-pink-700 bg-pink-700 text-white'
                  : error
                    ? 'border-red-400 bg-white text-slate-700'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <input
                type="radio"
                id={i === 0 ? id : undefined}
                name={id}
                value={o.valor}
                checked={valor === o.valor}
                onChange={() => onCambio(o.valor)}
                className="sr-only"
              />
              {o.etiqueta}
            </label>
          ))}
        </div>
        {mensaje}
      </fieldset>
    )

  if (campo.tipo === 'casilla')
    return (
      <div className="flex flex-col justify-end gap-1">
        <label className="flex items-center gap-2 py-2 text-sm text-slate-700">
          <input
            type="checkbox"
            id={id}
            checked={valor === MARCADA}
            onChange={(e) => onCambio(e.target.checked ? MARCADA : '')}
            className="h-4 w-4 accent-pink-700"
          />
          {campo.etiqueta}
        </label>
        {mensaje}
      </div>
    )

  const comunes = {
    id,
    value: valor,
    placeholder: campo.placeholder,
    'aria-invalid': !!error,
    'aria-describedby': descripcion,
    className: `${estiloEntrada} ${error ? 'border-red-500' : 'border-slate-300'}`,
  }
  const lista = campo.sugerencias?.length ? `${id}-sugerencias` : undefined
  return (
    <div
      className={`flex flex-col gap-1 ${campo.tipo === 'parrafo' ? 'sm:col-span-full' : ''}`}
    >
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {campo.etiqueta}
        {obligatorio}
      </label>
      {campo.tipo === 'parrafo' ? (
        <textarea
          {...comunes}
          rows={3}
          onChange={(e) => onCambio(e.target.value)}
        />
      ) : (
        <input
          {...comunes}
          type={campo.tipo === 'fecha' ? 'date' : 'text'}
          list={lista}
          autoComplete="off"
          onChange={(e) => onCambio(e.target.value)}
        />
      )}
      {lista && (
        <datalist id={lista}>
          {campo.sugerencias?.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
      {mensaje}
    </div>
  )
}
