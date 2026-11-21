import { useLiveQuery } from 'dexie-react-hooks'
import { useDeferredValue, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { sincronizacionConfigurada } from '../cuenta/config'
import { useCuenta } from '../cuenta/cuenta'
import { nombreCompleto, type DatosPaciente } from '../db/repo'
import { db, type Hoja, type Paciente } from '../db/schema'
import { formatearFecha } from '../expediente/fechas'
import { fechaDeMarca, horaDeMarca } from '../expediente/presentacion'
import {
  consultaDeLectura,
  pacienteDeLectura,
  TEXTO_MARCA,
  type MarcaLectura,
} from '../hojas/campos'
import { ETIQUETA_ESTADO } from '../hojas/estados'
import {
  leerHojasAhora,
  lectorSimulado,
  motivoSinLectura,
  useLecturaHojas,
} from '../hojas/fondo'
import {
  descartarHoja,
  reintentarLectura,
  restaurarHoja,
  type EleccionPaciente,
} from '../hojas/hojas'
import { useFotoHoja } from '../hojas/useImagen'
import { VisorFoto } from '../hojas/VisorFoto'
import { buscarPosiblesDuplicadas, ETIQUETA_MOTIVO } from '../lib/duplicadas'
import { calcularEdad, formatearFecha as fechaLarga } from '../lib/formato'
import {
  aDatosPaciente,
  CAMPOS_PACIENTE,
  validarPaciente,
  type ErroresPaciente,
  type FormPaciente,
} from '../lib/formPaciente'
import { useEnLinea } from '../lib/useEnLinea'
import { useIndicePacientes } from '../lib/useIndicePacientes'
import { FormularioConsulta } from './NuevaConsulta'

const ID_NUEVA = 'nueva'

export function RevisarHoja() {
  const { hojaId = '' } = useParams()
  const hoja = useLiveQuery(
    async () => (await db.hojas.get(hojaId)) ?? null,
    [hojaId],
  )
  const [plegada, setPlegada] = useState(false)

  if (hoja === undefined)
    return <p className="text-sm text-slate-500">Cargando…</p>
  if (hoja === null)
    return (
      <section className="flex flex-col items-start gap-3">
        <h1 className="text-xl font-semibold">Hoja no encontrada</h1>
        <Link to="/hojas" className="text-pink-700 underline">
          Volver a las hojas
        </Link>
      </section>
    )

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-6">
      <aside
        className="sticky z-[5] -mx-4 border-b border-slate-300 bg-slate-100 lg:top-[calc(var(--alto-encabezado,3.5rem)+1rem)] lg:mx-0 lg:overflow-hidden lg:rounded-xl lg:border"
        style={{ top: 'var(--alto-encabezado, 3.5rem)' }}
      >
        <div className="flex items-center justify-between px-4 py-1.5 text-sm lg:px-3">
          <span className="font-medium text-slate-700">Foto de la hoja</span>
          <button
            type="button"
            onClick={() => setPlegada((p) => !p)}
            aria-expanded={!plegada}
            className="text-pink-700 underline lg:hidden"
          >
            {plegada ? 'Mostrar foto' : 'Plegar foto'}
          </button>
        </div>
        <div
          className={`h-[40dvh] lg:block lg:h-[calc(100dvh-var(--alto-encabezado,3.5rem)-5rem)] ${plegada ? 'hidden' : ''}`}
        >
          <FotoHoja hoja={hoja} />
        </div>
      </aside>
      <div className="min-w-0">
        <Revision key={hoja.id} hoja={hoja} />
      </div>
    </div>
  )
}

function FotoHoja({ hoja }: { hoja: Hoja }) {
  const { estado, reintentar } = useFotoHoja(hoja)
  if (estado.fase === 'lista')
    return <VisorFoto url={estado.url} alt="Foto de la hoja en papel" />
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 bg-slate-800 p-4 text-center text-sm text-slate-200">
      {estado.fase === 'cargando' ? (
        'Cargando foto…'
      ) : (
        <>
          <p>{estado.motivo}</p>
          <button type="button" onClick={reintentar} className="underline">
            Reintentar
          </button>
        </>
      )}
    </div>
  )
}

