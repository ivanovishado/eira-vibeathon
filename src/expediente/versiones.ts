interface Versionable {
  id: string
  corrigeA?: string
  retirado?: boolean
  createdAt: string
}

export interface Versionado<T extends Versionable> {
  /** Versión que vale hoy: la registrada más recientemente. */
  vigente: T
  /** Versiones sustituidas, de la más reciente a la más antigua. */
  anteriores: T[]
  /** Primera versión registrada. */
  origen: T
}

/**
 * Agrupa las versiones de cada registro siguiendo `corrigeA` hasta la original. Si dos
 * dispositivos corrigen lo mismo sin conexión, vale la corrección más reciente y la
 * otra queda como versión anterior.
 */
export function agruparVersiones<T extends Versionable>(
  registros: T[],
): Versionado<T>[] {
  const porId = new Map(registros.map((r) => [r.id, r]))
  const raiz = (r: T) => {
    const vistos = new Set([r.id])
    let actual = r
    while (actual.corrigeA) {
      const anterior = porId.get(actual.corrigeA)
      if (!anterior || vistos.has(anterior.id)) break
      vistos.add(anterior.id)
      actual = anterior
    }
    return actual.id
  }
  const grupos = new Map<string, T[]>()
  for (const r of registros) {
    const id = raiz(r)
    grupos.set(id, [...(grupos.get(id) ?? []), r])
  }
  return [...grupos.values()].map((g) => {
    g.sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    )
    return {
      origen: g[0],
      vigente: g[g.length - 1],
      anteriores: g.slice(0, -1).reverse(),
    }
  })
}

export type TipoCambio = 'registrado' | 'corregido' | 'quitado'

export interface Cambio<T extends Versionable> {
  tipo: TipoCambio
  version: T
  anterior?: T
}

/** Rastro de cambios de un grupo de registros, del más reciente al más antiguo. */
export function rastroDeCambios<T extends Versionable>(
  grupos: Versionado<T>[],
): Cambio<T>[] {
  const cambios: Cambio<T>[] = []
  for (const g of grupos) {
    const orden = [...g.anteriores].reverse().concat(g.vigente)
    orden.forEach((version, i) =>
      cambios.push({
        tipo:
          i === 0 ? 'registrado' : version.retirado ? 'quitado' : 'corregido',
        version,
        anterior: orden[i - 1],
      }),
    )
  }
  return cambios.sort((a, b) =>
    b.version.createdAt.localeCompare(a.version.createdAt),
  )
}
