import { Link } from 'react-router-dom'
import type { AtencionExterna, Estudio } from '../db/schema'
import {
  CAMPOS_ATENCION_EXTERNA,
  ETIQUETAS_TIPO_ATENCION,
  fechaAtencion,
  tituloAtencion,
} from './atencionExterna'
import { camposCambiados } from './camposRegistro'
import { formatearFecha, haceCuanto } from './fechas'
import { camposCorregidos, ETIQUETAS_ESTUDIO } from './formulario'
import {
  claveEntrada,
  type EntradaConsulta,
  type EntradaExterna,
  type EntradaHistorial,
} from './historial'
import { camposConValor, fechaDeMarca } from './presentacion'
import { rutaRegistro } from './registros'

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
        Todavía no hay consultas, estudios ni atención fuera de EIRA
        registrados. Es su primera visita.
      </p>
    )
  return (
    <ol className="relative flex flex-col gap-4 border-l-2 border-pink-200 pl-4 sm:pl-6">
      {historial.map((e) => (
        <li key={claveEntrada(e)} className="relative">
          <span
            aria-hidden
            className={`absolute top-4 -left-[23px] h-3 w-3 border-2 border-white sm:-left-[31px] ${
              e.tipo === 'externa'
                ? `rotate-45 ${e.vigente.retirado ? 'bg-slate-300' : 'bg-sky-600'}`
                : `rounded-full ${
                    e.tipo === 'consulta' && e.corregidaPor
                      ? 'bg-slate-300'
                      : 'bg-pink-600'
                  }`
            }`}
          />
          {e.tipo === 'consulta' ? (
            <TarjetaConsulta
              entrada={e}
              resaltada={e.consulta.id === resaltar}
            />
          ) : e.tipo === 'estudio' ? (
            <TarjetaEstudioSuelto estudio={e.estudio} />
          ) : (
            <TarjetaExterna entrada={e} resaltada={e.vigente.id === resaltar} />
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

function EncabezadoAtencion({ atencion }: { atencion: AtencionExterna }) {
  return (
    <p className="text-sm">
      <span className="font-semibold">{fechaAtencion(atencion)}</span>{' '}
      <span className="text-slate-500">· {haceCuanto(atencion.fecha)}</span>
    </p>
  )
}

const EtiquetaFuera = () => (
  <span className="mr-2 rounded bg-sky-100 px-1.5 py-0.5 align-middle text-xs font-medium text-sky-900">
    Fuera de EIRA
  </span>
)

/** Atención recibida fuera de EIRA: se distingue por el color y la etiqueta. */
function TarjetaExterna({
  entrada,
  resaltada,
}: {
  entrada: EntradaExterna
  resaltada: boolean
}) {
  const { vigente: a, anteriores } = entrada
  const versiones = anteriores.length > 0 && (
    <details className="text-xs text-slate-600">
      <summary className="cursor-pointer">
        {a.retirado
          ? 'Ver lo que decía'
          : `Corregida el ${formatearFecha(fechaDeMarca(a.createdAt))} · ver versiones anteriores`}
      </summary>
      <ul className="mt-2 flex flex-col gap-2">
        {anteriores.map((v, i) => {
          const siguiente = i === 0 ? a : anteriores[i - 1]
          return (
            <li
              key={v.id}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2"
            >
              <p className="font-medium">
                Registrada el {formatearFecha(fechaDeMarca(v.createdAt))}
              </p>
              <p>
                {fechaAtencion(v)} · {tituloAtencion(v)} · {v.resumen}
                {v.lugar && ` · ${v.lugar}`}
              </p>
              {!siguiente.retirado && (
                <p className="text-slate-500">
                  Después cambió:{' '}
                  {camposCambiados(CAMPOS_ATENCION_EXTERNA, v, siguiente).join(
                    ', ',
                  ) || 'nada'}
                </p>
              )}
            </li>
          )
        })}
      </ul>
    </details>
  )

  if (a.retirado)
    return (
      <details className="rounded-xl border border-dashed border-slate-300 bg-slate-100 p-3 text-slate-600">
        <summary className="cursor-pointer list-none">
          <EncabezadoAtencion atencion={a} />
          <p className="mt-1 text-sm">
            <span className="mr-2 rounded bg-slate-300 px-1.5 py-0.5 text-xs font-medium text-slate-700">
              Quitada
            </span>
            <span className="line-through">{tituloAtencion(a)}</span>
          </p>
          <p className="mt-1 text-xs">
            Quitada del expediente el{' '}
            {formatearFecha(fechaDeMarca(a.createdAt))}. Toca para ver lo que
            decía.
          </p>
        </summary>
        <p className="mt-2 text-sm whitespace-pre-line">{a.resumen}</p>
        {versiones}
      </details>
    )

  return (
    <article
      aria-label={`Fuera de EIRA: ${tituloAtencion(a)}`}
      className={`rounded-xl border border-dashed bg-sky-50/70 p-3 sm:p-4 ${
        resaltada ? 'border-green-500 ring-2 ring-green-200' : 'border-sky-300'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <EncabezadoAtencion atencion={a} />
          <h3 className="mt-1 font-medium">
            <EtiquetaFuera />
            {tituloAtencion(a)}
            {a.especialidad && (
              <span className="font-normal text-slate-600">
                {' '}
                · {ETIQUETAS_TIPO_ATENCION[a.tipo]}
              </span>
            )}
          </h3>
        </div>
        <Link
          to={rutaRegistro('externa', a.pacienteId, { corrige: a.id })}
          className="shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          aria-label={`Corregir ${tituloAtencion(a)}`}
        >
          Corregir
        </Link>
      </div>
      <div className="mt-2 flex flex-col gap-2 text-sm">
        <p className="whitespace-pre-line">{a.resumen}</p>
        {a.lugar && (
          <p className="text-slate-600">
            <span className="text-slate-500">Dónde o con quién:</span> {a.lugar}
          </p>
        )}
        <p className="text-xs text-slate-500">
          Registrada el {formatearFecha(fechaDeMarca(entrada.origen.createdAt))}
          {a.consultaId ? ' durante una consulta de EIRA' : ''}.
        </p>
        {versiones}
      </div>
    </article>
  )
}
