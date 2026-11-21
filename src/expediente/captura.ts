import { crearRepo } from '../db/repo'
import { db as dbPorDefecto, type Consulta, type EiraDB } from '../db/schema'
import {
  aDatosConsulta,
  aDatosEstudios,
  esCaptura,
  validarCaptura,
  type CapturaConsulta,
  type IdCampo,
} from './formulario'

/** Un borrador por paciente para consultas nuevas y uno por consulta corregida. */
export function claveBorrador(pacienteId: string, corrigeA?: string): string {
  return corrigeA
    ? `consulta:${pacienteId}:corrige:${corrigeA}`
    : `consulta:${pacienteId}:nueva`
}

const CLAVE_RECORDADOS = 'recordados:consulta'
/** Campos que se repiten entre consultas de la misma brigada. */
const CAMPOS_RECORDADOS: IdCampo[] = ['medico', 'brigadaId']

export interface BorradorConsulta {
  captura: CapturaConsulta
  updatedAt: string
}

export async function leerBorrador(
  clave: string,
  db: EiraDB = dbPorDefecto,
): Promise<BorradorConsulta | undefined> {
  const b = await db.borradores.get(clave)
  if (!b || !esCaptura(b.datos)) return undefined
  return { captura: b.datos, updatedAt: b.updatedAt }
}

export async function guardarBorrador(
  clave: string,
  captura: CapturaConsulta,
  db: EiraDB = dbPorDefecto,
): Promise<string> {
  const updatedAt = new Date().toISOString()
  await db.borradores.put({ clave, datos: captura, updatedAt })
  return updatedAt
}

export function descartarBorrador(
  clave: string,
  db: EiraDB = dbPorDefecto,
): Promise<void> {
  return db.borradores.delete(clave)
}

export async function leerRecordados(
  db: EiraDB = dbPorDefecto,
): Promise<Partial<Record<IdCampo, string>>> {
  const b = await db.borradores.get(CLAVE_RECORDADOS)
  return b && typeof b.datos === 'object' && b.datos
    ? (b.datos as Partial<Record<IdCampo, string>>)
    : {}
}

export class CapturaInvalida extends Error {
  readonly errores: ReturnType<typeof validarCaptura>
  constructor(errores: ReturnType<typeof validarCaptura>) {
    super('La consulta tiene campos por corregir')
    this.errores = errores
  }
}

/**
 * Guarda la consulta y sus estudios (vía el repositorio, que los anota en la cola de
 * salida) y borra el borrador, todo en una sola transacción local.
 */
export async function registrarConsulta(
  pacienteId: string,
  captura: CapturaConsulta,
  db: EiraDB = dbPorDefecto,
): Promise<Consulta> {
  const errores = validarCaptura(captura)
  if (Object.keys(errores).length) throw new CapturaInvalida(errores)
  const repo = crearRepo(db)
  return db.transaction(
    'rw',
    [db.pacientes, db.consultas, db.estudios, db.colaSalida, db.borradores],
    async () => {
      if (!(await db.pacientes.get(pacienteId)))
        throw new Error(`No existe la paciente ${pacienteId}`)
      const consulta = await repo.crearConsulta(
        aDatosConsulta(captura, pacienteId),
      )
      for (const estudio of aDatosEstudios(
        captura,
        pacienteId,
        consulta.id,
        consulta.fecha,
      ))
        await repo.crearEstudio(estudio)
      await db.borradores.delete(claveBorrador(pacienteId, captura.corrigeA))
      const recordados: Partial<Record<IdCampo, string>> = {}
      for (const id of CAMPOS_RECORDADOS) {
        const v = captura.valores[id]?.trim()
        if (v) recordados[id] = v
      }
      await db.borradores.put({
        clave: CLAVE_RECORDADOS,
        datos: recordados,
        updatedAt: consulta.createdAt,
      })
      return consulta
    },
  )
}
