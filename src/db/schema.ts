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

/**
 * - `sin-enviar`: la foto solo está en el dispositivo que la tomó (o falta pedir la lectura).
 * - `leyendo`: se está subiendo la foto o esperando la lectura del modelo.
 * - `por-revisar`: hay una lectura; nada ha llegado al expediente.
 * - `confirmada`: una persona revisó y guardó la paciente y la consulta.
 * - `descartada`: no se usará; se conserva.
 * - `error`: la lectura falló; se puede reintentar o capturar a mano.
 */
export const ESTADOS_HOJA = [
  'sin-enviar',
  'leyendo',
  'por-revisar',
  'confirmada',
  'descartada',
  'error',
] as const
export type EstadoHoja = (typeof ESTADOS_HOJA)[number]

/** Lo que el modelo leyó de una hoja; las llaves son las de `CAMPOS_LECTURA`. */
export interface LecturaHoja {
  valores: Record<string, string>
  /** Campos que el modelo no leyó con seguridad. */
  dudosos: string[]
  /** Campos escritos pero ilegibles; su valor queda vacío. */
  ilegibles: string[]
  modelo?: string
  leidaEn: string
}

/**
 * Hoja de papel fotografiada. La foto no viaja en esta tabla: vive en `imagenesHoja`
 * (local) y en el bucket privado `hojas` de Storage (`rutaImagen`).
 * `createdAt` es cuándo se fotografió.
 */
export interface Hoja {
  id: string
  estado: EstadoHoja
  /** Ruta en Storage; solo existe cuando la foto ya se subió. */
  rutaImagen?: string
  capturadaPor?: string
  lectura?: LecturaHoja
  errorLectura?: string
  pacienteId?: string
  consultaId?: string
  createdAt: string
  updatedAt: string
}

/** Foto de una hoja guardada en el dispositivo (no se sincroniza). */
export interface ImagenHoja {
  hojaId: string
  /** JPEG reducido; ArrayBuffer y no Blob para que IndexedDB lo guarde en cualquier navegador. */
  datos: ArrayBuffer
  miniatura: ArrayBuffer
  tipo: string
}

export type TablaSincronizada =
  | 'pacientes'
  | 'brigadas'
  | 'consultas'
  | 'estudios'
  | 'antecedentes'
  | 'atencionesExternas'
  | 'hojas'

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
  hojas: EntityTable<Hoja, 'id'>
  imagenesHoja: EntityTable<ImagenHoja, 'hojaId'>
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
  db.version(3).stores({
    hojas: 'id, estado, createdAt, consultaId',
    imagenesHoja: 'hojaId',
  })
  return db
}

export const db = crearDB()
