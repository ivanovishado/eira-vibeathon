import { describe, expect, it } from 'vitest'
import { normalizarTelefono, normalizarTexto } from './normalize'

describe('normalizarTexto', () => {
  it('quita acentos, mayúsculas y signos', () => {
    expect(normalizarTexto('  María-José  Núñez ')).toBe('maria jose nunez')
  })
})

describe('normalizarTelefono', () => {
  it('deja los 10 dígitos nacionales', () => {
    expect(normalizarTelefono('+52 1 (341) 123-4567')).toBe('3411234567')
    expect(normalizarTelefono('341 123 4567')).toBe('3411234567')
  })
})
