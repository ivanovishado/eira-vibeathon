import { describe, expect, it } from 'vitest'
import { CAMPOS_CONSULTA } from '../expediente/formulario'
import { CAMPOS_PACIENTE } from '../lib/formPaciente'
import { CAMPOS_LECTURA, consultaDeLectura, pacienteDeLectura } from './campos'
import { LECTURAS_DEMO } from './demo'

describe('CAMPOS_LECTURA', () => {
  it('sale de los formularios de paciente y consulta (sin la brigada)', () => {
    const ids = CAMPOS_LECTURA.map((c) => c.id)
    for (const k of Object.keys(CAMPOS_PACIENTE))
      expect(ids).toContain(`paciente.${k}`)
    for (const c of CAMPOS_CONSULTA)
      if (c.tipo !== 'brigada') expect(ids).toContain(`consulta.${c.id}`)
    expect(ids).not.toContain('consulta.brigadaId')
    expect(CAMPOS_LECTURA.find((c) => c.id === 'paciente.fechaNacimiento')?.tipo).toBe('fecha')
  })

  it('las lecturas de demo solo usan campos conocidos', () => {
    const ids = new Set(CAMPOS_LECTURA.map((c) => c.id))
    for (const l of LECTURAS_DEMO)
      for (const id of [...Object.keys(l.valores), ...l.dudosos, ...l.ilegibles])
        expect(ids).toContain(id)
  })
})

describe('de la lectura al formulario', () => {
  const lectura = {
    valores: {
      'paciente.nombres': ' Rosa ',
      'paciente.curp': 'INVENTADA',
      'consulta.motivo': 'Tamizaje',
      'consulta.signosVitales.pesoKg': '68.5',
      'consulta.desconocido': 'x',
    },
    dudosos: ['consulta.signosVitales.pesoKg'],
    ilegibles: ['paciente.curp', 'consulta.diagnostico'],
    leidaEn: '2026-11-20T10:00:00.000Z',
  }

  it('llena el formulario de paciente y deja vacío lo ilegible', () => {
    const { form, marcas } = pacienteDeLectura(lectura)
    expect(form.nombres).toBe('Rosa')
    expect(form.curp).toBe('')
    expect(form.celular).toBe('')
    expect(marcas).toEqual({ curp: 'ilegible' })
  })

  it('da valores y marcas para el formulario de consulta', () => {
    const { valores, marcas } = consultaDeLectura(lectura)
    expect(valores).toEqual({
      motivo: 'Tamizaje',
      'signosVitales.pesoKg': '68.5',
    })
    expect(marcas).toEqual({
      'signosVitales.pesoKg': 'dudoso',
      diagnostico: 'ilegible',
    })
  })

  it('sin lectura, todo vacío', () => {
    expect(pacienteDeLectura().form.nombres).toBe('')
    expect(consultaDeLectura().valores).toEqual({})
  })
})
