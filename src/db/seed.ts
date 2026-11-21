import { normalizarTexto } from '../lib/normalize'
import { nombreCompleto } from './repo'
import {
  db as dbPorDefecto,
  TIPOS_ESTUDIO,
  type Antecedente,
  type AtencionExterna,
  type Brigada,
  type Consulta,
  type EiraDB,
  type Estudio,
  type Paciente,
} from './schema'

// Datos ficticios para desarrollo y demo. Ninguna persona real.
const NOMBRES = [
  'María',
  'Guadalupe',
  'Juana',
  'Margarita',
  'Verónica',
  'Leticia',
  'Rosa',
  'Francisca',
  'Teresa',
  'Alejandra',
  'Martha',
  'Patricia',
  'Elizabeth',
  'Gabriela',
  'Silvia',
  'Josefina',
  'Adriana',
  'Yolanda',
  'Carmen',
  'Araceli',
  'Lucía',
  'Esperanza',
  'Norma',
  'Beatriz',
  'María Elena',
  'María del Carmen',
  'Ana María',
  'María José',
  'Rosa María',
  'Luz María',
]
const APELLIDOS = [
  'Hernández',
  'García',
  'Martínez',
  'López',
  'González',
  'Pérez',
  'Rodríguez',
  'Sánchez',
  'Ramírez',
  'Cruz',
  'Flores',
  'Gómez',
  'Morales',
  'Vázquez',
  'Reyes',
  'Jiménez',
  'Torres',
  'Díaz',
  'Gutiérrez',
  'Ruiz',
  'Mendoza',
  'Aguilar',
  'Ortiz',
  'Moreno',
  'Castillo',
  'Romero',
  'Álvarez',
  'Chávez',
  'Rivera',
  'Juárez',
  'Núñez',
  'Peña',
  'Zúñiga',
  'Barragán',
  'Michel',
]
const LUGARES = [
  ['El Fresnito', 'Zapotlán el Grande'],
  ['Atequizayán', 'Zapotlán el Grande'],
  ['Los Depósitos', 'Zapotlán el Grande'],
  ['San Andrés Ixtlán', 'Gómez Farías'],
  ['El Rodeo', 'Gómez Farías'],
  ['Usmajac', 'Sayula'],
  ['Tazumbos', 'Jilotlán de los Dolores'],
  ['La Mesa', 'Tuxpan'],
  ['El Platanar', 'Tuxpan'],
  ['Copala', 'Tolimán'],
]
const MOTIVOS = [
  'Tamizaje de rutina',
  'Dolor mamario',
  'Bulto palpable en mama',
  'Seguimiento de estudio previo',
  'Secreción por pezón',
  'Revisión anual',
  'Orientación nutricional',
]

const PARENTESCOS = [
  'Madre',
  'Hermana',
  'Abuela materna',
  'Tía paterna',
  'Prima',
]
const CANCERES = ['Mama', 'Cervicouterino', 'Ovario', 'Endometrio', 'Colon']
const OTROS_ANTECEDENTES: Pick<Antecedente, 'tipo' | 'descripcion'>[] = [
  { tipo: 'cronica', descripcion: 'Diabetes tipo 2' },
  { tipo: 'cronica', descripcion: 'Hipertensión arterial' },
  { tipo: 'ginecoobstetrico', descripcion: '3 embarazos, 2 partos, 1 cesárea' },
  { tipo: 'quirurgico', descripcion: 'Colecistectomía' },
  { tipo: 'alergia', descripcion: 'Penicilina' },
]
const ATENCIONES: Pick<
  AtencionExterna,
  'tipo' | 'especialidad' | 'lugar' | 'resumen'
