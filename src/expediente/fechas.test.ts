import { describe, expect, it } from 'vitest'
import { edad, formatearFecha, haceCuanto, hoyLocal } from './fechas'

describe('fechas', () => {
  it('formatea en español de México', () => {
    expect(formatearFecha('2025-03-14')).toBe('14 mar 2025')
  })

  it('hoyLocal usa la fecha local', () => {
    expect(hoyLocal(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05')
  })

  it('calcula la edad cumplida', () => {
    expect(edad('1980-06-15', '2026-06-14')).toBe(45)
    expect(edad('1980-06-15', '2026-06-15')).toBe(46)
  })

  it('describe el tiempo transcurrido', () => {
    expect(haceCuanto('2026-11-21', '2026-11-21')).toBe('hoy')
    expect(haceCuanto('2026-11-20', '2026-11-21')).toBe('ayer')
    expect(haceCuanto('2026-11-01', '2026-11-21')).toBe('hace 20 días')
    expect(haceCuanto('2026-08-21', '2026-11-21')).toBe('hace 3 meses')
    expect(haceCuanto('2025-09-10', '2026-11-21')).toBe('hace 1 año y 2 meses')
    expect(haceCuanto('2024-11-21', '2026-11-21')).toBe('hace 2 años')
  })
})
