import { beforeEach, describe, expect, it } from 'vitest'
import { crearRepo } from './repo'
import { crearDB, type EiraDB } from './schema'

let db: EiraDB
let n = 0

beforeEach(() => {
  db = crearDB(`prueba-${n++}`)
})

describe('repo', () => {
  it('crea una paciente normalizada y la anota en la cola de salida', async () => {
    const repo = crearRepo(db)
    const p = await repo.crearPaciente({
      nombres: 'María José',
      apellidoPaterno: 'Núñez',
      apellidoMaterno: 'Peña',
      telefonos: ['+52 341 123 4567'],
    })

    expect(p.nombreBusqueda).toBe('maria jose nunez pena')
    expect(p.telefonos).toEqual(['3411234567'])
    expect(
      await db.pacientes.where('telefonos').equals('3411234567').count(),
    ).toBe(1)
    expect(await repo.cambiosPendientes()).toBe(1)
  })

  it('al actualizar recalcula el nombre de búsqueda y conserva createdAt', async () => {
    const repo = crearRepo(db)
    const p = await repo.crearPaciente({
      nombres: 'Ana',
      apellidoPaterno: 'Lopes',
      telefonos: [],
    })
    const q = await repo.actualizarPaciente(p.id, { apellidoPaterno: 'López' })

    expect(q.nombreBusqueda).toBe('ana lopez')
    expect(q.createdAt).toBe(p.createdAt)
    expect(await repo.cambiosPendientes()).toBe(2)
  })

  it('guarda consultas ligadas a la paciente', async () => {
    const repo = crearRepo(db)
    const p = await repo.crearPaciente({
      nombres: 'Ana',
      apellidoPaterno: 'López',
      telefonos: [],
    })
    await repo.crearConsulta({
      pacienteId: p.id,
      fecha: '2026-11-21',
      medico: 'Dra. Prueba',
      motivo: 'Revisión',
    })

    expect(await db.consultas.where('pacienteId').equals(p.id).count()).toBe(1)
  })
})
