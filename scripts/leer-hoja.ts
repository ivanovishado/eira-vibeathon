/// <reference types="node" />
// Lee una foto de hoja con Gemini desde la terminal, con el mismo prompt, esquema y
// análisis que la Edge Function:  GEMINI_API_KEY=... npm run leer-hoja -- foto.jpg
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import {
  ErrorLectura,
  leerHojaConGemini,
  MODELO_POR_DEFECTO,
} from '../supabase/functions/_shared/lecturaHoja.ts'
import { CAMPOS_LECTURA } from '../src/hojas/campos.ts'

const TIPOS: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

const ruta = process.argv[2]
const apiKey = process.env.GEMINI_API_KEY
if (!ruta) {
  console.error('Uso: npm run leer-hoja -- <imagen>')
  process.exit(2)
}
if (!apiKey) {
  console.error('Falta GEMINI_API_KEY en el entorno.')
  process.exit(2)
}
const tipoImagen = TIPOS[extname(ruta).toLowerCase()]
if (!tipoImagen) {
  console.error('La imagen debe ser JPEG, PNG o WebP.')
  process.exit(2)
}

try {
  const lectura = await leerHojaConGemini({
    apiKey,
    campos: CAMPOS_LECTURA,
    imagen: new Uint8Array(await readFile(ruta)),
    tipoImagen,
    modelo: process.env.GEMINI_MODEL || MODELO_POR_DEFECTO,
  })
  console.log(JSON.stringify(lectura, null, 2))
} catch (e) {
  console.error(e instanceof ErrorLectura ? `${e.tipo}: ${e.message}` : e)
  process.exit(1)
}