>[] = [
  {
    tipo: 'consulta',
    especialidad: 'Nutrición',
    lugar: 'Centro de Salud (dato ficticio)',
    resumen: 'Plan de alimentación para bajar de peso. Dato ficticio.',
  },
  {
    tipo: 'consulta',
    especialidad: 'Ginecología',
    lugar: 'Hospital regional (dato ficticio)',
    resumen: 'Revisión por flujo; le indicaron óvulos. Dato ficticio.',
  },
  {
    tipo: 'estudio',
    especialidad: 'Radiología',
    lugar: 'Laboratorio particular (dato ficticio)',
    resumen: 'Ultrasonido pélvico sin alteraciones. Dato ficticio.',
  },
  {
    tipo: 'diagnostico',
    especialidad: 'Medicina general',
    lugar: 'Consultorio de farmacia (dato ficticio)',
    resumen: 'Le diagnosticaron hipertensión. Dato ficticio.',
  },
  {
    tipo: 'tratamiento',
    lugar: 'Centro de Salud (dato ficticio)',
    resumen: 'Toma metformina desde hace unos meses. Dato ficticio.',
  },
  {
    tipo: 'hospitalizacion',
    especialidad: 'Cirugía',
    lugar: 'Hospital general (dato ficticio)',
    resumen: 'Operada de la vesícula, 3 días internada. Dato ficticio.',
  },
]
/** Fecha tope de los datos ficticios, para que sean repetibles. */
const FECHA_TOPE = '2026-11-01'

const sumarDias = (fecha: string, dias: number) =>
  new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * 86_400_000)
    .toISOString()
    .slice(0, 10)

/** PRNG determinista (mulberry32) para que los datos de prueba sean repetibles. */
function prng(semilla: number) {
  let a = semilla
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface DatosFicticios {
  pacientes: Paciente[]
  brigadas: Brigada[]
  consultas: Consulta[]
  estudios: Estudio[]
  antecedentes: Antecedente[]
  atencionesExternas: AtencionExterna[]
}

export function generarDatosFicticios(
  cantidad = 2000,
  semilla = 1,
): DatosFicticios {
  const r = prng(semilla)
  const elegir = <T>(lista: readonly T[]): T =>
    lista[Math.floor(r() * lista.length)]
  const entero = (min: number, max: number) =>
    min + Math.floor(r() * (max - min + 1))
  const dos = (n: number) => String(n).padStart(2, '0')
  const id = () =>
    'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () =>
      Math.floor(r() * 16).toString(16),
    )
  const creado = '2026-01-01T00:00:00.000Z'

  const brigadas: Brigada[] = LUGARES.map(([lugar, municipio], i) => ({
    id: id(),
    fecha: `${2024 + (i % 3)}-${dos(1 + ((i * 5) % 12))}-${dos(entero(1, 28))}`,
    lugar: `${lugar}, ${municipio}`,
    responsable: 'Equipo EIRA',
    createdAt: creado,
  }))

  const pacientes: Paciente[] = []
  const consultas: Consulta[] = []
  const estudios: Estudio[] = []
  const antecedentes: Antecedente[] = []
  const atencionesExternas: AtencionExterna[] = []

  for (let i = 0; i < cantidad; i++) {
    const primeraConsulta = consultas.length
    const [comunidad, municipio] = elegir(LUGARES)
    const base = {
      nombres: elegir(NOMBRES),
      apellidoPaterno: elegir(APELLIDOS),
      apellidoMaterno: r() < 0.95 ? elegir(APELLIDOS) : undefined,
    }
    const paciente: Paciente = {
      ...base,
      id: id(),
      folio: `EIRA-${String(i + 1).padStart(6, '0')}`,
      fechaNacimiento: `${entero(1962, 2006)}-${dos(entero(1, 12))}-${dos(entero(1, 28))}`,
      telefonos: r() < 0.85 ? [`341${entero(1000000, 9999999)}`] : [],
      comunidad,
      municipio,
      nombreBusqueda: normalizarTexto(nombreCompleto(base)),
      createdAt: creado,
      updatedAt: creado,
    }
    pacientes.push(paciente)

    const visitas = entero(0, 3)
    for (let v = 0; v < visitas; v++) {
      const brigada = elegir(brigadas)
      const consulta: Consulta = {
        id: id(),
        pacienteId: paciente.id,
        brigadaId: brigada.id,
        fecha: brigada.fecha,
        medico: elegir([
          'Dra. Ejemplo Uno',
          'Dr. Ejemplo Dos',
          'Dra. Ejemplo Tres',
        ]),
        motivo: elegir(MOTIVOS),
        signosVitales: {
          pesoKg: entero(48, 95),
          tallaCm: entero(145, 172),
          presionArterial: `${entero(100, 140)}/${entero(60, 90)}`,
        },
        diagnostico: elegir([
          'Sin hallazgos',
          'Requiere estudio complementario',
          'Seguimiento en 6 meses',
        ]),
        plan: 'Dato ficticio de prueba.',
        createdAt: creado,
      }
      consultas.push(consulta)
      if (r() < 0.7) {
        estudios.push({
          id: id(),
          pacienteId: paciente.id,
          consultaId: consulta.id,
          tipo: elegir(TIPOS_ESTUDIO),
          fecha: consulta.fecha,
          resultado: elegir([
            'Normal',
            'Pendiente de resultado',
            'Hallazgo a vigilar',
          ]),
          createdAt: creado,
        })
      }
    }

    // Antecedentes: cáncer en la familia es lo más frecuente en el tamizaje de EIRA.
    if (r() < 0.3) {
      const original: Antecedente = {
        id: id(),
        pacienteId: paciente.id,
        ambito: 'familiar',
        parentesco: elegir(PARENTESCOS),
        tipo: 'cancer',
        descripcion: elegir(CANCERES),
        cuando: `${entero(1995, 2025)}`,
        createdAt: creado,
      }
      antecedentes.push(original)
      // A veces se corrigió después (ejemplo de rastro de cambios).
      if (r() < 0.2)
        antecedentes.push({
          ...original,
          id: id(),
          corrigeA: original.id,
          cuando: `a los ${entero(40, 70)} años`,
          notas: 'La paciente confirmó la edad con su familia. Dato ficticio.',
          createdAt: '2026-03-01T00:00:00.000Z',
        })
    }
    if (r() < 0.05)
      antecedentes.push({
        id: id(),
        pacienteId: paciente.id,
        ambito: 'personal',
        tipo: 'cancer',
        descripcion: elegir(CANCERES),
        cuando: `${entero(2010, 2024)}`,
        notas: 'En vigilancia. Dato ficticio.',
        createdAt: creado,
      })
    if (r() < 0.35)
      antecedentes.push({
        id: id(),
        pacienteId: paciente.id,
        ambito: r() < 0.7 ? 'personal' : 'familiar',
        ...elegir(OTROS_ANTECEDENTES),
        createdAt: creado,
      })

    // Atención fuera de EIRA después de su última consulta.
    const ultima = consultas
      .slice(primeraConsulta)
      .reduce<string | undefined>(
        (max, c) => (!max || c.fecha > max ? c.fecha : max),
        undefined,
      )
    if (ultima && r() < 0.4) {
      const veces = entero(1, 2)
      for (let k = 0; k < veces; k++) {
        const fecha = sumarDias(ultima, entero(20, 200))
        if (fecha > FECHA_TOPE) continue
        atencionesExternas.push({
          id: id(),
          pacienteId: paciente.id,
          ...elegir(ATENCIONES),
          fecha,
          fechaAproximada: r() < 0.5 || undefined,
          createdAt: creado,
        })
      }
    }
  }
  return {
    pacientes,
    brigadas,
    consultas,
    estudios,
    antecedentes,
    atencionesExternas,
  }
}