function Revision({ hoja }: { hoja: Hoja }) {
  const [paso, setPaso] = useState<
    | { id: 'paciente' }
    | { id: 'consulta'; eleccion: EleccionPaciente; sinGuardar?: Paciente }
  >({ id: 'paciente' })
  const { valores, marcas } = useMemo(
    () => consultaDeLectura(hoja.lectura),
    [hoja.lectura],
  )

  if (hoja.estado === 'confirmada' || hoja.estado === 'descartada')
    return <HojaCerrada hoja={hoja} />

  if (paso.id === 'consulta') {
    const pacienteId =
      'pacienteId' in paso.eleccion ? paso.eleccion.pacienteId : ID_NUEVA
    return (
      <FormularioConsulta
        key={pacienteId}
        pacienteId={pacienteId}
        hoja={{
          hojaId: hoja.id,
          eleccion: paso.eleccion,
          pacienteSinGuardar: paso.sinGuardar,
          valores,
          marcas,
          encabezado: (
            <>
              <button
                type="button"
                onClick={() => setPaso({ id: 'paciente' })}
                className="text-sm text-pink-700 underline"
              >
                ← Paso 1: paciente
              </button>
              <h1 className="mt-1 text-xl font-semibold">
                Paso 2 de 2: consulta
              </h1>
            </>
          ),
        }}
      />
    )
  }

  return (
    <PasoPaciente
      hoja={hoja}
      onElegir={(eleccion, sinGuardar) =>
        setPaso({ id: 'consulta', eleccion, sinGuardar })
      }
    />
  )
}

function EstadoLectura({ hoja }: { hoja: Hoja }) {
  const enLinea = useEnLinea()
  const cuenta = useCuenta()
  const lectura = useLecturaHojas()
  if (hoja.estado === 'por-revisar') {
    const n =
      (hoja.lectura?.dudosos.length ?? 0) + (hoja.lectura?.ilegibles.length ?? 0)
    return (
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
        Revisa cada campo contra la foto.{' '}
        {n > 0 &&
          `${n === 1 ? 'Un campo quedó resaltado' : `${n} campos quedaron resaltados`} porque no se leyó con seguridad.`}
      </p>
    )
  }
  if (hoja.estado === 'error')
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
        <span>
          No se pudo leer la hoja{hoja.errorLectura && `: ${hoja.errorLectura}`}.
          Puedes reintentar o pasarla a mano.
        </span>
        <button
          type="button"
          onClick={() =>
            void reintentarLectura(hoja.id).then(() => leerHojasAhora())
          }
          className="font-medium underline"
        >
          Reintentar lectura
        </button>
      </div>
    )
  const motivo =
    hoja.estado === 'leyendo'
      ? 'Se está leyendo; los campos se llenarán solos si no has escrito nada.'
      : (motivoSinLectura({
          configurado: sincronizacionConfigurada,
          simulado: lectorSimulado,
          enLinea,
          conCuenta: Boolean(cuenta),
          error: lectura.error,
        }) ?? 'Se mandará a leer en un momento.')
  return (
    <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">
      Aún no hay lectura. {motivo} También puedes pasarla a mano viendo la foto.
    </p>
  )
}

