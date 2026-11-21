import { describe, expect, it } from 'vitest'
import { nombreCompleto } from '../db/repo'
import type { Paciente } from '../db/schema'
import { buscarPosiblesDuplicadas, contenidas } from './duplicadas'
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

const existente = paciente({
  nombres: 'María José',
  apellidoPaterno: 'González',
  apellidoMaterno: 'Núñez',
  fechaNacimiento: '1990-02-14',
  telefonos: ['3411112222'],
})
const otra = paciente({
  nombres: 'Teresa',
  apellidoPaterno: 'Ruiz',
  fechaNacimiento: '1985-06-01',
  telefonos: ['3419998888'],
})
const pacientes = [existente, otra]

const nueva = {
  nombres: '',
  apellidoPaterno: '',
  telefonos: [] as string[],
}

const buscar = (datos: Partial<typeof nueva> & Record<string, unknown>) =>
  buscarPosiblesDuplicadas(pacientes, { ...nueva, ...datos })

describe('contenidas', () => {
  it('acepta que una lista tenga palabras de más', () => {
    expect(contenidas(['maria'], ['maria', 'jose'])).toBe(true)
    expect(contenidas(['maria', 'jose'], ['jose'])).toBe(true)
    expect(contenidas(['maria', 'elena'], ['maria', 'jose'])).toBe(false)
    expect(contenidas([], ['maria'])).toBe(false)
  })
})

describe('buscarPosiblesDuplicadas', () => {
  it('avisa por nombre parecido aunque esté mal escrito', () => {
    const r = buscar({
      nombres: 'Maria',
      apellidoPaterno: 'Gonzales',
      apellidoMaterno: 'Nuñes',
    })
    expect(r.duplicadas).toEqual([{ paciente: existente, motivos: ['nombre'] }])
  })

  it('acepta que falte el segundo apellido en uno de los dos', () => {
    const r = buscar({ nombres: 'María José', apellidoPaterno: 'Gonzalez' })
    expect(r.duplicadas.map((d) => d.paciente)).toEqual([existente])
  })

  it('no avisa si el segundo apellido es distinto', () => {
    const r = buscar({
      nombres: 'María José',
      apellidoPaterno: 'González',
      apellidoMaterno: 'Ramírez',
    })
    expect(r.total).toBe(0)
  })

  it('avisa por mismo celular aunque el nombre sea otro', () => {
    const r = buscar({
      nombres: 'Lucía',
      apellidoPaterno: 'Pérez',
      telefonos: ['+52 341 111 2222'],
    })
    expect(r.duplicadas).toEqual([
      { paciente: existente, motivos: ['celular'] },
    ])
  })

  it('la fecha de nacimiento sola no basta, con un apellido sí', () => {
    expect(
      buscar({
        nombres: 'Ana',
        apellidoPaterno: 'López',
        fechaNacimiento: '1985-06-01',
      }).total,
    ).toBe(0)
    const r = buscar({
      nombres: 'Ana',
      apellidoPaterno: 'Ruis',
      fechaNacimiento: '1985-06-01',
    })
    expect(r.duplicadas).toEqual([
      { paciente: otra, motivos: ['fechaNacimiento'] },
    ])
  })

  it('ordena por cuántos datos coinciden', () => {
    const r = buscar({
      nombres: 'Teresa',
      apellidoPaterno: 'Ruiz',
      fechaNacimiento: '1985-06-01',
      telefonos: ['3411112222'],
    })
    expect(r.duplicadas).toEqual([
      { paciente: otra, motivos: ['nombre', 'fechaNacimiento'] },
      { paciente: existente, motivos: ['celular'] },
    ])
  })

  it('sin datos no avisa nada', () => {
    expect(buscar({}).total).toBe(0)
  })
})
