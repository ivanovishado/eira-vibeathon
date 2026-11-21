import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { crearRepo } from '../db/repo'
import { crearDB, type EiraDB } from '../db/schema'
import { cargarDatosFicticios } from '../db/seed'
import { crearMotor, ultimaDescargaCompleta } from './motor'
import { ErrorSincronizacion } from './remoto'
import { crearServidorSimulado } from './servidorSimulado'

let n = 0
let db: EiraDB
let servidor: ReturnType<typeof crearServidorSimulado>

beforeEach(() => {
  db = crearDB(`sync-${n++}`)
  servidor = crearServidorSimulado()
})

const ana = {
  nombres: 'Ana',
  apellidoPaterno: 'Ficticia',
  telefonos: ['3410000001'],
}

async function capturarVisita(db: EiraDB) {
  const repo = crearRepo(db)
  const p = await repo.crearPaciente(ana)
  const c = await repo.crearConsulta({
    pacienteId: p.id,
    fecha: '2026-11-21',
    medico: 'Dra. Prueba',
    motivo: 'Revisión',
  })
  await repo.crearEstudio({
    pacienteId: p.id,
    consultaId: c.id,
    tipo: 'papanicolaou',
    fecha: '2026-11-21',
  })
  return { p, c }
}

describe('subida', () => {
  it('envía la cola y la vacía', async () => {
    const { p, c } = await capturarVisita(db)
    const motor = crearMotor(servidor.remoto, db)

    expect(await motor.subir()).toBe(3)
    expect(await db.colaSalida.count()).toBe(0)
    expect(servidor.filas('pacientes')).toMatchObject([
      { id: p.id, nombres: 'Ana', apellido_paterno: 'Ficticia' },
    ])
    expect(servidor.filas('consultas')).toMatchObject([
      { id: c.id, paciente_id: p.id },
    ])
    expect(servidor.filas('estudios')).toHaveLength(1)
  })

  it('envía una sola vez un registro editado varias veces, con su última versión', async () => {
    const repo = crearRepo(db)
    const p = await repo.crearPaciente(ana)
    await repo.actualizarPaciente(p.id, { comunidad: 'El Fresnito' })
    await repo.actualizarPaciente(p.id, { comunidad: 'Tapalpa' })

    await crearMotor(servidor.remoto, db).subir()

    expect(servidor.llamadas.subir).toBe(1)
    expect(servidor.filas('pacientes')).toMatchObject([
      { comunidad: 'Tapalpa' },
    ])
  })

  it('sin red conserva la cola, suma el intento y lo reporta', async () => {
    await capturarVisita(db)
    servidor.fallarCon(() => new ErrorSincronizacion('red', 'Failed to fetch'))

    await expect(crearMotor(servidor.remoto, db).subir()).rejects.toMatchObject(
      { tipo: 'red' },
    )
    const cola = await db.colaSalida.toArray()
    expect(cola).toHaveLength(3)
    expect(cola[0].intentos).toBe(1)
  })

  it('si se corta la respuesta, reenviar no duplica nada', async () => {
    await capturarVisita(db)
    const motor = crearMotor(servidor.remoto, db)
    servidor.perderRespuestas(1)

    await expect(motor.subir()).rejects.toMatchObject({ tipo: 'red' })
    expect(await db.colaSalida.count()).toBe(3)
    expect(servidor.filas('pacientes')).toHaveLength(1)

    await motor.subir()
    expect(await db.colaSalida.count()).toBe(0)
    expect(servidor.filas('pacientes')).toHaveLength(1)
    expect(servidor.filas('consultas')).toHaveLength(1)
  })

  it('las consultas son append-only: reenviar no sobrescribe la del servidor', async () => {
    const { c } = await capturarVisita(db)
    await crearMotor(servidor.remoto, db).subir()
    await db.consultas.update(c.id, { motivo: 'Cambiado a mano' })
    await db.colaSalida.add({
      tabla: 'consultas',
      registroId: c.id,
      operacion: 'crear',
      createdAt: new Date().toISOString(),
      intentos: 0,
    })

    await crearMotor(servidor.remoto, db).subir()
    expect(servidor.filas('consultas')[0].motivo).toBe('Revisión')
  })

  it('un registro rechazado no detiene a los demás', async () => {
    const repo = crearRepo(db)
    const malo = await repo.crearPaciente({ ...ana, nombres: 'Rechazada' })
    const bueno = await repo.crearPaciente({ ...ana, nombres: 'Buena' })
    servidor.fallarCon((_op, _t, filas) =>
      filas?.some((f) => f.id === malo.id)
        ? new ErrorSincronizacion('rechazo', 'fecha inválida')
        : undefined,
    )

    await expect(crearMotor(servidor.remoto, db).subir()).rejects.toMatchObject(
      { tipo: 'rechazo', message: expect.stringContaining('fecha inválida') },
    )
    expect(servidor.filas('pacientes').map((f) => f.id)).toEqual([bueno.id])
    const cola = await db.colaSalida.toArray()
    expect(cola).toMatchObject([{ registroId: malo.id, intentos: 1 }])
  })

  it('lo que se captura mientras sube no se pierde', async () => {
    const repo = crearRepo(db)
    const p = await repo.crearPaciente(ana)
    let edicion: Promise<unknown> | undefined
    servidor.fallarCon((op) => {
      if (op === 'subir' && !edicion)
        edicion = repo.actualizarPaciente(p.id, { municipio: 'Tapalpa' })
      return undefined
    })

    await crearMotor(servidor.remoto, db).subir()
    await edicion
    await crearMotor(servidor.remoto, db).subir()

    expect(await db.colaSalida.count()).toBe(0)
    expect(servidor.filas('pacientes')[0].municipio).toBe('Tapalpa')
  })

  it('sube por lotes', async () => {
    const repo = crearRepo(db)
    for (let i = 0; i < 5; i++)
      await repo.crearPaciente({ ...ana, nombres: `Ana ${i}` })

    expect(
      await crearMotor(servidor.remoto, db, { loteSubida: 2 }).subir(),
    ).toBe(5)
    expect(servidor.llamadas.subir).toBe(3)
  })
})

