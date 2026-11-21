import {
  crearRepo,
  type DatosAntecedente,
  type DatosAtencionExterna,
} from '../db/repo'
import {
  db as dbPorDefecto,
  type Antecedente,
  type AtencionExterna,
  type EiraDB,
} from '../db/schema'
import { CAMPOS_ANTECEDENTE } from './antecedentes'
import { CAMPOS_ATENCION_EXTERNA } from './atencionExterna'
import {
  aDatos,
  esValores,
  validarRegistro,
  type CampoRegistro,
  type Valores,
} from './camposRegistro'

/** Registros del historial entre visitas que se capturan fuera de la consulta. */
export type ClaseRegistro = 'antecedente' | 'externa'

export interface DefinicionRegistro {
  tabla: 'antecedentes' | 'atencionesExternas'
  campos: CampoRegistro[]
  /** Segmento de la ruta: /pacientes/:id/<ruta>/nuevo */
  ruta: string
  tituloNuevo: string
  tituloCorregir: string
  guardado: string
}

export const REGISTROS: Record<ClaseRegistro, DefinicionRegistro> = {
  antecedente: {
    tabla: 'antecedentes',
    campos: CAMPOS_ANTECEDENTE as CampoRegistro[],
    ruta: 'antecedentes',
    tituloNuevo: 'Agregar antecedente',
    tituloCorregir: 'Corregir antecedente',
    guardado: 'Antecedente guardado en este dispositivo.',
  },
  externa: {
    tabla: 'atencionesExternas',
    campos: CAMPOS_ATENCION_EXTERNA as CampoRegistro[],
    ruta: 'atencion-externa',
    tituloNuevo: 'Atención fuera de EIRA',
    tituloCorregir: 'Corregir atención fuera de EIRA',
    guardado: 'Atención fuera de EIRA guardada en este dispositivo.',
  },
}

export function rutaRegistro(
  clase: ClaseRegistro,
  pacienteId: string,
  opciones: { corrige?: string; valores?: Valores } = {},
): string {
  const q = new URLSearchParams(opciones.valores as Record<string, string>)
  if (opciones.corrige) q.set('corrige', opciones.corrige)
  const query = q.toString()
  return `/pacientes/${pacienteId}/${REGISTROS[clase].ruta}/nuevo${query ? `?${query}` : ''}`
}

export function claveBorradorRegistro(
  clase: ClaseRegistro,
  pacienteId: string,
  corrigeA?: string,
): string {
  return corrigeA
    ? `${clase}:${pacienteId}:corrige:${corrigeA}`
    : `${clase}:${pacienteId}:nuevo`
}

export async function leerBorradorRegistro(
  clave: string,
  db: EiraDB = dbPorDefecto,
): Promise<{ valores: Valores; updatedAt: string } | undefined> {
  const b = await db.borradores.get(clave)
  if (!b || !esValores(b.datos)) return undefined
  return { valores: b.datos, updatedAt: b.updatedAt }
}

export class RegistroInvalido extends Error {
  readonly errores: Partial<Record<string, string>>
  constructor(errores: Partial<Record<string, string>>) {
    super('Hay campos por corregir')
    this.errores = errores
  }
}

type Registro = Antecedente | AtencionExterna

const sinMeta = ({
  id: _id,
  createdAt: _c,
  corrigeA: _a,
  retirado: _r,
  ...resto
}: Registro) => resto

/** Datos tipados de un antecedente o atención externa a partir de lo capturado. */
export function aDatosRegistro(
  clase: 'antecedente',
  valores: Valores,
  pacienteId: string,
): DatosAntecedente
export function aDatosRegistro(
  clase: 'externa',
  valores: Valores,
  pacienteId: string,
): DatosAtencionExterna
export function aDatosRegistro(
  clase: ClaseRegistro,
  valores: Valores,
  pacienteId: string,
): DatosAntecedente | DatosAtencionExterna
export function aDatosRegistro(
  clase: ClaseRegistro,
  valores: Valores,
  pacienteId: string,
) {
  return { ...aDatos(REGISTROS[clase].campos, valores), pacienteId }
}

export function escribirRegistro(
  clase: ClaseRegistro,
  datos: DatosAntecedente | DatosAtencionExterna,
  db: EiraDB = dbPorDefecto,
): Promise<Registro> {
  const repo = crearRepo(db)
  return clase === 'antecedente'
    ? repo.crearAntecedente(datos as DatosAntecedente)
    : repo.crearAtencionExterna(datos as DatosAtencionExterna)
}

/**
 * Guarda un antecedente o atención externa nuevos, la corrección de uno existente o
 * (con `retirar`) su baja. Nunca modifica versiones anteriores: siempre agrega una.
 */
export async function guardarRegistro(
  clase: ClaseRegistro,
  pacienteId: string,
  valores: Valores,
  opciones: { corrigeA?: string; retirar?: boolean } = {},
  db: EiraDB = dbPorDefecto,
): Promise<Registro> {
  const def = REGISTROS[clase]
  if (!opciones.retirar) {
    const errores = validarRegistro(def.campos, valores)
    if (Object.keys(errores).length) throw new RegistroInvalido(errores)
  }
  const tabla = db.table<Registro, string>(def.tabla)
  return db.transaction(
    'rw',
    [db.pacientes, tabla, db.colaSalida, db.borradores],
    async () => {
      if (!(await db.pacientes.get(pacienteId)))
        throw new Error(`No existe la paciente ${pacienteId}`)
      const original = opciones.corrigeA
        ? await tabla.get(opciones.corrigeA)
        : undefined
      if (
        (opciones.corrigeA || opciones.retirar) &&
        original?.pacienteId !== pacienteId
      )
        throw new Error('El registro a corregir no es de esta paciente')
      const datos = opciones.retirar
        ? { ...sinMeta(original!), retirado: true }
        : {
            ...aDatosRegistro(clase, valores, pacienteId),
            // Una corrección conserva la consulta en la que se registró.
            ...(original && 'consultaId' in original && original.consultaId
              ? { consultaId: original.consultaId }
              : {}),
          }
      const registro = await escribirRegistro(
        clase,
        {
          ...datos,
          ...(opciones.corrigeA ? { corrigeA: opciones.corrigeA } : {}),
        } as DatosAntecedente | DatosAtencionExterna,
        db,
      )
      await db.borradores.delete(
        claveBorradorRegistro(clase, pacienteId, opciones.corrigeA),
      )
      return registro
    },
  )
}
