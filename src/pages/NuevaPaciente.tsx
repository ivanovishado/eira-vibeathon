import {
  useDeferredValue,
  useMemo,
  useState,
  type FormEvent,
  type InputHTMLAttributes,
} from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { TarjetaPaciente } from '../components/TarjetaPaciente'
import { repo } from '../db/repo'
import { buscarPosiblesDuplicadas, ETIQUETA_MOTIVO } from '../lib/duplicadas'
import { hoyISO } from '../lib/formato'
import {
  aDatosPaciente,
  formDesdeBusqueda,
  validarPaciente,
  type ErroresPaciente,
  type FormPaciente,
} from '../lib/formPaciente'
import { useIndicePacientes } from '../lib/useIndicePacientes'

export function NuevaPaciente() {
  const [params] = useSearchParams()
  const consulta = params.get('q') ?? ''
  const navigate = useNavigate()
  const indice = useIndicePacientes()
  const [form, setForm] = useState<FormPaciente>(() =>
    formDesdeBusqueda(consulta),
  )
  const [errores, setErrores] = useState<ErroresPaciente>({})
  const [esOtraPersona, setEsOtraPersona] = useState(false)
  const [errorRevision, setErrorRevision] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const formDiferido = useDeferredValue(form)
  const posibles = useMemo(
    () =>
      indice &&
      buscarPosiblesDuplicadas(
        indice.pacientes.values(),
        aDatosPaciente(formDiferido),
      ),
    [indice, formDiferido],
  )
  const hayDuplicadas = (posibles?.total ?? 0) > 0

  function cambiar(campo: keyof FormPaciente, valor: string) {
    setForm((f) => ({ ...f, [campo]: valor }))
    setErrores((e) => ({ ...e, [campo]: undefined }))
    setEsOtraPersona(false)
  }

  async function guardar(e: FormEvent) {
    e.preventDefault()
    const nuevos = validarPaciente(form)
    setErrores(nuevos)
    if (Object.keys(nuevos).length > 0) return
    // Sin índice no se puede revisar duplicadas; el botón está deshabilitado mientras carga.
    if (!indice) return
    const datosFinales = aDatosPaciente(form)
    const revisar =
      buscarPosiblesDuplicadas(indice.pacientes.values(), datosFinales).total >
      0
    if (revisar && !esOtraPersona) {
      setErrorRevision(true)
      return
    }
    setGuardando(true)
    try {
      const p = await repo.crearPaciente(datosFinales)
      navigate(`/pacientes/${p.id}`, { replace: true })
    } finally {
      setGuardando(false)
    }
  }

  const campo = (
    nombre: keyof FormPaciente,
    etiqueta: string,
    props: InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={nombre} className="text-sm font-medium">
        {etiqueta}
        {props.required && <span className="text-pink-700"> *</span>}
      </label>
      <input
        id={nombre}
        name={nombre}
        value={form[nombre]}
        onChange={(e) => cambiar(nombre, e.target.value)}
        aria-invalid={!!errores[nombre]}
        aria-describedby={errores[nombre] ? `${nombre}-error` : undefined}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 focus:border-pink-700 focus:ring-2 focus:ring-pink-200 focus:outline-none aria-invalid:border-red-600"
        {...props}
        required={false}
      />
      {errores[nombre] && (
        <p id={`${nombre}-error`} className="text-sm text-red-700">
          {errores[nombre]}
        </p>
      )}
    </div>
  )

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Nueva paciente</h1>

      <form
        noValidate
        onSubmit={guardar}
        className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {campo('nombres', 'Nombre(s)', {
            required: true,
            autoFocus: true,
            autoComplete: 'off',
          })}
          {campo('apellidoPaterno', 'Primer apellido', {
            required: true,
            autoComplete: 'off',
          })}
          {campo('apellidoMaterno', 'Segundo apellido', {
            autoComplete: 'off',
          })}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {campo('fechaNacimiento', 'Fecha de nacimiento', {
            type: 'date',
            max: hoyISO(),
            min: '1900-01-01',
          })}
          {campo('celular', 'Celular', {
            type: 'tel',
            inputMode: 'numeric',
            autoComplete: 'off',
            placeholder: '10 dígitos',
          })}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {campo('comunidad', 'Comunidad', {
            list: 'comunidades',
            autoComplete: 'off',
          })}
          {campo('municipio', 'Municipio', { autoComplete: 'off' })}
        </div>
        {campo('curp', 'CURP', {
          autoComplete: 'off',
          maxLength: 18,
          className:
            'rounded-lg border border-slate-300 bg-white px-3 py-2 uppercase focus:border-pink-700 focus:ring-2 focus:ring-pink-200 focus:outline-none aria-invalid:border-red-600 sm:max-w-xs',
        })}
        <datalist id="comunidades">
          {indice?.comunidades.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>

        {hayDuplicadas && posibles && (
          <div
            role="alert"
            className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3"
          >
            <div>
              <h2 className="font-medium text-amber-900">
                {posibles.total === 1
                  ? 'Ya hay un expediente parecido'
                  : `Ya hay ${posibles.total.toLocaleString('es-MX')} expedientes parecidos`}
              </h2>
              <p className="text-sm text-amber-900">
                Si es la misma paciente, abre su expediente en lugar de crear
                otro.
                {posibles.total > posibles.duplicadas.length &&
                  ` Se muestran los ${posibles.duplicadas.length} más parecidos; completa más datos para afinar.`}
              </p>
            </div>
            <ul className="flex flex-col gap-2">
              {posibles.duplicadas.map(({ paciente, motivos }) => (
                <li key={paciente.id}>
                  <TarjetaPaciente paciente={paciente}>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {motivos.map((m) => (
                        <span
                          key={m}
                          className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900"
                        >
                          {ETIQUETA_MOTIVO[m]}
                        </span>
                      ))}
                      <span className="ml-auto text-sm font-medium text-pink-700">
                        Abrir expediente →
                      </span>
                    </div>
                  </TarjetaPaciente>
                </li>
              ))}
            </ul>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={esOtraPersona}
                onChange={(e) => {
                  setEsOtraPersona(e.target.checked)
                  setErrorRevision(false)
                }}
                className="mt-0.5 size-4 accent-pink-700"
              />
              Revisé los expedientes parecidos y es otra persona.
            </label>
            {errorRevision && !esOtraPersona && (
              <p className="text-sm text-red-700">
                Abre el expediente existente o confirma que es otra persona para
                guardar.
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Link
            to={consulta ? `/?q=${encodeURIComponent(consulta)}` : '/'}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={guardando || !indice}
            className="rounded-lg bg-pink-700 px-4 py-2 text-sm font-medium text-white hover:bg-pink-800 disabled:opacity-50"
          >
            {!indice
              ? 'Cargando expedientes…'
              : hayDuplicadas
                ? 'Guardar como paciente nueva'
                : 'Guardar'}
          </button>
        </div>
      </form>
    </section>
  )
}
