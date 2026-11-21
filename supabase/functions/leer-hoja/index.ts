// Lee una hoja de consulta en papel con Gemini. Exige sesión válida, toma la foto del
// bucket privado `hojas` y devuelve los campos leídos y la lista de campos dudosos.
// Secretos: GEMINI_API_KEY (obligatorio) y GEMINI_MODEL (opcional).
import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  ErrorLectura,
  leerHojaConGemini,
  MODELO_POR_DEFECTO,
  validarCampos,
} from '../_shared/lecturaHoja.ts'

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

  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey)
    return responder(
      { error: 'Falta configurar GEMINI_API_KEY en el servidor.', tipo: 'config' },
      500,
    )

  try {
    const cuerpo = (await req.json().catch(() => ({}))) as {
      ruta?: unknown
      campos?: unknown
    }
    if (typeof cuerpo.ruta !== 'string' || !RUTA_VALIDA.test(cuerpo.ruta))
      throw new ErrorLectura('peticion', 'Ruta de foto no válida.')
    const campos = validarCampos(cuerpo.campos)

    // Con la sesión de quien llama: las políticas de Storage deciden si puede leerla.
    const { data: foto, error: errorFoto } = await supabase.storage
      .from('hojas')
      .download(cuerpo.ruta)
    if (errorFoto || !foto)
      return responder(
        { error: 'No se encontró la foto en el servidor.', tipo: 'peticion' },
        404,
      )

    const lectura = await leerHojaConGemini({
      apiKey,
      campos,
      imagen: new Uint8Array(await foto.arrayBuffer()),
      tipoImagen: foto.type || 'image/jpeg',
      modelo: Deno.env.get('GEMINI_MODEL') || MODELO_POR_DEFECTO,
      url: Deno.env.get('GEMINI_API_URL') || undefined,
      signal: AbortSignal.timeout(90_000),
    })
    return responder(lectura)
  } catch (e) {
    if (e instanceof ErrorLectura)
      return responder(
        { error: e.message, tipo: e.tipo },
        e.tipo === 'peticion' ? 400 : e.tipo === 'red' ? 503 : 422,
      )
    console.error(e)
    return responder({ error: 'Error inesperado al leer la hoja.', tipo: 'red' }, 500)
  }
})
