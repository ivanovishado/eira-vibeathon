import { describe, expect, it } from 'vitest'
import { aFilaRemota, aRegistroLocal, aSnake } from './filas'
import { TABLAS_SINCRONIZADAS } from './tablas'

describe('filas', () => {
  it('convierte nombres de campo a snake_case', () => {
    expect(aSnake('apellidoPaterno')).toBe('apellido_paterno')
    expect(aSnake('corrigeA')).toBe('corrige_a')
    expect(aSnake('id')).toBe('id')
  })

  it('manda todos los campos, con null para los vacíos', () => {
    const fila = aFilaRemota(TABLAS_SINCRONIZADAS.consultas, {
      id: 'c1',
      pacienteId: 'p1',
      fecha: '2026-11-21',
      medico: 'Dra. Prueba',
      motivo: 'Revisión',
      signosVitales: { pesoKg: 60 },
      createdAt: '2026-11-21T10:00:00.000Z',
    })
    expect(fila).toMatchObject({
      paciente_id: 'p1',
      signos_vitales: { pesoKg: 60 },
      corrige_a: null,
      brigada_id: null,
    })
    expect(Object.keys(fila)).toHaveLength(
      TABLAS_SINCRONIZADAS.consultas.campos.length,
    )
  })

  it('al bajar omite nulos y columnas del servidor y normaliza marcas de tiempo', () => {
    const registro = aRegistroLocal(TABLAS_SINCRONIZADAS.pacientes, {
      id: 'p1',
      nombres: 'Ana',
      apellido_paterno: 'Ficticia',
      apellido_materno: null,
      telefonos: ['3410000001'],
      fecha_nacimiento: '1980-01-02',
      nombre_busqueda: 'ana ficticia',
      created_at: '2026-11-21T10:00:00.123+00:00',
      updated_at: '2026-11-21T16:30:00-06:00',
      creado_por: 'u1',
      servidor_xid: '42',
    })
    expect(registro).toEqual({
      id: 'p1',
      nombres: 'Ana',
      apellidoPaterno: 'Ficticia',
      telefonos: ['3410000001'],
      fechaNacimiento: '1980-01-02',
      nombreBusqueda: 'ana ficticia',
      createdAt: '2026-11-21T10:00:00.123Z',
      updatedAt: '2026-11-21T22:30:00.000Z',
    })
  })
})