const TABLAS = [
  'pacientes',
  'brigadas',
  'consultas',
  'estudios',
  'colaSalida',
  'borradores',
  'antecedentes',
  'atencionesExternas',
] as const

export async function borrarDatosLocales(
  db: EiraDB = dbPorDefecto,
): Promise<void> {
  await db.transaction(
    'rw',
    TABLAS.map((t) => db.table(t)),
    async () => {
      await Promise.all(TABLAS.map((t) => db.table(t).clear()))
    },
  )
}

/** Reemplaza todo el contenido local con datos ficticios (no pasan por la cola de salida). */
export async function cargarDatosFicticios(
  cantidad = 2000,
  db: EiraDB = dbPorDefecto,
) {
  const datos = generarDatosFicticios(cantidad)
  await borrarDatosLocales(db)
  await db.transaction(
    'rw',
    [
      db.pacientes,
      db.brigadas,
      db.consultas,
      db.estudios,
      db.antecedentes,
      db.atencionesExternas,
    ],
    async () => {
      await db.pacientes.bulkAdd(datos.pacientes)
      await db.brigadas.bulkAdd(datos.brigadas)
      await db.consultas.bulkAdd(datos.consultas)
      await db.estudios.bulkAdd(datos.estudios)
      await db.antecedentes.bulkAdd(datos.antecedentes)
      await db.atencionesExternas.bulkAdd(datos.atencionesExternas)
    },
  )
  return datos
}
