import { describe, expect, it } from 'vitest'
import {
  calcularEdad,
  formatearFecha,
  formatearTelefono,
  hoyISO,
} from './formato'

const hoy = new Date(2026, 10, 21)

describe('calcularEdad', () => {
  it('cuenta años cumplidos', () => {
    expect(calcularEdad('1980-11-21', hoy)).toBe(46)
    expect(calcularEdad('1980-11-22', hoy)).toBe(45)
    expect(calcularEdad('1980-03-05', hoy)).toBe(46)
  })

  it('devuelve undefined sin fecha válida', () => {
    expect(calcularEdad(undefined, hoy)).toBeUndefined()
    expect(calcularEdad('05/03/1980', hoy)).toBeUndefined()
    expect(calcularEdad('1980-02-31', hoy)).toBeUndefined()
    expect(calcularEdad('1980-13-01', hoy)).toBeUndefined()
    expect(calcularEdad('1984-02-29', hoy)).toBe(42)
  })
})

it('formatea fechas, teléfonos y la fecha de hoy', () => {
  expect(formatearFecha('1980-03-05')).toBe('5 mar 1980')
  expect(formatearFecha('1980-13-01')).toBe('1980-13-01')
  expect(formatearTelefono('3411234567')).toBe('341 123 4567')
  expect(formatearTelefono('12345')).toBe('12345')
  expect(hoyISO(hoy)).toBe('2026-11-21')
})
