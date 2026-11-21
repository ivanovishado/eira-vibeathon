import { describe, expect, it } from 'vitest'
import {
  aDatosPaciente,
  FORM_VACIO,
  formDesdeBusqueda,
  validarPaciente,
} from './formPaciente'

const hoy = new Date(2026, 10, 21)
const valido = { ...FORM_VACIO, nombres: 'Ana', apellidoPaterno: 'López' }

describe('validarPaciente', () => {
  it('pide nombre y primer apellido', () => {
    expect(Object.keys(validarPaciente(FORM_VACIO, hoy))).toEqual([
      'nombres',
      'apellidoPaterno',
    ])
    expect(validarPaciente(valido, hoy)).toEqual({})
  })

  it('revisa fecha, celular y CURP', () => {
    const errores = validarPaciente(
      {
        ...valido,
        fechaNacimiento: '2027-01-01',
        celular: '341 123',
        curp: 'ABC',
      },
      hoy,
    )
    expect(Object.keys(errores)).toEqual(['fechaNacimiento', 'celular', 'curp'])
    expect(
      validarPaciente({ ...valido, fechaNacimiento: '1890-01-01' }, hoy)
        .fechaNacimiento,
    ).toBe('Revisa el año.')
    expect(
      validarPaciente(
        {
          ...valido,
          celular: '+52 (341) 123-4567',
          curp: 'lopa800305mjcxxx09',
        },
        hoy,
      ),
    ).toEqual({})
  })
})

it('aDatosPaciente limpia espacios, normaliza celular y omite vacíos', () => {
  expect(
    aDatosPaciente({
      ...valido,
      nombres: '  María   José ',
      celular: '341 123 4567',
      comunidad: ' El Fresnito ',
      curp: 'lopa800305mjcxxx09',
    }),
  ).toEqual({
    nombres: 'María José',
    apellidoPaterno: 'López',
    apellidoMaterno: undefined,
    fechaNacimiento: undefined,
    telefonos: ['3411234567'],
    comunidad: 'El Fresnito',
    municipio: undefined,
    curp: 'LOPA800305MJCXXX09',
  })
})

describe('formDesdeBusqueda', () => {
  it('reparte el nombre buscado en nombres y apellidos', () => {
    expect(formDesdeBusqueda('maría josé núñez peña')).toMatchObject({
      nombres: 'María José',
      apellidoPaterno: 'Núñez',
      apellidoMaterno: 'Peña',
    })
    expect(formDesdeBusqueda('ana lópez')).toMatchObject({
      nombres: 'Ana',
      apellidoPaterno: 'López',
      apellidoMaterno: '',
    })
  })

  it('usa el celular si tiene 10 dígitos', () => {
    expect(formDesdeBusqueda('341 123 4567').celular).toBe('3411234567')
    expect(formDesdeBusqueda('4567').celular).toBe('')
  })
})
