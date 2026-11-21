import { describe, expect, it } from 'vitest'
import type { CampoLectura } from './lecturaHoja'
import { analizarTextoHoja, palabrasEtiqueta } from './textoHoja'

const CAMPOS: CampoLectura[] = [
  {
    id: 'nombre',
    etiqueta: 'Paciente: Nombre(s)',
    tipo: 'texto',
    enHoja: ['Nombre(s)'],
  },
  {
    id: 'nac',
    etiqueta: 'Paciente: Fecha de nacimiento',
    tipo: 'fecha',
    enHoja: ['Fecha de nacimiento'],
  },
  {
    id: 'fecha',
    etiqueta: 'Consulta: Fecha',
    tipo: 'fecha',
    enHoja: ['Fecha'],
  },
  {
    id: 'peso',
    etiqueta: 'Consulta: Peso (kg)',
    tipo: 'numero',
    enHoja: ['Peso'],
  },
  {
    id: 'fc',
    etiqueta: 'Consulta: Frecuencia cardiaca',
    tipo: 'numero',
    enHoja: ['Frecuencia cardiaca'],
  },
  {
    id: 'temp',
    etiqueta: 'Consulta: Temperatura',
    tipo: 'numero',
    enHoja: ['Temperatura'],
  },
  {
    id: 'medico',
    etiqueta: 'Consulta: Médica o médico',
    tipo: 'texto',
    enHoja: ['Médica o médico'],
  },
  {
    id: 'exploracion',
    etiqueta: 'Consulta: Exploración física',
    tipo: 'parrafo',
    enHoja: ['Exploración física'],
  },
  { id: 'plan', etiqueta: 'Consulta: Plan', tipo: 'parrafo' },
]

const leer = (texto: string) => analizarTextoHoja(texto, CAMPOS, 'ocr')

describe('analizarTextoHoja', () => {
  it('ignora acentos, mayúsculas, puntuación y unidades de la etiqueta', () => {
    expect(palabrasEtiqueta('Temperatura (°C):')).toEqual(['temperatura'])
    const l = leer(
      'NOMBRE(S):\nAna\nFECHA DE NACIMIENTO\n1/2/1990\nfecha\n20.11.2026\npeso kg\n68,5\nFrec. cardíaca\n78\nTEMPERATURA (C)\n36,6\nMedica o medico\nDra. Paz\nExploracion fisica\nSin hallazgos.\nPlan\nCita en 1 año.',
    )
    expect(l.valores).toEqual({
      nombre: 'Ana',
      nac: '1990-02-01',
      fecha: '2026-11-20',
      peso: '68.5',
      fc: '78',
      temp: '36.6',
      medico: 'Dra. Paz',
      exploracion: 'Sin hallazgos.',
      plan: 'Cita en 1 año.',
    })
    expect(l.dudosos).toEqual([])
  })

  it('tolera una letra mal leída en etiquetas largas, no en las cortas', () => {
    const l = leer('Temperatyra\n36.5\nPlam\nalgo')
    expect(l.valores.temp).toBe('36.5')
    expect(l.valores.plan).toBeUndefined()
  })

  it('etiqueta y valor en la misma línea', () => {
    const l = leer('Nombre(s): Rosa\nPeso (kg) 70\nFecha 20/11/2026')
    expect(l.valores).toMatchObject({
      nombre: 'Rosa',
      peso: '70',
      fecha: '2026-11-20',
    })
  })

  it('párrafos en varias líneas; los títulos de sección no se cuelan', () => {
    const l = leer(
      'Exploración física\nNódulo de 1.5 cm,\nmóvil.\n\n## SIGNOS VITALES\nPlan\nUltrasonido.',
    )
    expect(l.valores.exploracion).toBe('Nódulo de 1.5 cm, móvil.')
    expect(l.valores.plan).toBe('Ultrasonido.')
  })

  it('una nota clínica separada en párrafos se lee completa', () => {
    const l = leer(
      'Exploración física\nNódulo de 1.5 cm.\n\nAxila sin ganglios.\n\nPlan\nUltrasonido.\n\nReferir.',
    )
    expect(l.valores.exploracion).toBe('Nódulo de 1.5 cm. Axila sin ganglios.')
    expect(l.valores.plan).toBe('Ultrasonido. Referir.')
  })

  it('tablas en Markdown', () => {
    const l = leer(
      '| Peso (kg) | Temperatura (°C) |\n|---|---|\n| 74 | 36.8 |\n| Plan | Referir |',
    )
    expect(l.valores).toMatchObject({
      peso: '74',
      temp: '36.8',
      plan: 'Referir',
    })
  })

  it('dudoso: etiqueta ausente o sin valor, año de dos dígitos, letras en números', () => {
    const l = leer(
      'Nombre(s)\n\nFecha de nacimiento\n02/08/65\nPeso\n7O\nTemperatura\nalta\nFecha\n31/02/2026',
    )
    expect(l.valores).toMatchObject({ nac: '1965-08-02', peso: '70' })
    expect(l.valores.temp).toBeUndefined()
    expect(l.valores.fecha).toBeUndefined()
    expect(new Set(l.dudosos)).toEqual(
      new Set([
        'nombre',
        'nac',
        'peso',
        'temp',
        'fecha',
        'fc',
        'medico',
        'exploracion',
        'plan',
      ]),
    )
  })

  it('sin `enHoja` usa la etiqueta sin el prefijo (clientes anteriores)', () => {
    expect(leer('Plan\nNada').valores.plan).toBe('Nada')
  })
})
