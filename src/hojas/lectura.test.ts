import { beforeEach, describe, expect, it } from 'vitest'
import { crearDB, type EiraDB } from '../db/schema'
import { crearProgramador } from '../sync/programador'
import { capturarHoja, confirmarHoja } from './hojas'
import {
  fotosPorSubir,
  hojasPorLeer,
  leerHojasPendientes,
  LECTURA_ABANDONADA_MS,
} from './lectura'
import { crearServicioSimulado } from './servicioSimulado'

let db: EiraDB
let n = 0
const imagen = (bytes = 3) => ({
  datos: new Uint8Array(bytes).buffer,
  miniatura: new Uint8Array([1]).buffer,
  tipo: 'image/jpeg',
})

beforeEach(() => {
  db = crearDB(`lectura-${n++}`)
})

describe('leerHojasPendientes', () => {
  it('sube la foto, guarda la lectura y deja la hoja por revisar', async () => {
    const servicio = crearServicioSimulado()
    const hoja = await capturarHoja(imagen(4), undefined, db)
    expect(await leerHojasPendientes(servicio, db)).toEqual({
      leidas: 1,
      errores: 0,
    })
    const leida = await db.hojas.get(hoja.id)
    expect(leida).toMatchObject({
      estado: 'por-revisar',
      rutaImagen: `${hoja.id}.jpg`,
    })
    expect(leida?.lectura?.valores['paciente.nombres']).toBe('Rosa Elena')
    expect(leida?.lectura?.ilegibles).toContain('paciente.curp')
    expect(servicio.archivos.has(`${hoja.id}.jpg`)).toBe(true)
  })

  it('sin red la hoja vuelve a "sin enviar" y la cola se detiene', async () => {
    const servicio = crearServicioSimulado()
    const a = await capturarHoja(imagen(), undefined, db)
    await capturarHoja(imagen(), undefined, db)
    servicio.fallar('red')
    await expect(leerHojasPendientes(servicio, db)).rejects.toMatchObject({
      tipo: 'red',
    })
    expect((await db.hojas.get(a.id))?.estado).toBe('sin-enviar')
    expect(servicio.lecturasPedidas).toBe(0)
    expect(await leerHojasPendientes(servicio, db)).toEqual({
      leidas: 2,
      errores: 0,
    })
  })

  it('no vuelve a subir la foto si solo falló la lectura', async () => {
    const servicio = crearServicioSimulado()
    const hoja = await capturarHoja(imagen(), undefined, db)
    let subidas = 0
    const contar = {
      ...servicio,
      subir: (...a: Parameters<typeof servicio.subir>) => {
        subidas++
        return servicio.subir(...a)
      },
    }
    servicio.fallar('sesion')
    // Primera llamada (subir) falla por sesión; la hoja sigue sin ruta.
    await expect(leerHojasPendientes(contar, db)).rejects.toMatchObject({
      tipo: 'sesion',
    })
    expect((await db.hojas.get(hoja.id))?.rutaImagen).toBeUndefined()
    await leerHojasPendientes(contar, db)
    expect(subidas).toBe(2)
    expect((await db.hojas.get(hoja.id))?.estado).toBe('por-revisar')
  })

  it('un rechazo marca error en esa hoja y sigue con las demás', async () => {
    const servicio = crearServicioSimulado()
    const a = await capturarHoja(imagen(), undefined, db)
    const b = await capturarHoja(imagen(), undefined, db)
    servicio.fallar('rechazo')
    expect(await leerHojasPendientes(servicio, db)).toEqual({
      leidas: 1,
      errores: 1,
    })
    expect(await db.hojas.get(a.id)).toMatchObject({
      estado: 'error',
      errorLectura: 'Falla simulada (rechazo)',
    })
    expect((await db.hojas.get(b.id))?.estado).toBe('por-revisar')
  })

  it('no pisa una hoja que alguien confirmó o descartó mientras se leía', async () => {
    const servicio = crearServicioSimulado()
    const hoja = await capturarHoja(imagen(), undefined, db)
    const lento = {
      ...servicio,
      leer: async (...a: Parameters<typeof servicio.leer>) => {
        await db.hojas.update(hoja.id, { estado: 'descartada' })
        return servicio.leer(...a)
      },
    }
    expect(await leerHojasPendientes(lento, db)).toEqual({
      leidas: 0,
      errores: 0,
    })
    expect((await db.hojas.get(hoja.id))?.estado).toBe('descartada')
  })

  it('retoma lecturas abandonadas y omite hojas sin foto en el dispositivo', async () => {
    const hoja = await capturarHoja(imagen(), undefined, db)
    await db.hojas.update(hoja.id, {
      estado: 'leyendo',
      updatedAt: new Date(Date.now() - 60_000).toISOString(),
    })
    expect(await hojasPorLeer(db)).toHaveLength(0)
    const despues = new Date(Date.now() + LECTURA_ABANDONADA_MS)
    expect(await hojasPorLeer(db, despues)).toHaveLength(1)
    await db.imagenesHoja.delete(hoja.id)
    expect(await hojasPorLeer(db, despues)).toHaveLength(0)
  })

  it('sube la foto de una hoja que se pasó a mano sin leerse', async () => {
    const servicio = crearServicioSimulado()
    const hoja = await capturarHoja(imagen(), undefined, db)
    await confirmarHoja(
      hoja.id,
      { nueva: { nombres: 'Ana', apellidoPaterno: 'Ruiz', telefonos: [] } },
      {
        valores: {
          fecha: '2026-11-20',
          medico: 'Dra. Laura',
          motivo: 'Tamizaje',
        },
        estudios: [],
      },
      db,
    )
    expect(await fotosPorSubir(db)).toHaveLength(1)
    servicio.fallar('red')
    await expect(leerHojasPendientes(servicio, db)).rejects.toMatchObject({
      tipo: 'red',
    })
    await leerHojasPendientes(servicio, db)
    expect(servicio.lecturasPedidas).toBe(0)
    expect(servicio.archivos.has(`${hoja.id}.jpg`)).toBe(true)
    expect(await db.hojas.get(hoja.id)).toMatchObject({
      estado: 'confirmada',
      rutaImagen: `${hoja.id}.jpg`,
    })
    expect(await fotosPorSubir(db)).toHaveLength(0)
  })

  it('con el programador, reintenta tras un fallo de red', async () => {
    const servicio = crearServicioSimulado()
    const hoja = await capturarHoja(imagen(), undefined, db)
    servicio.fallar('red')
    const p = crearProgramador({
      sincronizar: () => leerHojasPendientes(servicio, db),
      puede: () => true,
      esperaBaseMs: 1,
      azar: () => 0.5,
    })
    await p.ahora()
    expect(p.obtenerEstado().error?.tipo).toBe('red')
    await new Promise((r) => setTimeout(r, 30))
    p.detener()
    expect((await db.hojas.get(hoja.id))?.estado).toBe('por-revisar')
  })
})
