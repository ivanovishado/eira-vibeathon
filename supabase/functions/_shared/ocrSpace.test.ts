import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { CAMPOS_LECTURA } from '../../../src/hojas/campos'
import { ErrorLectura } from './lecturaHoja'
import { elegirLector, leerHoja } from './lectores'
import {
  analizarRespuestaOcrSpace,
  errorHttpOcrSpace,
  leerHojaConOcrSpace,
  TAMANO_MAXIMO_OCR,
} from './ocrSpace'

const grabacion = (nombre: string) =>
  readFileSync(
    resolve('supabase/functions/_shared/grabaciones', nombre),
    'utf8',
  )
const hoja1 = JSON.parse(grabacion('ocrspace-hoja-1.json'))
const hoja2 = JSON.parse(grabacion('ocrspace-hoja-2.json'))

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'content-type': 'application/json' },
  })
const imagen = new Uint8Array([0xff, 0xd8, 0xff])
const sinEspera = async () => {}

describe('OCR.space con respuestas grabadas', () => {
  it('hoja 1: lee todos los campos y normaliza fechas', () => {
    const l = analizarRespuestaOcrSpace(hoja1, CAMPOS_LECTURA, 'ocr')
    expect(l.valores).toMatchObject({
      'paciente.nombres': 'Rosa Elena',
      'paciente.apellidoPaterno': 'Martinez',
      'paciente.fechaNacimiento': '1978-03-14',
      'paciente.celular': '951 123 4567',
      'paciente.comunidad': 'San Miguel del Valle',
      'paciente.municipio': 'Tlacolula',
      'consulta.fecha': '2026-11-20',
      'consulta.medico': 'Dra. Laura Gómez',
      'consulta.signosVitales.pesoKg': '68.5',
      'consulta.signosVitales.tallaCm': '156',
      'consulta.signosVitales.presionArterial': '130/85',
      'consulta.signosVitales.frecuenciaCardiaca': '78',
      'consulta.signosVitales.temperaturaC': '36.6',
      'consulta.plan': 'Mastografía en 1 año. Papanicolaou en próxima brigada.',
    })
    // El garabato de la CURP llega como texto inventado; lo filtra el formulario.
    expect(l.valores['paciente.curp']).toBe('Mwwwn')
    expect(l.dudosos).toEqual([])
    expect(l.ilegibles).toEqual([])
  })

  it('hoja 2: lo vacío o ilegible queda dudoso y el año de dos dígitos también', () => {
    const l = analizarRespuestaOcrSpace(hoja2, CAMPOS_LECTURA, 'ocr')
    expect(l.valores).toMatchObject({
      'paciente.nombres': 'Guadalupe',
      'paciente.apellidoPaterno': 'Hernández',
      'paciente.fechaNacimiento': '1965-08-02',
      'consulta.signosVitales.pesoKg': '74',
      'consulta.signosVitales.presionArterial': '140/90',
      'consulta.signosVitales.temperaturaC': '36.8',
    })
    // Los títulos de sección no se cuelan en los campos vacíos.
    expect(l.valores['consulta.antecedentes']).toBeUndefined()
    expect(l.valores['consulta.signosVitales.tallaCm']).toBeUndefined()
    expect(new Set(l.dudosos)).toEqual(
      new Set([
        'paciente.fechaNacimiento',
        'paciente.celular',
        'paciente.curp',
        'consulta.signosVitales.tallaCm',
        'consulta.signosVitales.frecuenciaCardiaca',
        'consulta.antecedentes',
      ]),
    )
  })

  it('manda la foto con la llave en el encabezado y Engine 3', async () => {
    const f = vi.fn(async (..._a: Parameters<typeof fetch>) => json(hoja1))
    const l = await leerHojaConOcrSpace({
      apiKey: 'llave',
      campos: CAMPOS_LECTURA,
      imagen,
      tipoImagen: 'image/jpeg',
      fetch: f,
    })
    expect(l.modelo).toBe('ocr.space (Engine 3)')
    const [url, init] = f.mock.calls[0]!
    expect(url).toBe('https://api.ocr.space/parse/image')
    expect((init!.headers as Record<string, string>).apikey).toBe('llave')
    const cuerpo = init!.body as FormData
    expect(cuerpo.get('OCREngine')).toBe('3')
    expect(cuerpo.get('file')).toBeInstanceOf(Blob)
    expect(cuerpo.get('apikey')).toBeNull()
  })

  it('reintenta 429 momentáneos y fallos de red, con espera', async () => {
    const esperas: number[] = []
    const f = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(
        json({ error: 'E553: Rate limit', retryAfter: 3 }, 429),
      )
      .mockResolvedValueOnce(json(hoja2))
    const l = await leerHojaConOcrSpace({
      apiKey: 'k',
      campos: CAMPOS_LECTURA,
      imagen,
      tipoImagen: 'image/jpeg',
      fetch: f,
      esperar: async (ms) => void esperas.push(ms),
    })
    expect(l.valores['paciente.nombres']).toBe('Guadalupe')
    expect(esperas).toEqual([2000, 9000])
  })

  it('tras agotar los reintentos queda como error de red (la cola reintenta)', async () => {
    const f = vi.fn(async () => json({ error: 'busy' }, 503))
    const e = await leerHojaConOcrSpace({
      apiKey: 'k',
      campos: CAMPOS_LECTURA,
      imagen,
      tipoImagen: 'image/jpeg',
      fetch: f,
      esperar: sinEspera,
    }).catch((x) => x)
    expect(e).toBeInstanceOf(ErrorLectura)
    expect(e.tipo).toBe('red')
    expect(f).toHaveBeenCalledTimes(3)
  })

  it('llave inválida y cuota agotada son errores de configuración, sin reintentar', async () => {
    for (const [status, cuerpo] of [
      [403, grabacion('ocrspace-403-llave.json')],
      [429, grabacion('ocrspace-429-e584.json')],
      [429, JSON.stringify({ error: 'E553: quota', retryAfter: 86_000 })],
      [
        403,
        'You may only perform this action upto maximum 25000 number of times within 2592000 seconds',
      ],
    ] as const) {
      const f = vi.fn(async () => new Response(cuerpo, { status }))
      const e = await leerHojaConOcrSpace({
        apiKey: 'k',
        campos: CAMPOS_LECTURA,
        imagen,
        tipoImagen: 'image/jpeg',
        fetch: f,
        esperar: sinEspera,
      }).catch((x) => x)
      expect(e.tipo, cuerpo).toBe('config')
      expect(f).toHaveBeenCalledTimes(1)
    }
    expect(
      errorHttpOcrSpace(429, grabacion('ocrspace-429-e584.json')).message,
    ).toMatch(/OCR_SPACE_API_KEY/)
  })

  it('revisa el cuerpo de las respuestas 200 con error', () => {
    const conError = (r: object) => {
      try {
        analizarRespuestaOcrSpace(r, CAMPOS_LECTURA, 'ocr')
      } catch (e) {
        return e as ErrorLectura
      }
      throw new Error('no falló')
    }
    expect(
      conError({
        OCRExitCode: 3,
        IsErroredOnProcessing: true,
        ErrorMessage: ['Unable to recognize the file type'],
      }).tipo,
    ).toBe('modelo')
    expect(
      conError({
        OCRExitCode: 4,
        IsErroredOnProcessing: true,
        ErrorMessage: [
          'File failed validation. File size exceeds the maximum permissible file size limit of 1024 KB',
        ],
      }).tipo,
    ).toBe('peticion')
    expect(
      conError({
        OCRExitCode: 1,
        IsErroredOnProcessing: false,
        ParsedResults: [
          { ParsedText: 'Lista del súper\nhuevos', FileParseExitCode: 1 },
        ],
      }).message,
    ).toMatch(/ninguna etiqueta/)
  })

  it('no manda fotos de más de 1 MB', async () => {
    const f = vi.fn<typeof fetch>()
    const e = await leerHojaConOcrSpace({
      apiKey: 'k',
      campos: CAMPOS_LECTURA,
      imagen: new Uint8Array(TAMANO_MAXIMO_OCR + 1),
      tipoImagen: 'image/jpeg',
      fetch: f,
    }).catch((x) => x)
    expect(e.tipo).toBe('peticion')
    expect(f).not.toHaveBeenCalled()
  })
})

