import { db as dbPorDefecto, type EiraDB, type ImagenHoja } from '../db/schema'
import type { ImagenCapturada } from './hojas'
import type { ServicioHojas } from './servicio'

export const LADO_MAYOR = 2000
const LADO_MINIATURA = 320

async function aJpeg(
  fuente: ImageBitmap,
  ladoMayor: number,
  calidad: number,
): Promise<ArrayBuffer> {
  const escala = Math.min(1, ladoMayor / Math.max(fuente.width, fuente.height))
  const ancho = Math.round(fuente.width * escala)
  const alto = Math.round(fuente.height * escala)
  const lienzo = document.createElement('canvas')
  lienzo.width = ancho
  lienzo.height = alto
  const ctx = lienzo.getContext('2d')
  if (!ctx) throw new Error('El navegador no puede procesar imágenes.')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, ancho, alto)
  ctx.drawImage(fuente, 0, 0, ancho, alto)
  const blob = await new Promise<Blob | null>((r) =>
    lienzo.toBlob(r, 'image/jpeg', calidad),
  )
  if (!blob) throw new Error('No se pudo comprimir la foto.')
  return blob.arrayBuffer()
}

/** Reduce la foto en el dispositivo (lado mayor ~2000 px, JPEG) y saca una miniatura. */
export async function reducirImagen(archivo: Blob): Promise<ImagenCapturada> {
  let fuente: ImageBitmap
  try {
    fuente = await createImageBitmap(archivo, {
      imageOrientation: 'from-image',
    })
  } catch {
    throw new Error(
      'No se pudo abrir la imagen; prueba con una foto JPEG o PNG.',
    )
  }
  try {
    return {
      datos: await aJpeg(fuente, LADO_MAYOR, 0.85),
      miniatura: await aJpeg(fuente, LADO_MINIATURA, 0.7),
      tipo: 'image/jpeg',
    }
  } finally {
    fuente.close()
  }
}

/**
 * Foto de la hoja: la local si existe; si no, la descarga de Storage y la guarda en
 * el dispositivo para la próxima vez.
 */
export async function obtenerImagen(
  hoja: { id: string; rutaImagen?: string },
  servicio: ServicioHojas | undefined,
  db: EiraDB = dbPorDefecto,
  miniatura: (datos: Blob) => Promise<ArrayBuffer> = async (b) =>
    (await reducirImagen(b)).miniatura,
): Promise<ImagenHoja | undefined> {
  const local = await db.imagenesHoja.get(hoja.id)
  if (local) return local
  if (!hoja.rutaImagen || !servicio) return undefined
  const { datos, tipo } = await servicio.descargar(hoja.rutaImagen)
  const imagen: ImagenHoja = {
    hojaId: hoja.id,
    datos,
    tipo,
    miniatura: await miniatura(new Blob([datos], { type: tipo })).catch(
      () => datos,
    ),
  }
  await db.imagenesHoja.put(imagen)
  return imagen
}
