import { expect, it } from 'vitest'
import { crearDB } from './schema'
import { cargarDatosFicticios, generarDatosFicticios } from './seed'

it('genera siempre los mismos datos para la misma semilla', () => {
  expect(generarDatosFicticios(50)).toEqual(generarDatosFicticios(50))
})

it('carga los datos en la base local sin llenar la cola de salida', async () => {
  const db = crearDB('prueba-seed')
  const datos = await cargarDatosFicticios(100, db)

  expect(await db.pacientes.count()).toBe(100)
  expect(await db.consultas.count()).toBe(datos.consultas.length)
  expect(await db.colaSalida.count()).toBe(0)
})