describe('descarga', () => {
  it('pasa datos de un dispositivo a otro', async () => {
    const otro = crearDB(`sync-${n++}`)
    const { p, c } = await capturarVisita(db)
    await crearMotor(servidor.remoto, db).subir()

    expect(await crearMotor(servidor.remoto, otro).descargar()).toBe(3)
    expect(await otro.pacientes.get(p.id)).toMatchObject({
      nombres: 'Ana',
      nombreBusqueda: 'ana ficticia',
      telefonos: ['3410000001'],
    })
    expect(await otro.consultas.get(c.id)).toEqual(c)
    expect(await otro.colaSalida.count()).toBe(0)
  })

  it('con el cursor solo pide lo nuevo, por páginas', async () => {
    for (let i = 0; i < 5; i++)
      servidor.escribir('brigadas', {
        id: `b${i}`,
        fecha: '2026-11-21',
        lugar: `Lugar ${i}`,
        created_at: '2026-11-21T10:00:00Z',
      })
    const motor = crearMotor(servidor.remoto, db, { loteDescarga: 2 })

    expect(await motor.descargar()).toBe(5)
    expect(await db.brigadas.count()).toBe(5)
    expect(await motor.descargar()).toBe(0)

    servidor.escribir('brigadas', {
      id: 'b9',
      fecha: '2026-11-22',
      lugar: 'Nueva',
      created_at: '2026-11-22T10:00:00Z',
    })
    expect(await motor.descargar()).toBe(1)
    expect(await db.brigadas.get('b9')).toMatchObject({ lugar: 'Nueva' })
  })

  it('si se corta a media descarga, retoma desde la última página guardada', async () => {
    for (let i = 0; i < 4; i++)
      servidor.escribir('brigadas', {
        id: `b${i}`,
        fecha: '2026-11-21',
        lugar: `Lugar ${i}`,
        created_at: '2026-11-21T10:00:00Z',
      })
    let pedidas = 0
    servidor.fallarCon((op, tabla) =>
      op === 'cambiosDesde' && tabla === 'brigadas' && ++pedidas === 2
        ? new ErrorSincronizacion('red', 'Se cortó')
        : undefined,
    )
    const motor = crearMotor(servidor.remoto, db, { loteDescarga: 2 })

    await expect(motor.descargar()).rejects.toMatchObject({ tipo: 'red' })
    expect(await db.brigadas.count()).toBe(2)
    expect(await ultimaDescargaCompleta(db)).toBeUndefined()

    expect(await motor.descargar()).toBe(2)
    expect(await db.brigadas.count()).toBe(4)
    expect(await ultimaDescargaCompleta(db)).toBeDefined()
  })

  it('no pisa un cambio local que aún no se sube', async () => {
    const repo = crearRepo(db)
    const p = await repo.crearPaciente(ana)
    await crearMotor(servidor.remoto, db).subir()
    servidor.escribir('pacientes', {
      ...servidor.filas('pacientes')[0],
      comunidad: 'Desde otro dispositivo',
      updated_at: '2020-01-01T00:00:00Z',
    })
    await repo.actualizarPaciente(p.id, { comunidad: 'Local' })

    await crearMotor(servidor.remoto, db).descargar()
    expect((await db.pacientes.get(p.id))?.comunidad).toBe('Local')

    await crearMotor(servidor.remoto, db).sincronizar()
    expect((await db.pacientes.get(p.id))?.comunidad).toBe('Local')
    expect(servidor.filas('pacientes')[0].comunidad).toBe('Local')
  })

  it('un campo borrado localmente se borra en el servidor y en otros dispositivos', async () => {
    const otro = crearDB(`sync-${n++}`)
    const repo = crearRepo(db)
    const p = await repo.crearPaciente({ ...ana, comunidad: 'Tapalpa' })
    await crearMotor(servidor.remoto, db).sincronizar()
    await crearMotor(servidor.remoto, otro).sincronizar()
    await repo.actualizarPaciente(p.id, { comunidad: undefined })

    await crearMotor(servidor.remoto, db).sincronizar()
    await crearMotor(servidor.remoto, otro).sincronizar()
    expect((await otro.pacientes.get(p.id))?.comunidad).toBeUndefined()
  })

  it('los datos ficticios locales no se suben', async () => {
    await cargarDatosFicticios(20, db)
    await crearMotor(servidor.remoto, db).sincronizar()
    expect(servidor.llamadas.subir).toBe(0)
  })
})

describe('sincronizar', () => {
  it('un rechazo no impide descargar, pero se reporta', async () => {
    const repo = crearRepo(db)
    await repo.crearPaciente(ana)
    servidor.escribir('brigadas', {
      id: 'b1',
      fecha: '2026-11-21',
      lugar: 'Tapalpa',
      created_at: '2026-11-21T10:00:00Z',
    })
    servidor.fallarCon((op) =>
      op === 'subir' ? new ErrorSincronizacion('rechazo', 'no') : undefined,
    )

    await expect(
      crearMotor(servidor.remoto, db).sincronizar(),
    ).rejects.toMatchObject({ tipo: 'rechazo' })
    expect(await db.brigadas.count()).toBe(1)
  })

  it('sin red no descarga', async () => {
    servidor.fallarCon(() => new ErrorSincronizacion('red', 'offline'))
    await expect(
      crearMotor(servidor.remoto, db).sincronizar(),
    ).rejects.toMatchObject({ tipo: 'red' })
    expect(await ultimaDescargaCompleta(db)).toBeUndefined()
  })
})
