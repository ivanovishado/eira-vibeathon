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

it('incluye antecedentes y atención fuera de EIRA ficticios', async () => {
  const db = crearDB('prueba-seed-historial')
  const datos = await cargarDatosFicticios(200, db)

  expect(datos.antecedentes.some((a) => a.tipo === 'cancer')).toBe(true)
  expect(datos.antecedentes.some((a) => a.corrigeA)).toBe(true)
  expect(datos.atencionesExternas.length).toBeGreaterThan(0)
  expect(await db.antecedentes.count()).toBe(datos.antecedentes.length)
  expect(await db.atencionesExternas.count()).toBe(
    datos.atencionesExternas.length,
  )
  for (const a of datos.atencionesExternas) {
    const consultas = datos.consultas.filter(
      (c) => c.pacienteId === a.pacienteId,
    )
    expect(consultas.every((c) => c.fecha < a.fecha)).toBe(true)
  }
  expect(await db.colaSalida.count()).toBe(0)
})
