import { beforeEach, describe, expect, it } from 'vitest'
import { crearRepo } from '../db/repo'
import { crearDB, type EiraDB } from '../db/schema'
import {
  CapturaInvalida,
  claveBorrador,
  descartarBorrador,
  guardarBorrador,
  leerBorrador,
  leerRecordados,
  registrarConsulta,
} from './captura'
import { nuevoEstudio, type CapturaConsulta } from './formulario'

let db: EiraDB
let n = 0
let pacienteId: string

beforeEach(async () => {
  db = crearDB(`captura-${n++}`)
  const p = await crearRepo(db).crearPaciente({
    nombres: 'Paciente',
    apellidoPaterno: 'Ficticia',
    telefonos: [],
  })
  pacienteId = p.id
  await db.colaSalida.clear()
})

const captura = (): CapturaConsulta => ({
  valores: {
    fecha: '2026-11-21',
    medico: 'Dra. Prueba',
    motivo: 'Tamizaje',
    brigadaId: 'b1',
  },
  estudios: [
    { ...nuevoEstudio('mastografia'), resultado: 'Normal' },
    nuevoEstudio('papanicolaou'),
  ],
})

describe('borradores de consulta', () => {
  it('guarda, recupera y descarta un borrador', async () => {
    const clave = claveBorrador(pacienteId)
    expect(await leerBorrador(clave, db)).toBeUndefined()
    const c = captura()
    await guardarBorrador(clave, c, db)
    expect((await leerBorrador(clave, db))?.captura).toEqual(c)
    await descartarBorrador(clave, db)
    expect(await leerBorrador(clave, db)).toBeUndefined()
  })

  it('separa el borrador de una corrección del de una consulta nueva', () => {
    expect(claveBorrador('p', 'c')).not.toBe(claveBorrador('p'))
  })

  it('ignora un borrador con forma inesperada', async () => {
    const clave = claveBorrador(pacienteId)
    await db.borradores.put({ clave, datos: 'basura', updatedAt: '' })
    expect(await leerBorrador(clave, db)).toBeUndefined()
  })
})

describe('registrarConsulta', () => {
  it('guarda consulta y estudios, los encola y borra el borrador', async () => {
    const clave = claveBorrador(pacienteId)
    await guardarBorrador(clave, captura(), db)

    const consulta = await registrarConsulta(pacienteId, captura(), db)

    expect(await db.consultas.get(consulta.id)).toMatchObject({
      pacienteId,
      motivo: 'Tamizaje',
    })
    const estudios = await db.estudios
      .where('consultaId')
      .equals(consulta.id)
      .toArray()
    expect(estudios.map((e) => [e.tipo, e.fecha, e.resultado])).toEqual(
      expect.arrayContaining([
        ['mastografia', '2026-11-21', 'Normal'],
        ['papanicolaou', '2026-11-21', undefined],
      ]),
    )
    const cola = await db.colaSalida.toArray()
    expect(cola.map((c) => c.tabla).sort()).toEqual([
      'consultas',
      'estudios',
      'estudios',
    ])
    expect(await leerBorrador(clave, db)).toBeUndefined()
    expect(await leerRecordados(db)).toEqual({
      medico: 'Dra. Prueba',
      brigadaId: 'b1',
    })
  })

  it('una corrección es una consulta nueva que referencia a la anterior', async () => {
    const original = await registrarConsulta(pacienteId, captura(), db)
    const clave = claveBorrador(pacienteId, original.id)
    const c = { ...captura(), corrigeA: original.id }
    await guardarBorrador(clave, c, db)

    const correccion = await registrarConsulta(pacienteId, c, db)

    expect(correccion.id).not.toBe(original.id)
    expect(correccion.corrigeA).toBe(original.id)
    expect(await db.consultas.get(original.id)).toEqual(original)
    expect(await leerBorrador(clave, db)).toBeUndefined()
  })

  it('no guarda nada si la captura es inválida', async () => {
    const c = captura()
    c.valores.motivo = ''
    await expect(registrarConsulta(pacienteId, c, db)).rejects.toBeInstanceOf(
      CapturaInvalida,
    )
    expect(await db.consultas.count()).toBe(0)
    expect(await db.colaSalida.count()).toBe(0)
  })

  it('no guarda nada si la paciente no existe', async () => {
    await expect(
      registrarConsulta('no-existe', captura(), db),
    ).rejects.toThrow()
    expect(await db.consultas.count()).toBe(0)
    expect(await db.estudios.count()).toBe(0)
  })
})
