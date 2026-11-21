import type { Brigada, Consulta, Estudio, TipoEstudio } from '../db/schema'

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

export type EntradaHistorial = EntradaConsulta | EntradaEstudio

const masReciente = (
  a: { fecha: string; createdAt: string },
  b: { fecha: string; createdAt: string },
) => b.fecha.localeCompare(a.fecha) || b.createdAt.localeCompare(a.createdAt)

/**
 * Línea de tiempo de una paciente, de lo más reciente a lo más antiguo. Los estudios
 * capturados en una consulta van dentro de ella; los sueltos son entradas propias.
 */
export function construirHistorial(
  consultas: Consulta[],
  estudios: Estudio[],
  brigadas: Brigada[] = [],
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
  return [...entradas, ...sueltos].sort((a, b) =>
    masReciente(
      { fecha: a.fecha, createdAt: creado(a) },
      { fecha: b.fecha, createdAt: creado(b) },
    ),
  )
}

const creado = (e: EntradaHistorial) =>
  e.tipo === 'consulta' ? e.consulta.createdAt : e.estudio.createdAt

export interface ResumenHistorial {
  /** Consultas vigentes (sin contar las que fueron corregidas). */
  totalConsultas: number
  ultimaConsulta?: EntradaConsulta
  /** Estudio más reciente de cada tipo, del más reciente al más antiguo. */
  ultimosEstudios: Estudio[]
}

export function resumirHistorial(
  historial: EntradaHistorial[],
): ResumenHistorial {
  const vigentes = historial.filter(
    (e): e is EntradaConsulta => e.tipo === 'consulta' && !e.corregidaPor,
  )
  const estudiosVigentes = historial.flatMap((e) =>
    e.tipo === 'estudio' ? [e.estudio] : e.corregidaPor ? [] : e.estudios,
  )
  const porTipo = new Map<TipoEstudio, Estudio>()
  for (const e of estudiosVigentes.sort(masReciente))
    if (!porTipo.has(e.tipo)) porTipo.set(e.tipo, e)
  return {
    totalConsultas: vigentes.length,
    ultimaConsulta: vigentes[0],
    ultimosEstudios: [...porTipo.values()],
  }
}
