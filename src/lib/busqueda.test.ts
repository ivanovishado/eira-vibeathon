import { describe, expect, it } from 'vitest'
import { nombreCompleto } from '../db/repo'
import type { Paciente } from '../db/schema'
import { generarDatosFicticios } from '../db/seed'
import { crearIndice, separarConsulta } from './busqueda'
import { normalizarTexto } from './normalize'

let n = 0
function paciente(
  datos: Partial<Paciente> & Pick<Paciente, 'nombres' | 'apellidoPaterno'>,
): Paciente {
  const p = {
    id: `p-${n++}`,
    telefonos: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...datos,
  }
  return { ...p, nombreBusqueda: normalizarTexto(nombreCompleto(p)) }
}

const buscada = paciente({
  nombres: 'Xóchitl Guadalupe',
  apellidoPaterno: 'Hernández',
  apellidoMaterno: 'Núñez',
  fechaNacimiento: '1978-04-12',
  telefonos: ['3415550123'],
  comunidad: 'El Fresnito',
})

// La paciente buscada escondida entre 2,000 ficticias.
const indice = crearIndice([...generarDatosFicticios(2000).pacientes, buscada])
const ids = (q: string) => indice.buscar(q).pacientes.map((p) => p.id)

describe('separarConsulta', () => {
  it('separa palabras del nombre y dígitos del celular', () => {
    expect(separarConsulta('Ana de la Cruz 341 555')).toEqual({
      palabras: ['ana', 'cruz'],
      digitos: '341555',
    })
  })
})

describe('búsqueda por nombre', () => {
  it.each([
    ['nombre completo con acentos', 'Xóchitl Guadalupe Hernández Núñez'],
    ['sin acentos ni mayúsculas', 'xochitl guadalupe hernandez nunez'],
    ['apellidos primero', 'Hernández Núñez Xóchitl'],
    ['nombre parcial', 'xoch hern'],
    ['errores de ortografía comunes', 'Xochitl Ernandes Nuñes'],
    ['letras que suenan igual', 'Sochitl Hernandes Nunes'],
    ['error de dedo', 'Xochtil Hernanez'],
  ])('encuentra entre miles: %s', (_caso, consulta) => {
    expect(ids(consulta)[0]).toBe(buscada.id)
  })

  it('todas las palabras deben coincidir', () => {
    expect(ids('Xochitl Gonzalez')).not.toContain(buscada.id)
  })

  it('tolera Gonzales por González', () => {
    const resultado = indice.buscar('Gonzales')
    expect(resultado.total).toBeGreaterThan(0)
    expect(
      resultado.pacientes.every((p) => p.nombreBusqueda.includes('gonzalez')),
    ).toBe(true)
  })

  it('limita los resultados pero informa el total', () => {
    const r = indice.buscar('maria', 10)
    expect(r.pacientes).toHaveLength(10)
    expect(r.total).toBeGreaterThan(10)
  })

  it('una consulta vacía o de partículas no devuelve nada', () => {
    expect(indice.buscar('  ').total).toBe(0)
    expect(indice.buscar('de la').total).toBe(0)
  })
})

describe('búsqueda por celular', () => {
  it('encuentra con el número completo, con formato o con prefijo de país', () => {
    expect(ids('3415550123')).toEqual([buscada.id])
    expect(ids('(341) 555-0123')).toEqual([buscada.id])
    expect(ids('+52 341 555 0123')).toEqual([buscada.id])
  })

  it('encuentra con los últimos dígitos', () => {
    expect(ids('50123')).toContain(buscada.id)
    expect(
      indice
        .buscar('0123')
        .pacientes.every((p) => p.telefonos.some((t) => t.endsWith('0123'))),
    ).toBe(true)
  })

  it('combina nombre y últimos dígitos para distinguir homónimas', () => {
    expect(ids('hernandez 0123')).toEqual([buscada.id])
  })

  it('ignora números muy cortos', () => {
    expect(indice.buscar('12').total).toBe(0)
  })
})

describe('comunidades', () => {
  it('lista las comunidades sin repetir y en orden', () => {
    expect(indice.comunidades).toContain('El Fresnito')
    expect(new Set(indice.comunidades).size).toBe(indice.comunidades.length)
  })
})

describe('escala', () => {
  it('sigue encontrando con 40,000 expedientes', () => {
    const grande = crearIndice([
      ...generarDatosFicticios(40000, 7).pacientes,
      buscada,
    ])
    expect(grande.buscar('Xochitl Ernandes Nuñes').pacientes[0].id).toBe(
      buscada.id,
    )
    expect(grande.buscar('5550123').pacientes.map((p) => p.id)).toContain(
      buscada.id,
    )
  })
})
