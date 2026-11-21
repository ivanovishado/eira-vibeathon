import { describe, expect, it } from 'vitest'
import type { AtencionExterna, Consulta, Estudio } from '../db/schema'
import { claveEntrada, construirHistorial, resumirHistorial } from './historial'

const consulta = (
  id: string,
  fecha: string,
  extra: Partial<Consulta> = {},
): Consulta => ({
  id,
  pacienteId: 'p1',
  fecha,
  medico: 'Dra. Prueba',
  motivo: 'Revisión',
  createdAt: `${fecha}T10:00:00.000Z`,
  ...extra,
})

const estudio = (
  id: string,
  tipo: Estudio['tipo'],
  fecha: string,
  consultaId?: string,
): Estudio => ({
  id,
  pacienteId: 'p1',
  consultaId,
  tipo,
  fecha,
  resultado: 'Normal',
  createdAt: `${fecha}T10:00:00.000Z`,
})

describe('construirHistorial', () => {
  it('ordena de lo más reciente a lo más antiguo y agrupa estudios por consulta', () => {
    const h = construirHistorial(
      [consulta('a', '2024-05-01'), consulta('b', '2026-02-10')],
      [
        estudio('e1', 'mastografia', '2024-05-01', 'a'),
        estudio('e2', 'nutricion', '2025-01-15'),
      ],
      [
        {
          id: 'br',
          fecha: '2026-02-10',
          lugar: 'Lugar ficticio',
          createdAt: '',
        },
      ],
    )
    expect(h.map(claveEntrada)).toEqual(['b', 'e2', 'a'])
    const a = h[2]
    expect(a.tipo === 'consulta' && a.estudios.map((e) => e.id)).toEqual(['e1'])
  })

  it('relaciona correcciones con la consulta original', () => {
    const original = consulta('a', '2026-02-10')
    const c1 = consulta('b', '2026-02-10', {
      corrigeA: 'a',
      createdAt: '2026-02-10T11:00:00.000Z',
    })
    const c2 = consulta('c', '2026-02-10', {
      corrigeA: 'a',
      createdAt: '2026-02-10T12:00:00.000Z',
    })
    const h = construirHistorial([original, c2, c1], [])
    const porId = Object.fromEntries(
      h.map((e) => [e.tipo === 'consulta' ? e.consulta.id : '', e]),
    )
    expect(h.map((e) => e.tipo === 'consulta' && e.consulta.id)).toEqual([
      'c',
      'b',
      'a',
    ])
    expect(porId.a).toMatchObject({ corregidaPor: { id: 'c' } })
    expect(porId.b).toMatchObject({ corrige: { id: 'a' } })
    expect(porId.b).toMatchObject({ corregidaPor: { id: 'c' } })
    expect(porId.c).not.toHaveProperty('corregidaPor.id')

    const r = resumirHistorial(h)
    expect(r.totalConsultas).toBe(1)
    expect(r.ultimaConsulta?.consulta.id).toBe('c')
  })
})

describe('resumirHistorial', () => {
  it('ignora consultas corregidas y sus estudios', () => {
    const h = construirHistorial(
      [
        consulta('a', '2025-01-01'),
        consulta('b', '2026-02-10'),
        consulta('c', '2026-02-10', {
          corrigeA: 'b',
          createdAt: '2026-02-11T00:00:00.000Z',
        }),
      ],
      [
        estudio('e1', 'mastografia', '2025-01-01', 'a'),
        estudio('e2', 'mastografia', '2026-02-10', 'b'),
        estudio('e3', 'ultrasonido', '2026-02-10', 'c'),
        estudio('e4', 'nutricion', '2025-06-01'),
      ],
    )
    const r = resumirHistorial(h)
    expect(r.totalConsultas).toBe(2)
    expect(r.ultimaConsulta?.consulta.id).toBe('c')
    expect(r.ultimosEstudios.map((e) => e.id)).toEqual(['e3', 'e4', 'e1'])
  })

  it('funciona sin historial', () => {
    expect(resumirHistorial([])).toEqual({
      totalConsultas: 0,
      ultimaConsulta: undefined,
      ultimosEstudios: [],
      externasDesdeUltima: [],
    })
  })
})

const externa = (
  id: string,
  fecha: string,
  extra: Partial<AtencionExterna> = {},
): AtencionExterna => ({
  id,
  pacienteId: 'p1',
  tipo: 'consulta',
  fecha,
  resumen: 'Nutrición',
  createdAt: `${fecha}T10:00:00.000Z`,
  ...extra,
})

describe('atención fuera de EIRA desde la última consulta', () => {
  const resumir = (consultas: Consulta[], externas: AtencionExterna[]) =>
    resumirHistorial(
      construirHistorial(consultas, [], [], externas),
    ).externasDesdeUltima.map((a) => a.id)

  it('sin consultas, muestra todo lo registrado', () => {
    expect(resumir([], [externa('e1', '2026-03-01')])).toEqual(['e1'])
  })

  it('omite lo anterior a la última consulta y lo ya registrado en ella', () => {
    const c = consulta('c1', '2026-05-10')
    expect(
      resumir(
        [c],
        [
          externa('antes', '2026-04-01'),
          externa('en-consulta', '2026-05-10', { consultaId: 'c1' }),
          externa('despues', '2026-06-01'),
        ],
      ),
    ).toEqual(['despues'])
  })

  it('reconoce lo registrado en una consulta que después se corrigió', () => {
    const original = consulta('c1', '2026-05-10')
    const correccion = consulta('c2', '2026-05-10', {
      corrigeA: 'c1',
      createdAt: '2026-05-11T10:00:00.000Z',
    })
    expect(
      resumir(
        [original, correccion],
        [externa('e1', '2026-05-10', { consultaId: 'c1' })],
      ),
    ).toEqual([])
  })

  it('con fecha aproximada compara solo el mes', () => {
    expect(
      resumir(
        [consulta('c1', '2026-05-20')],
        [externa('e1', '2026-05-01', { fechaAproximada: true })],
      ),
    ).toEqual(['e1'])
  })
})
