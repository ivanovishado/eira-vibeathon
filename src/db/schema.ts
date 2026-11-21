import Dexie, { type EntityTable, type Table } from 'dexie'

export interface Paciente {
  id: string
  folio?: string
  nombres: string
  apellidoPaterno: string
  apellidoMaterno?: string
  /** YYYY-MM-DD */
  fechaNacimiento?: string
  /** Normalizados a 10 dígitos. */
  telefonos: string[]
  comunidad?: string
  municipio?: string
  curp?: string
  /** Nombre completo normalizado; lo calcula el repositorio. */
  nombreBusqueda: string
  createdAt: string
  updatedAt: string
}

export interface Brigada {
  id: string
  /** YYYY-MM-DD */
  fecha: string
  lugar: string
  responsable?: string
  createdAt: string
}

export interface SignosVitales {
  pesoKg?: number
  tallaCm?: number
  presionArterial?: string
  frecuenciaCardiaca?: number
  temperaturaC?: number
}

/** Las consultas no se editan: una corrección es una consulta nueva con `corrigeA`. */
export interface Consulta {
  id: string
  pacienteId: string
  brigadaId?: string
  /** YYYY-MM-DD */
  fecha: string
  medico: string
  motivo: string
  antecedentes?: string
  signosVitales?: SignosVitales
  exploracion?: string
  diagnostico?: string
  plan?: string
  corrigeA?: string
  createdAt: string
}

export const TIPOS_ESTUDIO = [
  'mastografia',
  'ultrasonido',
  'papanicolaou',
  'nutricion',
  'otro',
] as const
export type TipoEstudio = (typeof TIPOS_ESTUDIO)[number]

export interface Estudio {
  id: string
  pacienteId: string
  consultaId?: string
  tipo: TipoEstudio
  /** YYYY-MM-DD */
  fecha: string
  resultado?: string
  createdAt: string
}

export const AMBITOS_ANTECEDENTE = ['personal', 'familiar'] as const
export type AmbitoAntecedente = (typeof AMBITOS_ANTECEDENTE)[number]

export const TIPOS_ANTECEDENTE = [
  'cancer',
  'cronica',
  'ginecoobstetrico',
  'quirurgico',
  'alergia',
  'otro',
] as const
export type TipoAntecedente = (typeof TIPOS_ANTECEDENTE)[number]

/**
 * Antecedentes y atención externa no se editan: una corrección es un registro nuevo con
 * `corrigeA` (la versión que sustituye) y quitar uno es una corrección con `retirado`.
 */
interface RegistroVersionado {
  id: string
  pacienteId: string
  corrigeA?: string
  retirado?: boolean
  createdAt: string
}

export interface Antecedente extends RegistroVersionado {
  ambito: AmbitoAntecedente
  /** Solo en antecedentes familiares: madre, hermana, abuela materna… */
  parentesco?: string
  tipo: TipoAntecedente
  /** Qué fue; en cáncer, el tipo de cáncer. */
  descripcion: string
  /** Texto libre y aproximado: "2015", "a los 45 años". */
  cuando?: string
  notas?: string
}

export const TIPOS_ATENCION_EXTERNA = [
  'consulta',
  'estudio',
  'diagnostico',
  'tratamiento',
  'hospitalizacion',
  'otro',
] as const
export type TipoAtencionExterna = (typeof TIPOS_ATENCION_EXTERNA)[number]

/** Atención médica que la paciente recibió fuera de EIRA (nutriólogo, hospital…). */
export interface AtencionExterna extends RegistroVersionado {
  tipo: TipoAtencionExterna
  especialidad?: string
  /** YYYY-MM-DD; si `fechaAproximada`, solo importan mes y año. */
  fecha: string
  fechaAproximada?: boolean
  /** Dónde o con quién. */
  lugar?: string
  resumen: string
  /** Consulta de EIRA en la que se preguntó y registró. */
  consultaId?: string
}

export type TablaSincronizada =
  | 'pacientes'
  | 'brigadas'
  | 'consultas'
  | 'estudios'
  | 'antecedentes'
  | 'atencionesExternas'

/** Cambio local pendiente de subir al servidor. */
export interface CambioPendiente {
  seq?: number
  tabla: TablaSincronizada
  registroId: string
  operacion: 'crear' | 'actualizar'
  createdAt: string
  intentos: number
}

/** Formulario a medio llenar, para no perder captura si se cierra la app. */
export interface Borrador {
  clave: string
  datos: unknown
  updatedAt: string
}

export type EiraDB = Dexie & {
  pacientes: EntityTable<Paciente, 'id'>
  brigadas: EntityTable<Brigada, 'id'>
  consultas: EntityTable<Consulta, 'id'>
  estudios: EntityTable<Estudio, 'id'>
  colaSalida: Table<CambioPendiente, number>
  borradores: EntityTable<Borrador, 'clave'>
  antecedentes: EntityTable<Antecedente, 'id'>
  atencionesExternas: EntityTable<AtencionExterna, 'id'>
}

export function crearDB(nombre = 'eira-expedientes'): EiraDB {
  const db = new Dexie(nombre) as EiraDB
  db.version(1).stores({
    pacientes: 'id, nombreBusqueda, *telefonos, updatedAt',
    brigadas: 'id, fecha',
    consultas: 'id, pacienteId, brigadaId, fecha',
    estudios: 'id, pacienteId, consultaId, fecha',
    colaSalida: '++seq, tabla',
    borradores: 'clave',
  })
  db.version(2).stores({
    antecedentes: 'id, pacienteId',
    atencionesExternas: 'id, pacienteId, fecha',
  })
  return db
}

export const db = crearDB()
