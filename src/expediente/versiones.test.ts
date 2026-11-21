import { describe, expect, it } from 'vitest'
import { agruparVersiones, rastroDeCambios } from './versiones'

const v = (id: string, createdAt: string, corrigeA?: string) => ({
  id,
  createdAt,
  corrigeA,
})

describe('agruparVersiones', () => {
  it('la corrección vale aunque su reloj esté atrasado', () => {
    const [g] = agruparVersiones([
      v('a', '2026-11-21T10:00:00.000Z'),
      v('b', '2026-11-21T09:00:00.000Z', 'a'),
    ])
    expect(g.vigente.id).toBe('b')
    expect(g.origen.id).toBe('a')
  })

  it('entre dos correcciones de la misma versión vale la más reciente', () => {
    const [g] = agruparVersiones([
      v('a', '2026-11-21T10:00:00.000Z'),
      v('c', '2026-11-21T12:00:00.000Z', 'a'),
      v('b', '2026-11-21T11:00:00.000Z', 'a'),
    ])
    expect(g.vigente.id).toBe('c')
    expect(g.anteriores.map((x) => x.id)).toEqual(['b', 'a'])
  })

  it('un retiro más reciente vale aunque otra rama tenga más correcciones', () => {
    const [g] = agruparVersiones([
      v('a', '2026-11-21T10:00:00.000Z'),
      v('b', '2026-11-21T11:00:00.000Z', 'a'),
      v('c', '2026-11-21T12:00:00.000Z', 'b'),
      { ...v('d', '2026-11-21T13:00:00.000Z', 'a'), retirado: true },
    ])
    expect(g.vigente.id).toBe('d')
    expect(g.anteriores.map((x) => x.id)).toEqual(['c', 'b', 'a'])
  })
})

describe('rastroDeCambios', () => {
  it('compara cada corrección con la versión que corrigió', () => {
    const cambios = rastroDeCambios(
      agruparVersiones([
        v('a', '2026-11-21T10:00:00.000Z'),
        v('b', '2026-11-21T11:00:00.000Z', 'a'),
        v('c', '2026-11-21T12:00:00.000Z', 'a'),
      ]),
    )
    expect(cambios.map((c) => [c.version.id, c.anterior?.id])).toEqual([
      ['c', 'a'],
      ['b', 'a'],
      ['a', undefined],
    ])
  })
})
