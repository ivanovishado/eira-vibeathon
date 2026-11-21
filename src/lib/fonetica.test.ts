import { describe, expect, it } from 'vitest'
import {
  claveFonetica,
  distancia,
  palabrasNombre,
  palabrasParecidas,
} from './fonetica'
import { normalizarTexto } from './normalize'

const clave = (s: string) => claveFonetica(normalizarTexto(s))

describe('claveFonetica', () => {
  it.each([
    ['Hernández', 'Hernandes'],
    ['Hernández', 'Ernandez'],
    ['González', 'Gonzales'],
    ['Núñez', 'Nuñes'],
    ['Vázquez', 'Basques'],
    ['Jiménez', 'Gimenez'],
    ['Yolanda', 'Iolanda'],
    ['Barragán', 'Baragan'],
    ['Cecilia', 'Sesilia'],
    ['Guillermina', 'Guiyermina'],
    ['Rodríguez', 'Rodrigues'],
  ])('%s y %s suenan igual', (a, b) => {
    expect(clave(a)).toBe(clave(b))
  })

  it('distingue nombres que suenan distinto', () => {
    expect(clave('García')).not.toBe(clave('Garza'))
    expect(clave('Peña')).not.toBe(clave('Pérez'))
    expect(clave('Gómez')).not.toBe(clave('Jiménez'))
  })
})

describe('palabrasNombre', () => {
  it('normaliza y quita partículas', () => {
    expect(palabrasNombre('María del Carmen de la Cruz')).toEqual([
      'maria',
      'carmen',
      'cruz',
    ])
  })
})

describe('palabrasParecidas', () => {
  it('tolera un error de dedo en palabras medianas y dos en largas', () => {
    expect(distancia('martinez', 'martnez')).toBe(1)
    expect(palabrasParecidas('martinez', 'martnez')).toBe(true)
    expect(palabrasParecidas('gutierrez', 'gutieres')).toBe(true)
    expect(palabrasParecidas('margarita', 'magarira')).toBe(true)
  })

  it('no confunde palabras cortas distintas', () => {
    expect(palabrasParecidas('ana', 'ada')).toBe(false)
    expect(palabrasParecidas('rosa', 'ruiz')).toBe(false)
    expect(palabrasParecidas('lopez', 'perez')).toBe(false)
  })
})
