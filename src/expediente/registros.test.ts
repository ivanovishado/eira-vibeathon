import { beforeEach, describe, expect, it } from 'vitest'
import { crearRepo } from '../db/repo'
import { crearDB, type EiraDB } from '../db/schema'
import {
  claveBorradorRegistro,
  guardarRegistro,
  RegistroInvalido,
} from './registros'
import { agruparVersiones, rastroDeCambios } from './versiones'

let db: EiraDB
let n = 0
let pacienteId: string

beforeEach(async () => {
  db = crearDB(`registros-${n++}`)
  const p = await crearRepo(db).crearPaciente({
    nombres: 'Paciente',
    apellidoPaterno: 'Ficticia',
    telefonos: [],
  })
  pacienteId = p.id
  await db.colaSalida.clear()
})

const cancerMadre = {
  ambito: 'familiar',
  parentesco: 'Madre',
  tipo: 'cancer',
  descripcion: 'Mama',
  cuando: '2015',
}

describe('antecedentes', () => {
  it('guarda el antecedente y lo anota en la cola de salida', async () => {
    const a = await guardarRegistro(
      'antecedente',
      pacienteId,
      cancerMadre,
      {},
      db,
    )

    expect(await db.antecedentes.get(a.id)).toMatchObject({
      pacienteId,
      ambito: 'familiar',
      parentesco: 'Madre',
      tipo: 'cancer',
      descripcion: 'Mama',
      cuando: '2015',
    })
    expect(await db.colaSalida.toArray()).toMatchObject([
      { tabla: 'antecedentes', registroId: a.id, operacion: 'crear' },
    ])
  })

  it('no guarda el parentesco de un antecedente personal', async () => {
    const a = await guardarRegistro(
      'antecedente',
      pacienteId,
      { ...cancerMadre, ambito: 'personal' },
      {},
      db,
    )
    expect(a).not.toHaveProperty('parentesco')
  })

  it('rechaza capturas incompletas sin escribir nada', async () => {
    await expect(
      guardarRegistro(
        'antecedente',
        pacienteId,
        { ambito: 'familiar' },
        {},
        db,
      ),
    ).rejects.toBeInstanceOf(RegistroInvalido)
    expect(await db.antecedentes.count()).toBe(0)
    expect(await db.colaSalida.count()).toBe(0)
  })

  it('una corrección agrega una versión y conserva la anterior intacta', async () => {
    const original = await guardarRegistro(
      'antecedente',
      pacienteId,
      cancerMadre,
      {},
      db,
    )
    await db.borradores.put({
      clave: claveBorradorRegistro('antecedente', pacienteId, original.id),
      datos: {},
      updatedAt: original.createdAt,
    })
    const correccion = await guardarRegistro(
      'antecedente',
      pacienteId,
      { ...cancerMadre, cuando: 'a los 52 años' },
      { corrigeA: original.id },
      db,
    )

    expect(correccion.corrigeA).toBe(original.id)
    expect(await db.antecedentes.get(original.id)).toEqual(original)
    expect(await db.antecedentes.count()).toBe(2)
    expect(await db.colaSalida.count()).toBe(2)
    expect(await db.borradores.count()).toBe(0)

    const grupos = agruparVersiones(await db.antecedentes.toArray())
    expect(grupos).toHaveLength(1)
    expect(grupos[0].vigente.id).toBe(correccion.id)
    expect(rastroDeCambios(grupos).map((c) => c.tipo)).toEqual(
      expect.arrayContaining(['registrado', 'corregido']),
    )
  })

  it('quitar un registro agrega una versión retirada', async () => {
    const original = await guardarRegistro(
      'antecedente',
      pacienteId,
      cancerMadre,
      {},
      db,
    )
    const baja = await guardarRegistro(
      'antecedente',
      pacienteId,
      {},
      { corrigeA: original.id, retirar: true },
      db,
    )
    expect(baja).toMatchObject({
      corrigeA: original.id,
      retirado: true,
      descripcion: 'Mama',
    })
    expect(await db.antecedentes.count()).toBe(2)
  })

  it('no corrige registros de otra paciente', async () => {
    const otra = await crearRepo(db).crearPaciente({
      nombres: 'Otra',
      apellidoPaterno: 'Ficticia',
      telefonos: [],
    })
    const ajeno = await guardarRegistro(
      'antecedente',
      otra.id,
      cancerMadre,
      {},
      db,
    )
    await expect(
      guardarRegistro(
        'antecedente',
        pacienteId,
        cancerMadre,
        { corrigeA: ajeno.id },
        db,
      ),
    ).rejects.toThrow('no es de esta paciente')
  })
})

describe('atención fuera de EIRA', () => {
  const nutriologo = {
    tipo: 'consulta',
    especialidad: 'Nutrición',
    fecha: '2026-05-15',
    fechaAproximada: 'si',
    lugar: 'Centro de Salud (ficticio)',
    resumen: 'Plan de alimentación',
  }

  it('guarda la fecha aproximada como booleano', async () => {
    const a = await guardarRegistro('externa', pacienteId, nutriologo, {}, db)
    expect(await db.atencionesExternas.get(a.id)).toMatchObject({
      tipo: 'consulta',
      fecha: '2026-05-15',
      fechaAproximada: true,
      resumen: 'Plan de alimentación',
    })
    expect(await db.colaSalida.toArray()).toMatchObject([
      { tabla: 'atencionesExternas', registroId: a.id },
    ])
  })

  it('una corrección conserva la consulta en la que se registró', async () => {
    const original = await crearRepo(db).crearAtencionExterna({
      pacienteId,
      consultaId: 'c1',
      tipo: 'consulta',
      fecha: '2026-05-15',
      resumen: 'Plan',
    })
    const c = await guardarRegistro(
      'externa',
      pacienteId,
      { ...nutriologo, fechaAproximada: '' },
      { corrigeA: original.id },
      db,
    )
    expect(c).toMatchObject({ consultaId: 'c1', corrigeA: original.id })
    expect(c).not.toMatchObject({ fechaAproximada: true })
  })

  it('no acepta fechas futuras', async () => {
    await expect(
      guardarRegistro(
        'externa',
        pacienteId,
        { ...nutriologo, fecha: '2999-01-01' },
        {},
        db,
      ),
    ).rejects.toBeInstanceOf(RegistroInvalido)
  })
})
