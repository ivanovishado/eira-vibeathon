import { Link } from 'react-router-dom'
import type { Estudio } from '../db/schema'
import { formatearFecha, haceCuanto } from './fechas'
import { camposCorregidos, ETIQUETAS_ESTUDIO } from './formulario'
import type { EntradaConsulta, EntradaHistorial } from './historial'
import { camposConValor, fechaDeMarca } from './presentacion'

export function LineaTiempo({
  historial,
  resaltar,
}: {
  historial: EntradaHistorial[]
  resaltar?: string
}) {
  if (!historial.length)
    return (
      <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
        Todavía no hay consultas ni estudios registrados. Es su primera visita.
      </p>
    )
  return (
    <ol className="relative flex flex-col gap-4 border-l-2 border-pink-200 pl-4 sm:pl-6">
      {historial.map((e) => (
        <li
          key={e.tipo === 'consulta' ? e.consulta.id : e.estudio.id}
          className="relative"
        >
          <span
            aria-hidden
            className={`absolute top-4 -left-[23px] h-3 w-3 rounded-full border-2 border-white sm:-left-[31px] ${
              e.tipo === 'consulta' && e.corregidaPor
                ? 'bg-slate-300'
                : 'bg-pink-600'
            }`}
          />
          {e.tipo === 'consulta' ? (
            <TarjetaConsulta
              entrada={e}
              resaltada={e.consulta.id === resaltar}
            />
          ) : (
            <TarjetaEstudioSuelto estudio={e.estudio} />
          )}
        </li>
      ))}
    </ol>
  )
}

function EncabezadoFecha({ fecha }: { fecha: string }) {
  return (
    <p className="text-sm">
      <span className="font-semibold">{formatearFecha(fecha)}</span>{' '}
      <span className="text-slate-500">· {haceCuanto(fecha)}</span>
    </p>
  )
}

function TarjetaConsulta({
  entrada,
  resaltada,
}: {
  entrada: EntradaConsulta
  resaltada: boolean
}) {
  const { consulta, corregidaPor, corrige, brigada, estudios } = entrada
  const detalle = (
    <div className="mt-2 flex flex-col gap-3">
      {corrige && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Corrige la consulta registrada el{' '}
          {formatearFecha(fechaDeMarca(corrige.createdAt))}.{' '}
          <CambiosCorreccion lista={camposCorregidos(corrige, consulta)} />
        </p>
      )}
      <SignosVitales entrada={entrada} />
      <dl className="flex flex-col gap-2 text-sm">
        {camposConValor(consulta, 'clinica').map((c) => (
          <div key={c.id}>
            <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">
              {c.etiqueta}
            </dt>
            <dd className="whitespace-pre-line">{c.valor}</dd>
          </div>
        ))}
      </dl>
      {estudios.length > 0 && (
        <ul className="flex flex-col gap-1">
          {estudios.map((es) => (
            <li key={es.id}>
              <FilaEstudio estudio={es} fechaConsulta={consulta.fecha} />
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-slate-500">
        Atendió: {consulta.medico}
        {brigada ? ` · Brigada ${brigada.lugar}` : ''}
      </p>
    </div>
  )

  if (corregidaPor)
    return (
      <details className="rounded-xl border border-slate-200 bg-slate-100 p-3 text-slate-600">
        <summary className="cursor-pointer list-none">
          <EncabezadoFecha fecha={consulta.fecha} />
          <p className="mt-1 text-sm">
            <span className="mr-2 rounded bg-slate-300 px-1.5 py-0.5 text-xs font-medium text-slate-700">
              Corregida
            </span>
            <span className="line-through">{consulta.motivo}</span>
          </p>
          <p className="mt-1 text-xs">
            Sustituida por la corrección del{' '}
            {formatearFecha(fechaDeMarca(corregidaPor.createdAt))}. Toca para
            ver lo que decía.
          </p>
        </summary>
        {detalle}
      </details>
    )

  return (
    <article
      className={`rounded-xl border bg-white p-3 shadow-sm sm:p-4 ${
        resaltada
          ? 'border-green-500 ring-2 ring-green-200'
          : 'border-slate-200'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <EncabezadoFecha fecha={consulta.fecha} />
          <h3 className="mt-1 font-medium">
            {corrige && (
              <span className="mr-2 rounded bg-amber-100 px-1.5 py-0.5 align-middle text-xs font-medium text-amber-900">
                Corrección
              </span>
            )}
            {consulta.motivo}
          </h3>
        </div>
        <Link
          to={`/pacientes/${consulta.pacienteId}/consultas/nueva?corrige=${consulta.id}`}
          className="shrink-0 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Corregir
        </Link>
      </div>
      {detalle}
    </article>
  )
}

function CambiosCorreccion({ lista }: { lista: string[] }) {
  return lista.length ? (
    <span>
      Cambió: <strong>{lista.join(', ')}</strong>.
    </span>
  ) : (
    <span>Sin cambios en los campos de la consulta.</span>
  )
}

function SignosVitales({ entrada }: { entrada: EntradaConsulta }) {
  const signos = camposConValor(entrada.consulta, 'signos')
  if (!signos.length) return null
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {signos.map((s) => (
        <li key={s.id}>
          <span className="text-slate-500">{s.etiqueta}:</span> {s.valor}
        </li>
      ))}
    </ul>
  )
}

export function FilaEstudio({
  estudio,
  fechaConsulta,
}: {
  estudio: Estudio
  fechaConsulta?: string
}) {
  return (
    <p className="rounded-lg bg-pink-50 px-3 py-1.5 text-sm">
      <span className="font-medium text-pink-900">
        {ETIQUETAS_ESTUDIO[estudio.tipo]}
      </span>
      {estudio.fecha !== fechaConsulta && (
        <span className="text-slate-500">
          {' '}
          · {formatearFecha(estudio.fecha)}
        </span>
      )}
      <span className="text-slate-700">
        {' '}
        · {estudio.resultado || 'Sin resultado registrado'}
      </span>
    </p>
  )
}

function TarjetaEstudioSuelto({ estudio }: { estudio: Estudio }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <EncabezadoFecha fecha={estudio.fecha} />
      <div className="mt-2">
        <FilaEstudio estudio={estudio} fechaConsulta={estudio.fecha} />
      </div>
    </article>
  )
}
