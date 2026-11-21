// Lee una hoja de consulta en papel. Exige sesión válida, toma la foto del bucket
// privado `hojas` y devuelve los campos leídos y la lista de campos dudosos.
// Secretos: LECTOR_HOJAS (`ocrspace` por omisión o `gemini`), OCR_SPACE_API_KEY
// (con ocrspace) y OCR_SPACE_ENGINE (opcional, 3); GEMINI_API_KEY (con gemini) y
// GEMINI_MODEL (opcional).
import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  ErrorLectura,
  LIMITE_LECTOR_MS,
  validarCampos,
  validarTitulos,
} from '../_shared/lecturaHoja.ts'
import { elegirLector, leerHoja } from '../_shared/lectores.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const responder = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

const RUTA_VALIDA = /^[\w-]+\.(jpe?g|png|webp)$/i

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')
    return responder({ error: 'Usa POST.', tipo: 'peticion' }, 405)

  const autorizacion = req.headers.get('Authorization') ?? ''
  if (!autorizacion.startsWith('Bearer '))
    return responder({ error: 'Falta la sesión.', tipo: 'sesion' }, 401)
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: autorizacion } } },
  )
  const { data: usuario, error: errorSesion } = await supabase.auth.getUser(
    autorizacion.slice('Bearer '.length),
  )
  if (errorSesion || !usuario.user)
    return responder({ error: 'La sesión no es válida.', tipo: 'sesion' }, 401)

  const entorno = (nombre: string) => Deno.env.get(nombre)
  try {
    const lector = elegirLector(entorno)
    const cuerpo = (await req.json().catch(() => ({}))) as {
      ruta?: unknown
      campos?: unknown
      titulos?: unknown
    }
    if (typeof cuerpo.ruta !== 'string' || !RUTA_VALIDA.test(cuerpo.ruta))
      throw new ErrorLectura('peticion', 'Ruta de foto no válida.')
    const campos = validarCampos(cuerpo.campos)
    const titulos = validarTitulos(cuerpo.titulos)

    // Con la sesión de quien llama: las políticas de Storage deciden si puede leerla.
    const { data: foto, error: errorFoto } = await supabase.storage
      .from('hojas')
      .download(cuerpo.ruta)
    if (errorFoto || !foto) {
      const e = errorFoto as { statusCode?: string; code?: string } | null
      return e?.statusCode === '404' || e?.code === 'NoSuchKey'
        ? responder(
            {
              error: 'No se encontró la foto en el servidor.',
              tipo: 'peticion',
            },
            404,
          )
        : responder(
            { error: 'No se pudo abrir la foto; se reintentará.', tipo: 'red' },
            503,
          )
    }

    const lectura = await leerHoja(
      entorno,
      {
        campos,
        titulos,
        imagen: new Uint8Array(await foto.arrayBuffer()),
        tipoImagen: foto.type || 'image/jpeg',
        signal: AbortSignal.timeout(LIMITE_LECTOR_MS),
      },
      lector,
    )
    return responder(lectura)
  } catch (e) {
    if (e instanceof ErrorLectura)
      return responder(
        { error: e.message, tipo: e.tipo },
        e.tipo === 'peticion'
          ? 400
          : e.tipo === 'red'
            ? 503
            : e.tipo === 'config'
              ? 500
              : 422,
      )
    console.error(e)
    return responder(
      { error: 'Error inesperado al leer la hoja.', tipo: 'red' },
      500,
    )
  }
})
