import { normalizarTelefono, normalizarTexto } from '../lib/normalize'
import {
  db as dbPorDefecto,
  type Antecedente,
  type AtencionExterna,
  type Brigada,
  type Consulta,
  type EiraDB,
  type Estudio,
  type Hoja,
  type Paciente,
  type TablaSincronizada,
} from './schema'

const ahora = () => new Date().toISOString()
const nuevoId = () => crypto.randomUUID()

export function nombreCompleto(
  p: Pick<Paciente, 'nombres' | 'apellidoPaterno' | 'apellidoMaterno'>,
): string {
  return [p.nombres, p.apellidoPaterno, p.apellidoMaterno]
    .filter(Boolean)
    .join(' ')
}

export type DatosPaciente = Omit<
  Paciente,
  'id' | 'nombreBusqueda' | 'createdAt' | 'updatedAt'
>
export type DatosBrigada = Omit<Brigada, 'id' | 'createdAt'>
export type DatosConsulta = Omit<Consulta, 'id' | 'createdAt'>
export type DatosEstudio = Omit<Estudio, 'id' | 'createdAt'>
export type DatosAntecedente = Omit<Antecedente, 'id' | 'createdAt'>
export type DatosAtencionExterna = Omit<AtencionExterna, 'id' | 'createdAt'>
export type DatosHoja = Omit<Hoja, 'id' | 'createdAt' | 'updatedAt'>

function prepararPaciente(datos: DatosPaciente) {
  return {
    ...datos,
    telefonos: datos.telefonos.map(normalizarTelefono).filter(Boolean),
    nombreBusqueda: normalizarTexto(nombreCompleto(datos)),
  }
}

/**
 * Toda escritura de datos clínicos pasa por aquí: guarda el registro y lo anota en la
 * cola de salida en la misma transacción, para que la sincronización no pierda cambios.
 */
export function crearRepo(db: EiraDB = dbPorDefecto) {
  async function escribir<T extends { id: string }>(
    tabla: TablaSincronizada,
    registro: T,
    operacion: 'crear' | 'actualizar',
  ): Promise<T> {
    await db.transaction('rw', db.table(tabla), db.colaSalida, async () => {
      await db.table(tabla).put(registro)
      await db.colaSalida.add({
        tabla,
        registroId: registro.id,
        operacion,
        createdAt: ahora(),
        intentos: 0,
      })
    })
    return registro
  }

  return {
    crearPaciente(datos: DatosPaciente): Promise<Paciente> {
      const t = ahora()
      return escribir(
        'pacientes',
        {
          ...prepararPaciente(datos),
          id: nuevoId(),
          createdAt: t,
          updatedAt: t,
        },
        'crear',
      )
    },

    async actualizarPaciente(
      id: string,
      cambios: Partial<DatosPaciente>,
    ): Promise<Paciente> {
      const actual = await db.pacientes.get(id)
      if (!actual) throw new Error(`No existe la paciente ${id}`)
      const {
        id: _id,
        nombreBusqueda: _n,
        createdAt,
        updatedAt: _u,
        ...datos
      } = actual
      return escribir(
        'pacientes',
        {
          ...prepararPaciente({ ...datos, ...cambios }),
          id,
          createdAt,
          updatedAt: ahora(),
        },
        'actualizar',
      )
    },

    crearBrigada(datos: DatosBrigada): Promise<Brigada> {
      return escribir(
        'brigadas',
        { ...datos, id: nuevoId(), createdAt: ahora() },
        'crear',
      )
    },

    crearConsulta(datos: DatosConsulta): Promise<Consulta> {
      return escribir(
        'consultas',
        { ...datos, id: nuevoId(), createdAt: ahora() },
        'crear',
      )
    },

    crearEstudio(datos: DatosEstudio): Promise<Estudio> {
      return escribir(
        'estudios',
        { ...datos, id: nuevoId(), createdAt: ahora() },
        'crear',
      )
    },

    crearAntecedente(datos: DatosAntecedente): Promise<Antecedente> {
      return escribir(
        'antecedentes',
        { ...datos, id: nuevoId(), createdAt: ahora() },
        'crear',
      )
    },

    crearAtencionExterna(
      datos: DatosAtencionExterna,
    ): Promise<AtencionExterna> {
      return escribir(
        'atencionesExternas',
        { ...datos, id: nuevoId(), createdAt: ahora() },
        'crear',
      )
    },

    crearHoja(datos: DatosHoja): Promise<Hoja> {
      const t = ahora()
      return escribir(
        'hojas',
        { ...datos, id: nuevoId(), createdAt: t, updatedAt: t },
        'crear',
      )
    },

    /** Reemplaza los campos dados; un campo con `undefined` se borra. */
    async actualizarHoja(
      id: string,
      cambios: Partial<DatosHoja>,
    ): Promise<Hoja> {
      const actual = await db.hojas.get(id)
      if (!actual) throw new Error(`No existe la hoja ${id}`)
      return escribir(
        'hojas',
        { ...actual, ...cambios, id, updatedAt: ahora() },
        'actualizar',
      )
    },

    cambiosPendientes(): Promise<number> {
      return db.colaSalida.count()
    },
  }
}

export const repo = crearRepo()