describe('elección de lector', () => {
  const entorno = (v: Record<string, string>) => (n: string) => v[n]

  it('OCR.space por omisión, sin pedir la llave de Gemini', async () => {
    expect(elegirLector(entorno({}))).toBe('ocrspace')
    const f = vi.fn(async () => json(hoja1))
    const l = await leerHoja(entorno({ OCR_SPACE_API_KEY: 'k' }), {
      campos: CAMPOS_LECTURA,
      imagen,
      tipoImagen: 'image/jpeg',
      fetch: f,
    })
    expect(l.valores['paciente.nombres']).toBe('Rosa Elena')
  })

  it('Gemini por configuración, sin pedir la llave de OCR.space', async () => {
    const f = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({
        candidates: [{ content: { parts: [{ text: '{"campos":{}}' }] } }],
      }),
    )
    await leerHoja(entorno({ LECTOR_HOJAS: 'gemini', GEMINI_API_KEY: 'g' }), {
      campos: CAMPOS_LECTURA,
      imagen,
      tipoImagen: 'image/jpeg',
      fetch: f,
    })
    expect(String(f.mock.calls[0]![0])).toMatch(/generativelanguage/)
  })

  it('sin llave o con un lector desconocido: error de configuración', async () => {
    const sinLlave = await leerHoja(entorno({}), {
      campos: CAMPOS_LECTURA,
      imagen,
      tipoImagen: 'image/jpeg',
    }).catch((e) => e)
    expect(sinLlave.tipo).toBe('config')
    expect(sinLlave.message).toMatch(/OCR_SPACE_API_KEY/)
    expect(() => elegirLector(entorno({ LECTOR_HOJAS: 'tesseract' }))).toThrow(
      /LECTOR_HOJAS/,
    )
  })
})
