interface Versionable {
  id: string
  corrigeA?: string
  retirado?: boolean
  createdAt: string
}

export interface Versionado<T extends Versionable> {
  /** Versión que vale hoy: la última de la cadena de correcciones. */
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
  const profundidad = new Map<string, number>()
  const raiz = (r: T) => {
    const vistos = new Set([r.id])
    let actual = r
    while (actual.corrigeA) {
      const anterior = porId.get(actual.corrigeA)
      if (!anterior || vistos.has(anterior.id)) break
      vistos.add(anterior.id)
      actual = anterior
    }
    profundidad.set(r.id, vistos.size)
    return actual.id
  }
  const grupos = new Map<string, T[]>()
  for (const r of registros) {
    const id = raiz(r)
    grupos.set(id, [...(grupos.get(id) ?? []), r])
  }
  return [...grupos.values()].map((g) => {
    // Una corrección va después de lo que corrige aunque el reloj del dispositivo
    // que la capturó esté atrasado.
    g.sort(
      (a, b) =>
        profundidad.get(a.id)! - profundidad.get(b.id)! ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id),
    )
    // Vale la versión más reciente entre las que nadie ha corregido: si dos dispositivos
    // corrigieron sin conexión por separado, gana la última captura, no la cadena más larga.
    const corregidas = new Set(g.map((r) => r.corrigeA))
    const vigente = g
      .filter((r) => !corregidas.has(r.id))
      .reduce((a, b) => (b.createdAt.localeCompare(a.createdAt) >= 0 ? b : a))
    return {
      origen: g[0],
      vigente,
      anteriores: g.filter((r) => r !== vigente).reverse(),
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
        anterior: orden.find((v) => v.id === version.corrigeA) ?? orden[i - 1],
      }),
    )
  }
  return cambios.sort((a, b) =>
    b.version.createdAt.localeCompare(a.version.createdAt),
  )
}
