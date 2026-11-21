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

export type TablaSincronizada =
  'pacientes' | 'brigadas' | 'consultas' | 'estudios'

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
  return db
}

export const db = crearDB()
