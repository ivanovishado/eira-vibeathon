import { crearRepo, type DatosPaciente } from '../db/repo'
import {
  db as dbPorDefecto,
  type Consulta,
  type EiraDB,
  type EstadoHoja,
  type Hoja,
  type ImagenHoja,
} from '../db/schema'
import { CapturaInvalida, registrarConsulta } from '../expediente/captura'
import { validarCaptura, type CapturaConsulta } from '../expediente/formulario'
import { puedeCambiar } from './estados'

export type ImagenCapturada = Omit<ImagenHoja, 'hojaId'>

/** Guarda la foto en el dispositivo y crea la hoja "sin enviar". No usa la red. */
export async function capturarHoja(
  imagen: ImagenCapturada,
  capturadaPor?: string,
  db: EiraDB = dbPorDefecto,
): Promise<Hoja> {
  const repo = crearRepo(db)
  return db.transaction(
    'rw',
    [db.hojas, db.imagenesHoja, db.colaSalida],
    async () => {
      const hoja = await repo.crearHoja({
        estado: 'sin-enviar',
        ...(capturadaPor ? { capturadaPor } : {}),
      })
      await db.imagenesHoja.put({ ...imagen, hojaId: hoja.id })
      return hoja
    },
  )
}

export class CambioNoPermitido extends Error {
  constructor(de: EstadoHoja, a: EstadoHoja) {
    super(`Una hoja ${de} no puede pasar a ${a}.`)
    this.name = 'CambioNoPermitido'
  }
}

/** Cambia el estado si la transición es válida (ver `estados.ts`). */
export async function cambiarEstado(
  id: string,
  a: EstadoHoja,
  cambios: Partial<Omit<Hoja, 'id' | 'estado'>> = {},
  db: EiraDB = dbPorDefecto,
): Promise<Hoja> {
  return db.transaction('rw', [db.hojas, db.colaSalida], async () => {
    const hoja = await db.hojas.get(id)
    if (!hoja) throw new Error(`No existe la hoja ${id}`)
    if (!puedeCambiar(hoja.estado, a)) throw new CambioNoPermitido(hoja.estado, a)
    return crearRepo(db).actualizarHoja(id, { ...cambios, estado: a })
  })
}

export const descartarHoja = (id: string, db?: EiraDB) =>
  cambiarEstado(id, 'descartada', {}, db)

/** Regresa una hoja descartada a la bandeja. */
export async function restaurarHoja(id: string, db: EiraDB = dbPorDefecto) {
  const hoja = await db.hojas.get(id)
  return cambiarEstado(id, hoja?.lectura ? 'por-revisar' : 'sin-enviar', {}, db)
}

/** Tras un error de lectura, la deja lista para que la cola la vuelva a leer. */
export const reintentarLectura = (id: string, db?: EiraDB) =>
  cambiarEstado(id, 'sin-enviar', { errorLectura: undefined }, db)

export const claveBorradorHoja = (hojaId: string) => `hoja:${hojaId}:consulta`

export type EleccionPaciente = { pacienteId: string } | { nueva: DatosPaciente }

/**
 * Lo único que escribe en el expediente desde una hoja: crea la paciente (si es nueva)
 * y la consulta por el mismo camino que la captura manual (repositorio → cola de
 * salida) y deja la hoja confirmada y ligada a ambas, en una sola transacción.
 */
export async function confirmarHoja(
  hojaId: string,
  eleccion: EleccionPaciente,
  captura: CapturaConsulta,
  db: EiraDB = dbPorDefecto,
): Promise<{ pacienteId: string; consulta: Consulta }> {
  const errores = validarCaptura(captura)
  if (Object.keys(errores).length) throw new CapturaInvalida(errores)
  const repo = crearRepo(db)
  return db.transaction(
    'rw',
    [
      db.hojas,
      db.pacientes,
      db.consultas,
      db.estudios,
      db.antecedentes,
      db.atencionesExternas,
      db.colaSalida,
      db.borradores,
    ],
    async () => {
      const hoja = await db.hojas.get(hojaId)
      if (!hoja) throw new Error('La hoja ya no existe en este dispositivo.')
      if (!puedeCambiar(hoja.estado, 'confirmada'))
        throw new Error(
          hoja.estado === 'confirmada'
            ? 'Esta hoja ya se confirmó.'
            : 'Esta hoja está descartada; restáurala para confirmarla.',
        )
      const pacienteId =
        'nueva' in eleccion
          ? (await repo.crearPaciente(eleccion.nueva)).id
          : eleccion.pacienteId
      const consulta = await registrarConsulta(
        pacienteId,
        captura,
        db,
        claveBorradorHoja(hojaId),
      )
      await repo.actualizarHoja(hojaId, {
        estado: 'confirmada',
        pacienteId,
        consultaId: consulta.id,
        errorLectura: undefined,
      })
      return { pacienteId, consulta }
    },
  )
}