function PasoPaciente({
  hoja,
  onElegir,
}: {
  hoja: Hoja
  onElegir: (eleccion: EleccionPaciente, sinGuardar?: Paciente) => void
}) {
  const indice = useIndicePacientes()
  const leida = useMemo(() => pacienteDeLectura(hoja.lectura), [hoja.lectura])
  // Mientras nadie escriba, el formulario sigue a la lectura (puede llegar después).
  const [editado, setForm] = useState<FormPaciente>()
  const form = editado ?? leida.form
  const [editados, setEditados] = useState<ReadonlySet<string>>(new Set())
  const [errores, setErrores] = useState<ErroresPaciente>({})
  const [otraPersona, setOtraPersona] = useState(false)
  const [busqueda, setBusqueda] = useState('')

  const diferido = useDeferredValue(form)
  const posibles = useMemo(
    () =>
      indice &&
      buscarPosiblesDuplicadas(
        indice.pacientes.values(),
        aDatosPaciente(diferido),
      ),
    [indice, diferido],
  )
  const encontradas = useMemo(
    () => (indice && busqueda.trim() ? indice.buscar(busqueda, 5) : undefined),
    [indice, busqueda],
  )

  function cambiar(campo: keyof FormPaciente, valor: string) {
    setEditados((e) => new Set(e).add(campo))
    setForm((f) => ({ ...(f ?? leida.form), [campo]: valor }))
    setErrores((e) => ({ ...e, [campo]: undefined }))
    setOtraPersona(false)
  }

  function crearNueva() {
    const nuevos = validarPaciente(form)
    setErrores(nuevos)
    if (Object.keys(nuevos).length || !indice) return
    const datos: DatosPaciente = aDatosPaciente(form)
    if (
      buscarPosiblesDuplicadas(indice.pacientes.values(), datos).total > 0 &&
      !otraPersona
    ) {
      setOtraPersona(false)
      document.getElementById('confirmar-otra')?.focus()
      return
    }
    const t = new Date().toISOString()
    onElegir(
      { nueva: datos },
      { ...datos, id: ID_NUEVA, nombreBusqueda: '', createdAt: t, updatedAt: t },
    )
  }

  const marca = (c: keyof FormPaciente): MarcaLectura | undefined =>
    editados.has(c) ? undefined : leida.marcas[c]
  const hayPosibles = (posibles?.total ?? 0) > 0

  return (
    <section className="flex flex-col gap-4">
      <div>
        <Link to="/hojas" className="text-sm text-pink-700 underline">
          ← Hojas
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Paso 1 de 2: paciente</h1>
        <p className="text-sm text-slate-600">
          {ETIQUETA_ESTADO[hoja.estado]} · fotografiada el{' '}
          {formatearFecha(fechaDeMarca(hoja.createdAt))} a las{' '}
          {horaDeMarca(hoja.createdAt)}
          {hoja.capturadaPor && ` por ${hoja.capturadaPor}`}
        </p>
      </div>

      <EstadoLectura hoja={hoja} />

      <fieldset className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <legend className="px-1 text-sm font-semibold text-slate-800">
          Datos de la paciente en la hoja
        </legend>
        {(Object.keys(CAMPOS_PACIENTE) as (keyof FormPaciente)[]).map((c) => {
          const m = marca(c)
          const id = `paciente-${c}`
          return (
            <div key={c} className="flex flex-col gap-1">
              <label htmlFor={id} className="text-sm font-medium text-slate-700">
                {CAMPOS_PACIENTE[c].etiqueta}
                {(c === 'nombres' || c === 'apellidoPaterno') && (
                  <span className="text-pink-700"> *</span>
                )}
              </label>
              <input
                id={id}
                type={CAMPOS_PACIENTE[c].fecha ? 'date' : 'text'}
                value={form[c]}
                onChange={(e) => cambiar(c, e.target.value)}
                autoComplete="off"
                aria-invalid={!!errores[c]}
                aria-describedby={m ? `${id}-marca` : undefined}
                className={`rounded-lg border bg-white px-3 py-2 text-base outline-none focus:border-pink-600 focus:ring-2 focus:ring-pink-200 sm:text-sm ${errores[c] ? 'border-red-500' : m ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-200' : 'border-slate-300'}`}
              />
              {m && (
                <p id={`${id}-marca`} className="text-xs text-amber-800">
                  {TEXTO_MARCA[m]}
                </p>
              )}
              {errores[c] && <p className="text-xs text-red-700">{errores[c]}</p>}
            </div>
          )
        })}
      </fieldset>

      <section className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-800">
          ¿Ya tiene expediente?
        </h2>
        {hayPosibles ? (
          <ul className="flex flex-col gap-2">
            {posibles!.duplicadas.map(({ paciente, motivos }) => (
              <OpcionPaciente
                key={paciente.id}
                paciente={paciente}
                detalle={`Coincide: ${motivos.map((m) => ETIQUETA_MOTIVO[m]).join(', ')}`}
                onElegir={() => onElegir({ pacienteId: paciente.id })}
              />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-600">
            No encontramos pacientes parecidas con estos datos.
          </p>
        )}
        <label className="mt-2 flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Buscar otra paciente</span>
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Nombre o celular"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-base outline-none focus:border-pink-600 focus:ring-2 focus:ring-pink-200 sm:text-sm"
          />
        </label>
        {encontradas && (
          <ul className="flex flex-col gap-2">
            {encontradas.pacientes.length === 0 && (
              <li className="text-sm text-slate-500">Sin resultados.</li>
            )}
            {encontradas.pacientes.map((p) => (
              <OpcionPaciente
                key={p.id}
                paciente={p}
                onElegir={() => onElegir({ pacienteId: p.id })}
              />
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4">
        {hayPosibles && (
          <label className="flex items-start gap-2 text-sm">
            <input
              id="confirmar-otra"
              type="checkbox"
              checked={otraPersona}
              onChange={(e) => setOtraPersona(e.target.checked)}
              className="mt-0.5"
            />
            Revisé las coincidencias y es otra persona.
          </label>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  '¿Descartar esta hoja? No se borra: queda en Descartadas.',
                )
              )
                void descartarHoja(hoja.id)
            }}
            className="text-sm text-slate-600 underline"
          >
            Descartar hoja
          </button>
          <button
            type="button"
            onClick={crearNueva}
            disabled={!indice || (hayPosibles && !otraPersona)}
            className="rounded-lg bg-pink-700 px-5 py-2.5 text-sm font-medium text-white shadow hover:bg-pink-800 disabled:opacity-50"
          >
            Paciente nueva: seguir a la consulta
          </button>
        </div>
      </div>
    </section>
  )
}

function OpcionPaciente({
  paciente: p,
  detalle,
  onElegir,
}: {
  paciente: Paciente
  detalle?: string
  onElegir: () => void
}) {
  const edad = calcularEdad(p.fechaNacimiento)
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
      <div className="min-w-0 text-sm">
        <p className="font-medium">{nombreCompleto(p)}</p>
        <p className="text-slate-600">
          {[
            p.fechaNacimiento &&
              `${fechaLarga(p.fechaNacimiento)}${edad !== undefined ? ` (${edad} años)` : ''}`,
            p.comunidad,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {detalle && <p className="text-xs text-amber-800">{detalle}</p>}
      </div>
      <button
        type="button"
        onClick={onElegir}
        className="shrink-0 rounded-lg border border-pink-300 px-3 py-1.5 text-sm font-medium text-pink-800 hover:bg-pink-50"
      >
        Es ella
      </button>
    </li>
  )
}

function HojaCerrada({ hoja }: { hoja: Hoja }) {
  const paciente = useLiveQuery(
    () => (hoja.pacienteId ? db.pacientes.get(hoja.pacienteId) : undefined),
    [hoja.pacienteId],
  )
  return (
    <section className="flex flex-col gap-3">
      <Link to="/hojas" className="text-sm text-pink-700 underline">
        ← Hojas
      </Link>
      <h1 className="text-xl font-semibold">
        Hoja {ETIQUETA_ESTADO[hoja.estado].toLowerCase()}
      </h1>
      <p className="text-sm text-slate-600">
        Fotografiada el {formatearFecha(fechaDeMarca(hoja.createdAt))} a las{' '}
        {horaDeMarca(hoja.createdAt)}
        {hoja.capturadaPor && ` por ${hoja.capturadaPor}`}.
      </p>
      {hoja.estado === 'confirmada' ? (
        hoja.pacienteId && (
          <Link
            to={`/pacientes/${hoja.pacienteId}`}
            className="self-start rounded-lg bg-pink-700 px-4 py-2 text-sm font-medium text-white hover:bg-pink-800"
          >
            Ver expediente{paciente ? ` de ${nombreCompleto(paciente)}` : ''}
          </Link>
        )
      ) : (
        <button
          type="button"
          onClick={() => void restaurarHoja(hoja.id)}
          className="self-start rounded-lg border border-pink-300 px-4 py-2 text-sm font-medium text-pink-800 hover:bg-pink-50"
        >
          Regresar a la bandeja
        </button>
      )}
    </section>
  )
}
