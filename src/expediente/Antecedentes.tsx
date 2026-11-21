import { Link } from 'react-router-dom'
import type { Antecedente } from '../db/schema'
import {
  ATAJOS_ANTECEDENTE,
  CAMPOS_ANTECEDENTE,
  describirAntecedente,
  ETIQUETAS_TIPO_ANTECEDENTE,
  ordenarAntecedentes,
} from './antecedentes'
import { camposCambiados } from './camposRegistro'
import { formatearFecha } from './fechas'
import { fechaDeMarca } from './presentacion'
import { rutaRegistro } from './registros'
import { rastroDeCambios, type Versionado } from './versiones'

/** Antecedentes vigentes de un vistazo, con el cáncer destacado y rastro de cambios. */
export function Antecedentes({
  pacienteId,
  grupos,
}: {
  pacienteId: string
  grupos: Versionado<Antecedente>[]
}) {
  const vigentes = ordenarAntecedentes(
    grupos.filter((g) => !g.vigente.retirado),
  )
  const cancer = vigentes.filter((g) => g.vigente.tipo === 'cancer')
  const otros = vigentes.filter((g) => g.vigente.tipo !== 'cancer')
  const cambios = rastroDeCambios(grupos)

  return (
    <section
      aria-labelledby="titulo-antecedentes"
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="titulo-antecedentes"
          className="text-sm font-semibold tracking-wide text-slate-800 uppercase"
        >
          Antecedentes
        </h2>
        <Link
          to={rutaRegistro('antecedente', pacienteId)}
          className="rounded-lg border border-pink-300 px-2.5 py-1 text-xs font-medium text-pink-800 hover:bg-pink-50"
        >
          + Agregar antecedente
        </Link>
      </div>

      {vigentes.length === 0 ? (
        <div className="mt-2 text-sm text-slate-600">
          <p>
            Sin antecedentes registrados. Pregunta por cáncer en la paciente y
            en su familia.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {ATAJOS_ANTECEDENTE.slice(0, 2).map((a) => (
              <Link
                key={a.etiqueta}
                to={rutaRegistro('antecedente', pacienteId, {
                  valores: a.valores,
                })}
                className="rounded-full border border-pink-300 bg-white px-3 py-1 text-xs text-pink-800 hover:bg-pink-50"
              >
                + {a.etiqueta}
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-rose-50 p-3">
            <h3 className="text-xs font-semibold tracking-wide text-rose-900 uppercase">
              Cáncer
            </h3>
            {cancer.length ? (
              <ListaAntecedentes grupos={cancer} />
            ) : (
              <p className="mt-1 text-sm text-slate-600">Ninguno registrado.</p>
            )}
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <h3 className="text-xs font-semibold tracking-wide text-slate-700 uppercase">
              Otros antecedentes
            </h3>
            {otros.length ? (
              <ListaAntecedentes grupos={otros} conTipo />
            ) : (
              <p className="mt-1 text-sm text-slate-600">Ninguno registrado.</p>
            )}
          </div>
        </div>
      )}

      {cambios.length > 0 && (
        <details className="mt-3 text-xs text-slate-600">
          <summary className="cursor-pointer">
            Historial de cambios ({cambios.length})
          </summary>
          <ol className="mt-2 flex flex-col gap-1">
            {cambios.map((c) => (
              <li key={c.version.id}>
                <span className="text-slate-500">
                  {formatearFecha(fechaDeMarca(c.version.createdAt))}
                </span>{' '}
                ·{' '}
                <strong className="font-medium">
                  {c.tipo === 'registrado'
                    ? 'Registrado'
                    : c.tipo === 'quitado'
                      ? 'Quitado'
                      : 'Corregido'}
                </strong>
                : {ETIQUETAS_TIPO_ANTECEDENTE[c.version.tipo]} ·{' '}
                {quien(c.version)} · {describirAntecedente(c.version)}
                {c.tipo === 'corregido' && c.anterior && (
                  <span className="text-slate-500">
                    {' '}
                    (cambió:{' '}
                    {camposCambiados(
                      CAMPOS_ANTECEDENTE,
                      c.anterior,
                      c.version,
                    ).join(', ') || 'nada'}
                    )
                  </span>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  )
}

const quien = (a: Antecedente) =>
  a.ambito === 'personal' ? 'Paciente' : 'Familia'

function ListaAntecedentes({
  grupos,
  conTipo = false,
}: {
  grupos: Versionado<Antecedente>[]
  conTipo?: boolean
}) {
  return (
    <ul className="mt-1 flex flex-col gap-1.5">
      {grupos.map(({ vigente: a, anteriores }) => (
        <li
          key={a.id}
          className="flex items-start justify-between gap-2 text-sm"
        >
          <div className="min-w-0">
            <span
              className={`mr-1.5 rounded px-1.5 py-0.5 text-xs font-medium ${
                a.ambito === 'personal'
                  ? 'bg-pink-700 text-white'
                  : 'bg-white text-slate-700 ring-1 ring-slate-300'
              }`}
            >
              {quien(a)}
            </span>
            {conTipo && (
              <span className="text-slate-500">
                {ETIQUETAS_TIPO_ANTECEDENTE[a.tipo]}:{' '}
              </span>
            )}
            <span className="font-medium">{describirAntecedente(a)}</span>
            {a.notas && (
              <span className="block text-xs whitespace-pre-line text-slate-600">
                {a.notas}
              </span>
            )}
            {anteriores.length > 0 && (
              <span className="block text-xs text-slate-500">
                Corregido el {formatearFecha(fechaDeMarca(a.createdAt))}
              </span>
            )}
          </div>
          <Link
            to={rutaRegistro('antecedente', a.pacienteId, { corrige: a.id })}
            className="shrink-0 text-xs text-slate-600 underline"
            aria-label={`Corregir ${describirAntecedente(a)}`}
          >
            Corregir
          </Link>
        </li>
      ))}
    </ul>
  )
}
