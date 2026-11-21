import type {
  AtencionExterna,
  Brigada,
  Consulta,
  Estudio,
  TipoEstudio,
} from '../db/schema'
import { agruparVersiones, type Versionado } from './versiones'

export interface EntradaConsulta {
  tipo: 'consulta'
  fecha: string
  consulta: Consulta
  estudios: Estudio[]
  brigada?: Brigada
  /** Consulta que corrige a esta (la más reciente si hay varias). */
  corregidaPor?: Consulta
  /** Consulta que esta corrige. */
  corrige?: Consulta
}

export interface EntradaEstudio {
  tipo: 'estudio'
  fecha: string
  estudio: Estudio
}

/** Atención recibida fuera de EIRA (versión vigente y las que sustituyó). */
export interface EntradaExterna extends Versionado<AtencionExterna> {
  tipo: 'externa'
  fecha: string
}

export type EntradaHistorial = EntradaConsulta | EntradaEstudio | EntradaExterna

const masReciente = (
  a: { fecha: string; createdAt: string },
  b: { fecha: string; createdAt: string },
) => b.fecha.localeCompare(a.fecha) || b.createdAt.localeCompare(a.createdAt)

/**
 * Línea de tiempo de una paciente, de lo más reciente a lo más antiguo. Los estudios
 * capturados en una consulta van dentro de ella; los sueltos son entradas propias. La
 * atención fuera de EIRA aparece una vez por registro, con su versión vigente.
 */
export function construirHistorial(
  consultas: Consulta[],
  estudios: Estudio[],
  brigadas: Brigada[] = [],
  externas: AtencionExterna[] = [],
): EntradaHistorial[] {
  const porId = new Map(consultas.map((c) => [c.id, c]))
  const brigadaPorId = new Map(brigadas.map((b) => [b.id, b]))
  // Si una consulta tiene varias correcciones, solo la más reciente queda vigente:
  // la original y las correcciones anteriores quedan sustituidas por ella.
  const correcciones = new Map<string, Consulta>()
  const ultimaCorreccion = new Map<string, Consulta>()
  for (const c of [...consultas].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  ))
    if (c.corrigeA) {
      const anterior = ultimaCorreccion.get(c.corrigeA)
      if (anterior) correcciones.set(anterior.id, c)
      ultimaCorreccion.set(c.corrigeA, c)
      correcciones.set(c.corrigeA, c)
    }

  const estudiosPorConsulta = new Map<string, Estudio[]>()
  const sueltos: EntradaEstudio[] = []
  for (const e of estudios) {
    if (e.consultaId && porId.has(e.consultaId)) {
      const lista = estudiosPorConsulta.get(e.consultaId) ?? []
      lista.push(e)
      estudiosPorConsulta.set(e.consultaId, lista)
    } else sueltos.push({ tipo: 'estudio', fecha: e.fecha, estudio: e })
  }

  const entradas: EntradaHistorial[] = consultas.map((c) => ({
    tipo: 'consulta',
    fecha: c.fecha,
    consulta: c,
    estudios: (estudiosPorConsulta.get(c.id) ?? []).sort(masReciente),
    brigada: c.brigadaId ? brigadaPorId.get(c.brigadaId) : undefined,
    corregidaPor: correcciones.get(c.id),
    corrige: c.corrigeA ? porId.get(c.corrigeA) : undefined,
  }))
  const atenciones: EntradaExterna[] = agruparVersiones(externas).map((g) => ({
    ...g,
    tipo: 'externa',
    fecha: g.vigente.fecha,
  }))
  return [...entradas, ...sueltos, ...atenciones].sort((a, b) =>
    masReciente(
      { fecha: a.fecha, createdAt: creado(a) },
      { fecha: b.fecha, createdAt: creado(b) },
    ),
  )
}

const creado = (e: EntradaHistorial) =>
  e.tipo === 'consulta'
    ? e.consulta.createdAt
    : e.tipo === 'estudio'
      ? e.estudio.createdAt
      : e.vigente.createdAt

/** Clave estable de una entrada de la línea de tiempo. */
export const claveEntrada = (e: EntradaHistorial) =>
  e.tipo === 'consulta'
    ? e.consulta.id
    : e.tipo === 'estudio'
      ? e.estudio.id
      : e.origen.id

export interface ResumenHistorial {
  /** Consultas vigentes (sin contar las que fueron corregidas). */
  totalConsultas: number
  ultimaConsulta?: EntradaConsulta
  /** Estudio más reciente de cada tipo, del más reciente al más antiguo. */
  ultimosEstudios: Estudio[]
  /** Atención fuera de EIRA posterior a la última consulta (o toda, si no hay). */
  externasDesdeUltima: AtencionExterna[]
}

export function resumirHistorial(
  historial: EntradaHistorial[],
): ResumenHistorial {
  const vigentes = historial.filter(
    (e): e is EntradaConsulta => e.tipo === 'consulta' && !e.corregidaPor,
  )
  const estudiosVigentes = historial.flatMap((e) =>
    e.tipo === 'estudio'
      ? [e.estudio]
      : e.tipo === 'consulta' && !e.corregidaPor
        ? e.estudios
        : [],
  )
  const porTipo = new Map<TipoEstudio, Estudio>()
  for (const e of estudiosVigentes.sort(masReciente))
    if (!porTipo.has(e.tipo)) porTipo.set(e.tipo, e)
  const ultimaConsulta = vigentes[0]
  return {
    totalConsultas: vigentes.length,
    ultimaConsulta,
    ultimosEstudios: [...porTipo.values()],
    externasDesdeUltima: historial.flatMap((e) =>
      e.tipo === 'externa' &&
      !e.vigente.retirado &&
      (!ultimaConsulta || e.fecha >= ultimaConsulta.fecha) &&
      e.vigente.consultaId !== ultimaConsulta?.consulta.id
        ? [e.vigente]
        : [],
    ),
  }
}
