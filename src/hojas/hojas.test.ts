import { beforeEach, describe, expect, it } from 'vitest'
import { crearRepo } from '../db/repo'
import { crearDB, ESTADOS_HOJA, type EiraDB } from '../db/schema'
import { CapturaInvalida } from '../expediente/captura'
import type { CapturaConsulta } from '../expediente/formulario'
import { puedeCambiar } from './estados'
import {
  CambioNoPermitido,
  cambiarEstado,
  capturarHoja,
  claveBorradorHoja,
  confirmarHoja,
  descartarHoja,
  reintentarLectura,
  restaurarHoja,
} from './hojas'

let db: EiraDB
let n = 0
const imagen = () => ({
  datos: new Uint8Array([1, 2, 3]).buffer,
  miniatura: new Uint8Array([1]).buffer,
  tipo: 'image/jpeg',
})
const captura = (
  valores: CapturaConsulta['valores'] = {},
): CapturaConsulta => ({
  valores: {
    fecha: '2026-11-20',
    medico: 'Dra. Laura Gómez',
    motivo: 'Tamizaje de rutina',
    ...valores,
  },
  estudios: [],
})

beforeEach(() => {
  db = crearDB(`hojas-${n++}`)
})

describe('capturarHoja', () => {
  it('guarda la foto aparte y deja la hoja sin enviar, en la cola de salida', async () => {
    const hoja = await capturarHoja(imagen(), 'Dra. Laura', db)
    expect(hoja.estado).toBe('sin-enviar')
    expect(hoja.capturadaPor).toBe('Dra. Laura')
    expect((await db.imagenesHoja.get(hoja.id))?.tipo).toBe('image/jpeg')
    const cola = await db.colaSalida.toArray()
    expect(cola).toMatchObject([{ tabla: 'hojas', registroId: hoja.id }])
    expect(await db.pacientes.count()).toBe(0)
  })
})

describe('estados', () => {
  it('una hoja confirmada ya no cambia', () => {
    for (const a of ESTADOS_HOJA)
      expect(puedeCambiar('confirmada', a)).toBe(false)
  })

  it('descartar no borra; restaurar regresa a la bandeja', async () => {
    const hoja = await capturarHoja(imagen(), undefined, db)
    await descartarHoja(hoja.id, db)
    expect((await db.hojas.get(hoja.id))?.estado).toBe('descartada')
    expect(await db.imagenesHoja.get(hoja.id)).toBeDefined()
    await restaurarHoja(hoja.id, db)
    expect((await db.hojas.get(hoja.id))?.estado).toBe('sin-enviar')
  })

  it('reintentar tras un error limpia el mensaje', async () => {
    const hoja = await capturarHoja(imagen(), undefined, db)
    await cambiarEstado(hoja.id, 'leyendo', {}, db)
    await cambiarEstado(hoja.id, 'error', { errorLectura: 'ilegible' }, db)
    const nueva = await reintentarLectura(hoja.id, db)
    expect(nueva.estado).toBe('sin-enviar')
    expect(nueva.errorLectura).toBeUndefined()
  })

  it('rechaza transiciones inválidas', async () => {
    const hoja = await capturarHoja(imagen(), undefined, db)
    await expect(cambiarEstado(hoja.id, 'por-revisar', {}, db)).rejects.toThrow(
      CambioNoPermitido,
    )
  })
})

describe('confirmarHoja', () => {
  it('crea paciente y consulta por el repositorio y liga la hoja', async () => {
    const hoja = await capturarHoja(imagen(), undefined, db)
    await db.borradores.put({
      clave: claveBorradorHoja(hoja.id),
      datos: captura(),
      updatedAt: '2026-11-20T10:00:00.000Z',
    })
    const { pacienteId, consulta } = await confirmarHoja(
      hoja.id,
      {
        nueva: {
          nombres: 'Rosa Elena',
          apellidoPaterno: 'Martínez',
          telefonos: ['9511234567'],
        },
      },
      captura({ 'signosVitales.pesoKg': '68.5' }),
      db,
    )
    const guardada = await db.hojas.get(hoja.id)
    expect(guardada).toMatchObject({
      estado: 'confirmada',
      pacienteId,
      consultaId: consulta.id,
    })
    expect(consulta.signosVitales?.pesoKg).toBe(68.5)
    expect((await db.pacientes.get(pacienteId))?.nombres).toBe('Rosa Elena')
    expect(await db.borradores.get(claveBorradorHoja(hoja.id))).toBeUndefined()
    const tablas = (await db.colaSalida.toArray()).map((c) => c.tabla)
    expect(tablas).toEqual(['hojas', 'pacientes', 'consultas', 'hojas'])
  })

  it('con paciente existente no crea otra', async () => {
    const p = await crearRepo(db).crearPaciente({
      nombres: 'Guadalupe',
      apellidoPaterno: 'Hernández',
      telefonos: [],
    })
    const hoja = await capturarHoja(imagen(), undefined, db)
    await confirmarHoja(hoja.id, { pacienteId: p.id }, captura(), db)
    expect(await db.pacientes.count()).toBe(1)
    expect((await db.hojas.get(hoja.id))?.pacienteId).toBe(p.id)
  })

  it('nada llega al expediente si la consulta no es válida o la hoja está descartada', async () => {
    const hoja = await capturarHoja(imagen(), undefined, db)
    const nueva = {
      nueva: { nombres: 'Ana', apellidoPaterno: 'Ruiz', telefonos: [] },
    }
    await expect(
      confirmarHoja(hoja.id, nueva, captura({ motivo: '' }), db),
    ).rejects.toThrow(CapturaInvalida)
    await descartarHoja(hoja.id, db)
    await expect(confirmarHoja(hoja.id, nueva, captura(), db)).rejects.toThrow(
      /descartada/,
    )
    expect(await db.pacientes.count()).toBe(0)
    expect(await db.consultas.count()).toBe(0)
  })

  it('no se confirma dos veces', async () => {
    const hoja = await capturarHoja(imagen(), undefined, db)
    const nueva = {
      nueva: { nombres: 'Ana', apellidoPaterno: 'Ruiz', telefonos: [] },
    }
    await confirmarHoja(hoja.id, nueva, captura(), db)
    await expect(confirmarHoja(hoja.id, nueva, captura(), db)).rejects.toThrow(
      /ya se confirmó/,
    )
    expect(await db.consultas.count()).toBe(1)
  })
})
