import { useLiveQuery } from 'dexie-react-hooks'
import { db, TIPOS_ATENCION_EXTERNA } from '../db/schema'
import {
  ATAJOS_ANTECEDENTE,
  describirAntecedente,
  ETIQUETAS_TIPO_ANTECEDENTE,
  ordenarAntecedentes,
} from './antecedentes'
import {
  ETIQUETAS_TIPO_ATENCION,
  fechaAtencion,
  tituloAtencion,
} from './atencionExterna'
import { CamposRegistro } from './CamposRegistro'
import type { Valores } from './camposRegistro'
import { formatearFecha, haceCuanto, mesesEntre } from './fechas'
import {
  FILAS_CAPTURA,
  nuevaFila,
  type CapturaConsulta,
  type Errores,
} from './formulario'
import { construirHistorial, resumirHistorial } from './historial'
import { REGISTROS, type ClaseRegistro } from './registros'
import { agruparVersiones } from './versiones'

/** A partir de cuántos meses sin consulta se destaca el aviso. */
export const MESES_PARA_DESTACAR = 3

/**
 * Parte de la consulta que invita a preguntar qué pasó desde la última visita y a
 * registrarlo ahí mismo: atención fuera de EIRA y antecedentes nuevos.
 */
export function DesdeUltimaVisita({
  pacienteId,
  captura,
  errores,
  actualizar,
}: {
  pacienteId: string
  captura: CapturaConsulta
  errores: Errores
  actualizar: (cambio: (c: CapturaConsulta) => CapturaConsulta) => void
}) {
  const datos = useLiveQuery(async () => {
    const [consultas, externas, antecedentes] = await Promise.all([
      db.consultas.where('pacienteId').equals(pacienteId).toArray(),
      db.atencionesExternas.where('pacienteId').equals(pacienteId).toArray(),
      db.antecedentes.where('pacienteId').equals(pacienteId).toArray(),
    ])
    return {
      historial: construirHistorial(consultas, [], [], externas),
      antecedentes: ordenarAntecedentes(
        agruparVersiones(antecedentes).filter((g) => !g.vigente.retirado),
      ),
    }
  }, [pacienteId])
  if (!datos) return null

  const fechaConsulta = captura.valores.fecha || undefined
  // Si la consulta se captura con fecha pasada, lo posterior no cuenta.
  const antesDeConsulta = (fecha: string) =>
    !fechaConsulta || fecha <= fechaConsulta
  const resumen = resumirHistorial(
    datos.historial.filter(
      (e) => e.tipo !== 'consulta' || antesDeConsulta(e.fecha),
    ),
  )
  const externasDesdeUltima = resumen.externasDesdeUltima.filter(
    (a) =>
      !fechaConsulta ||
      (a.fechaAproximada
        ? a.fecha.slice(0, 7) <= fechaConsulta.slice(0, 7)
        : a.fecha <= fechaConsulta),
  )
  const ultima = resumen.ultimaConsulta?.consulta
  const meses =
    ultima && fechaConsulta ? mesesEntre(ultima.fecha, fechaConsulta) : 0
  const destacar = !ultima || meses >= MESES_PARA_DESTACAR

  const agregar = (clase: ClaseRegistro, valores: Valores) =>
    actualizar((c) => ({
      ...c,
      [FILAS_CAPTURA[clase]]: [
        ...(c[FILAS_CAPTURA[clase]] ?? []),
        nuevaFila(valores),
      ],
    }))
  const cambiar = (
    clase: ClaseRegistro,
    clave: string,
    id: string,
    v: string,
  ) =>
    actualizar((c) => ({
      ...c,
      [FILAS_CAPTURA[clase]]: (c[FILAS_CAPTURA[clase]] ?? []).map((f) =>
        f.clave === clave ? { ...f, valores: { ...f.valores, [id]: v } } : f,
      ),
    }))
  const quitar = (clase: ClaseRegistro, clave: string) =>
    actualizar((c) => ({
      ...c,
      [FILAS_CAPTURA[clase]]: (c[FILAS_CAPTURA[clase]] ?? []).filter(
        (f) => f.clave !== clave,
      ),
    }))

  const filas = (clase: ClaseRegistro, titulo: (v: Valores) => string) => {
    const lista = captura[FILAS_CAPTURA[clase]] ?? []
    if (!lista.length) return null
    return (
      <ul className="flex flex-col gap-3">
        {lista.map((f) => (
          <li
            key={f.clave}
            className="rounded-lg border border-sky-200 bg-sky-50/60 p-3"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <h4 className="font-medium text-sky-900">{titulo(f.valores)}</h4>
              <button
                type="button"
                onClick={() => quitar(clase, f.clave)}
                className="text-sm text-slate-600 underline"
                aria-label={`Quitar ${titulo(f.valores)}`}
              >
                Quitar
              </button>
            </div>
            <CamposRegistro
              campos={REGISTROS[clase].campos}
              valores={f.valores}
              errores={errores}
              prefijo={`${clase}.${f.clave}.`}
              onCambio={(id, v) => cambiar(clase, f.clave, id, v)}
            />
          </li>
        ))}
      </ul>
    )
  }

  const chip =
    'rounded-full border border-sky-300 bg-white px-3 py-1.5 text-sm text-sky-900 hover:bg-sky-50'

  return (
    <fieldset className="flex flex-col gap-4 rounded-xl border border-sky-200 bg-white p-4">
      <legend className="px-1 text-sm font-semibold text-slate-800">
        Desde la última visita
      </legend>

      <div
        role="note"
        className={`rounded-lg px-3 py-2 text-sm ${destacar ? 'bg-amber-50 text-amber-950' : 'bg-slate-50 text-slate-700'}`}
      >
        {ultima ? (
          <p>
            Su última consulta en EIRA fue el{' '}
            <strong>{formatearFecha(ultima.fecha)}</strong>
            {fechaConsulta && (
              <>
                {' '}
                (<strong>{haceCuanto(ultima.fecha, fechaConsulta)}</strong>)
              </>
            )}
            . Pregúntale qué pasó desde entonces: consultas con nutriólogo u
            otros especialistas, estudios, diagnósticos, tratamientos u
            hospitalizaciones, y si a alguien de su familia le diagnosticaron
            cáncer.
          </p>
        ) : (
          <p>
            <strong>Es su primera consulta en EIRA.</strong> Pregúntale por
            atención médica previa (nutriólogo, ginecología, estudios,
            tratamientos u hospitalizaciones) y por antecedentes de cáncer suyos
            y de su familia.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-slate-800">
          Atención fuera de EIRA
        </h3>
        {externasDesdeUltima.length > 0 && (
          <div className="text-sm text-slate-700">
            <p className="text-xs text-slate-500">Ya registrado:</p>
            <ul className="list-inside list-disc">
              {externasDesdeUltima.map((a) => (
                <li key={a.id}>
                  {fechaAtencion(a)} · {tituloAtencion(a)}
                </li>
              ))}
            </ul>
          </div>
        )}
        {filas('externa', (v) =>
          v.tipo
            ? ETIQUETAS_TIPO_ATENCION[
                v.tipo as keyof typeof ETIQUETAS_TIPO_ATENCION
              ]
            : 'Atención fuera de EIRA',
        )}
        <div className="flex flex-wrap gap-2">
          {TIPOS_ATENCION_EXTERNA.map((tipo) => (
            <button
              key={tipo}
              type="button"
              onClick={() => agregar('externa', { tipo })}
              className={chip}
            >
              + {ETIQUETAS_TIPO_ATENCION[tipo]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-slate-800">
          Antecedentes nuevos
        </h3>
        {datos.antecedentes.length > 0 ? (
          <p className="text-sm text-slate-700">
            <span className="text-xs text-slate-500">Ya registrados: </span>
            {datos.antecedentes
              .map(
                ({ vigente: a }) =>
                  `${ETIQUETAS_TIPO_ANTECEDENTE[a.tipo]} (${describirAntecedente(a)})`,
              )
              .join('; ')}
          </p>
        ) : (
          <p className="text-sm text-slate-600">
            No tiene antecedentes registrados.
          </p>
        )}
        {filas('antecedente', (v) =>
          [
            v.tipo
              ? ETIQUETAS_TIPO_ANTECEDENTE[
                  v.tipo as keyof typeof ETIQUETAS_TIPO_ANTECEDENTE
                ]
              : 'Antecedente',
            v.ambito === 'familiar'
              ? 'en la familia'
              : v.ambito === 'personal'
                ? 'de la paciente'
                : '',
          ]
            .filter(Boolean)
            .join(' '),
        )}
        <div className="flex flex-wrap gap-2">
          {ATAJOS_ANTECEDENTE.map((a) => (
            <button
              key={a.etiqueta}
              type="button"
              onClick={() => agregar('antecedente', a.valores)}
              className={chip}
            >
              + {a.etiqueta}
            </button>
          ))}
        </div>
      </div>
    </fieldset>
  )
}
