/// <reference types="node" />
// Lee una foto de hoja desde la terminal con el mismo lector y análisis que la Edge
// Function:  OCR_SPACE_API_KEY=... npm run leer-hoja -- foto.jpg
// Otro lector:  npm run leer-hoja -- --lector gemini foto.jpg  (o LECTOR_HOJAS=gemini).
// Con --crudo imprime también la respuesta tal cual la devolvió el servicio.
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { parseArgs } from 'node:util'
import { ErrorLectura } from '../supabase/functions/_shared/lecturaHoja.ts'
import {
  elegirLector,
  leerHoja,
  LECTORES,
} from '../supabase/functions/_shared/lectores.ts'
import { CAMPOS_LECTURA } from '../src/hojas/campos.ts'

const TIPOS: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { lector: { type: 'string' }, crudo: { type: 'boolean' } },
})
const ruta = positionals[0]
if (!ruta) {
  console.error(
    `Uso: npm run leer-hoja -- [--lector ${LECTORES.join('|')}] [--crudo] <imagen>`,
  )
  process.exit(2)
}
const tipoImagen = TIPOS[extname(ruta).toLowerCase()]
if (!tipoImagen) {
  console.error('La imagen debe ser JPEG, PNG o WebP.')
  process.exit(2)
}
const entorno = (nombre: string) =>
  nombre === 'LECTOR_HOJAS' && values.lector
    ? values.lector
    : process.env[nombre]

try {
  const lector = elegirLector(entorno)
  console.error(`Lector: ${lector}`)
  const lectura = await leerHoja(
    entorno,
    {
      campos: CAMPOS_LECTURA,
      imagen: new Uint8Array(await readFile(ruta)),
      tipoImagen,
      alResponder: values.crudo
        ? (r) => console.error(JSON.stringify(r, null, 2))
        : undefined,
    },
    lector,
  )
  console.log(JSON.stringify(lectura, null, 2))
} catch (e) {
  console.error(e instanceof ErrorLectura ? `${e.tipo}: ${e.message}` : e)
  process.exit(1)
}
