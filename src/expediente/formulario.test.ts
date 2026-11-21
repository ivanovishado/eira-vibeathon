import { describe, expect, it } from 'vitest'
import type { Consulta } from '../db/schema'
import {
  aDatosConsulta,
  aDatosEstudios,
  camposCorregidos,
  capturaParaCorregir,
  capturaVacia,
  esCaptura,
  nuevaFila,
  nuevoEstudio,
  validarCaptura,
  type CapturaConsulta,
} from './formulario'

const base = (valores: CapturaConsulta['valores']): CapturaConsulta => ({
  valores: {
    fecha: '2026-11-21',
    medico: 'Dra. Prueba',
    motivo: 'Revisión',
    ...valores,
  },
  estudios: [],
})

const consulta: Consulta = {
  id: 'c1',
  pacienteId: 'p1',
  fecha: '2025-03-14',
  medico: 'Dra. Prueba',
  motivo: 'Dolor mamario',
  signosVitales: { pesoKg: 62.5, presionArterial: '120/80' },
  diagnostico: 'Sin hallazgos',
  createdAt: '2025-03-14T10:00:00.000Z',
}

describe('formulario de consulta', () => {
  it('una captura vacía trae la fecha de hoy y los valores recordados', () => {
    expect(capturaVacia({ medico: 'Dra. X' }, '2026-11-21').valores).toEqual({
      medico: 'Dra. X',
      fecha: '2026-11-21',
    })
  })

  it('exige los campos obligatorios', () => {
    const errores = validarCaptura({ valores: { fecha: '' }, estudios: [] })
    expect(Object.keys(errores).sort()).toEqual(['fecha', 'medico', 'motivo'])
  })

  it('valida números, rangos y formato de presión', () => {
    const errores = validarCaptura(
      base({
        'signosVitales.pesoKg': 'abc',
        'signosVitales.temperaturaC': '50',
        'signosVitales.presionArterial': '120-80',
        'signosVitales.tallaCm': '158',
      }),
    )
    expect(errores['signosVitales.pesoKg']).toBe('Debe ser un número.')
    expect(errores['signosVitales.temperaturaC']).toMatch(/entre 34 y 43/)
    expect(errores['signosVitales.presionArterial']).toMatch(/120\/80/)
    expect(errores['signosVitales.tallaCm']).toBeUndefined()
  })

  it('convierte la captura en una consulta tipada sin campos vacíos', () => {
    const datos = aDatosConsulta(
      {
        ...base({
          'signosVitales.pesoKg': '62,5',
          'signosVitales.presionArterial': ' 120/80 ',
          diagnostico: '   ',
        }),
        corrigeA: 'c0',
      },
      'p1',
    )
    expect(datos).toEqual({
      pacienteId: 'p1',
      fecha: '2026-11-21',
      medico: 'Dra. Prueba',
      motivo: 'Revisión',
      signosVitales: { pesoKg: 62.5, presionArterial: '120/80' },
      corrigeA: 'c0',
    })
    expect(aDatosConsulta(base({}), 'p1')).not.toHaveProperty('signosVitales')
  })

  it('los estudios sin fecha toman la de la consulta', () => {
    const c = base({})
    c.estudios = [
      { ...nuevoEstudio('mastografia'), resultado: ' BI-RADS 1 ' },
      { ...nuevoEstudio('nutricion'), fecha: '2026-11-20' },
    ]
    expect(aDatosEstudios(c, 'p1', 'c1', '2026-11-21')).toEqual([
      {
        pacienteId: 'p1',
        consultaId: 'c1',
        tipo: 'mastografia',
        fecha: '2026-11-21',
        resultado: 'BI-RADS 1',
      },
      {
        pacienteId: 'p1',
        consultaId: 'c1',
        tipo: 'nutricion',
        fecha: '2026-11-20',
        resultado: undefined,
      },
    ])
  })

  it('precarga una corrección con la consulta original y sus estudios', () => {
    const c = capturaParaCorregir(consulta, [
      {
        id: 'e1',
        pacienteId: 'p1',
        consultaId: 'c1',
        tipo: 'ultrasonido',
        fecha: '2025-03-14',
        resultado: 'Normal',
        createdAt: '',
      },
    ])
    expect(c.corrigeA).toBe('c1')
    expect(c.valores).toMatchObject({
      fecha: '2025-03-14',
      motivo: 'Dolor mamario',
      'signosVitales.pesoKg': '62.5',
      diagnostico: 'Sin hallazgos',
    })
    expect(c.estudios).toMatchObject([
      { tipo: 'ultrasonido', fecha: '', resultado: 'Normal' },
    ])
    expect(aDatosConsulta(c, 'p1')).toMatchObject({
      signosVitales: { pesoKg: 62.5 },
    })
  })

  it('lista los campos que cambió una corrección', () => {
    const correccion: Consulta = {
      ...consulta,
      id: 'c2',
      corrigeA: 'c1',
      diagnostico: 'Requiere ultrasonido',
      signosVitales: { pesoKg: 65, presionArterial: '120/80' },
    }
    expect(camposCorregidos(consulta, correccion)).toEqual([
      'Peso',
      'Diagnóstico',
    ])
  })

  it('reconoce un borrador válido y rechaza datos corruptos', () => {
    expect(esCaptura(base({}))).toBe(true)
    expect(esCaptura(null)).toBe(false)
    expect(esCaptura({ valores: {} })).toBe(false)
    expect(
      esCaptura({ valores: {}, estudios: [{ clave: 'x', tipo: 'rayos' }] }),
    ).toBe(false)
  })

  it('la atención externa no puede ser posterior a la consulta', () => {
    const fila = nuevaFila({
      tipo: 'consulta',
      fecha: '2026-06-01',
      resumen: 'Nutrición',
    })
    const c = { ...base({ fecha: '2026-05-01' }), externas: [fila] }
    expect(validarCaptura(c)[`externa.${fila.clave}.fecha`]).toBe(
      'No puede ser posterior a la fecha de la consulta.',
    )
    expect(
      validarCaptura({ ...c, valores: { ...c.valores, fecha: '2026-06-01' } }),
    ).toEqual({})
  })
})
