import type { ResultadoLectura } from '../../supabase/functions/_shared/lecturaHoja.ts'

/**
 * Lecturas de las hojas ficticias de `public/demo/hojas/` (generadas con
 * `scripts/generar-hojas-demo.py`). Las usa el lector simulado.
 */
export const LECTURAS_DEMO: Omit<ResultadoLectura, 'modelo'>[] = [
  {
    valores: {
      'paciente.nombres': 'Rosa Elena',
      'paciente.apellidoPaterno': 'Martínez',
      'paciente.apellidoMaterno': 'Cruz',
      'paciente.fechaNacimiento': '1978-03-14',
      'paciente.celular': '9511234567',
      'paciente.comunidad': 'San Miguel del Valle',
      'paciente.municipio': 'Tlacolula',
      'consulta.fecha': '2026-11-20',
      'consulta.medico': 'Dra. Laura Gómez',
      'consulta.motivo': 'Tamizaje de rutina',
      'consulta.signosVitales.pesoKg': '68.5',
      'consulta.signosVitales.tallaCm': '156',
      'consulta.signosVitales.presionArterial': '130/85',
      'consulta.signosVitales.frecuenciaCardiaca': '78',
      'consulta.signosVitales.temperaturaC': '36.6',
      'consulta.antecedentes': 'Madre con cáncer de mama. G3 P3.',
      'consulta.exploracion': 'Mamas simétricas, sin nódulos palpables.',
      'consulta.diagnostico': 'Sana. Exploración mamaria normal.',
      'consulta.plan': 'Mastografía en 1 año. Papanicolaou en próxima brigada.',
    },
    dudosos: ['paciente.celular', 'consulta.signosVitales.presionArterial'],
    ilegibles: ['paciente.curp'],
  },
  {
    valores: {
      'paciente.nombres': 'Guadalupe',
      'paciente.apellidoPaterno': 'Hernández',
      'paciente.apellidoMaterno': 'López',
      'paciente.fechaNacimiento': '1965-08-02',
      'paciente.comunidad': 'Santa Ana',
      'paciente.municipio': 'Zaachila',
      'consulta.fecha': '2026-11-20',
      'consulta.medico': 'Dr. Andrés Ruiz',
      'consulta.motivo': 'Bolita en mama izquierda',
      'consulta.signosVitales.pesoKg': '74',
      'consulta.signosVitales.presionArterial': '140/90',
      'consulta.signosVitales.temperaturaC': '36.8',
      'consulta.exploracion':
        'Nódulo de 1.5 cm en cuadrante superior externo izquierdo, móvil.',
      'consulta.diagnostico': 'Nódulo mamario izquierdo a estudiar.',
      'consulta.plan': 'Ultrasonido mamario. Referir a ginecología.',
    },
    dudosos: ['paciente.fechaNacimiento', 'consulta.signosVitales.pesoKg'],
    ilegibles: [
      'paciente.celular',
      'consulta.signosVitales.frecuenciaCardiaca',
    ],
  },
]
