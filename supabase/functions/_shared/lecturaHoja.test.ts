import { describe, expect, it, vi } from 'vitest'
import {
  analizarRespuestaGemini,
  construirEsquema,
  construirPrompt,
  ErrorLectura,
  leerHojaConGemini,
  normalizarFecha,
  validarCampos,
  type CampoLectura,
} from './lecturaHoja'

const campos: CampoLectura[] = [
  { id: 'paciente.nombres', etiqueta: 'Nombre', tipo: 'texto' },
  { id: 'paciente.fechaNacimiento', etiqueta: 'Nacimiento', tipo: 'fecha' },
  {
    id: 'consulta.signosVitales.pesoKg',
    etiqueta: 'Peso (kg)',
    tipo: 'numero',
  },
  { id: 'consulta.diagnostico', etiqueta: 'Diagnóstico', tipo: 'parrafo' },
]

const respuesta = (datos: unknown) => ({
  candidates: [{ content: { parts: [{ text: JSON.stringify(datos) }] } }],
})

describe('prompt y esquema', () => {
  it('usa llaves sin puntos y pide todos los campos', () => {
    const esquema = construirEsquema(campos)
    expect(esquema.required).toEqual([
      'paciente__nombres',
      'paciente__fechaNacimiento',
      'consulta__signosVitales__pesoKg',
      'consulta__diagnostico',
    ])
    expect(construirPrompt(campos)).toContain('No completes')
  })

  it('valida los campos que manda el cliente', () => {
    expect(validarCampos(campos)).toHaveLength(4)
    expect(() => validarCampos([])).toThrow(ErrorLectura)
    expect(() =>
      validarCampos([{ id: '1; drop', etiqueta: 'x', tipo: 'texto' }]),
    ).toThrow()
  })
})

describe('analizarRespuestaGemini', () => {
  it('ilegible y vacío quedan sin valor; dudoso se marca', () => {
    const r = analizarRespuestaGemini(
      respuesta({
        paciente__nombres: { valor: 'Rosa', estado: 'dudoso' },
        paciente__fechaNacimiento: { valor: '14/03/1978', estado: 'claro' },
        consulta__signosVitales__pesoKg: { valor: '68,5 kg', estado: 'claro' },
        consulta__diagnostico: { valor: 'algo inventado', estado: 'ilegible' },
      }),
      campos,
      'gemini-2.5-flash',
    )
    expect(r.valores).toEqual({
      'paciente.nombres': 'Rosa',
      'paciente.fechaNacimiento': '1978-03-14',
      'consulta.signosVitales.pesoKg': '68.5',
    })
    expect(r.dudosos).toEqual(['paciente.nombres'])
    expect(r.ilegibles).toEqual(['consulta.diagnostico'])
  })

  it('descarta lo que no tiene formato y lo marca dudoso', () => {
    const r = analizarRespuestaGemini(
      respuesta({
        paciente__fechaNacimiento: { valor: '31/02/1978', estado: 'claro' },
        consulta__signosVitales__pesoKg: { valor: 'sesenta', estado: 'claro' },
      }),
      campos,
      'm',
    )
    expect(r.valores).toEqual({})
    expect(r.dudosos).toEqual([
      'paciente.fechaNacimiento',
      'consulta.signosVitales.pesoKg',
    ])
  })

  it('reporta bloqueos y JSON inválido', () => {
    expect(() =>
      analizarRespuestaGemini(
        { promptFeedback: { blockReason: 'SAFETY' } },
        campos,
        'm',
      ),
    ).toThrow(/SAFETY/)
    expect(() =>
      analizarRespuestaGemini(
        { candidates: [{ content: { parts: [{ text: '{' }] } }] },
        campos,
        'm',
      ),
    ).toThrow(/JSON/)
  })

  it('normaliza fechas', () => {
    expect(normalizarFecha('2026-1-5')).toEqual({
      fecha: '2026-01-05',
      convertida: false,
    })
    expect(normalizarFecha('ayer')).toBeUndefined()
  })
})

describe('leerHojaConGemini', () => {
  it('manda la llave en x-goog-api-key y JSON estructurado', async () => {
    const f = vi.fn(async (..._args: Parameters<typeof fetch>) =>
      Response.json(
        respuesta({ paciente__nombres: { valor: 'Ana', estado: 'claro' } }),
      ),
    )
    const r = await leerHojaConGemini({
      apiKey: 'llave-de-prueba',
      campos,
      imagen: new Uint8Array([255, 216]),
      tipoImagen: 'image/jpeg',
      fetch: f as typeof fetch,
    })
    expect(r).toMatchObject({
      valores: { 'paciente.nombres': 'Ana' },
      modelo: 'gemini-2.5-flash',
    })
    const [url, init] = f.mock.calls[0]
    expect(String(url)).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    )
    expect((init!.headers as Record<string, string>)['x-goog-api-key']).toBe(
      'llave-de-prueba',
    )
    const cuerpo = JSON.parse(String(init!.body))
    expect(cuerpo.generationConfig.responseMimeType).toBe('application/json')
    expect(cuerpo.contents[0].parts[0].inlineData).toEqual({
      mimeType: 'image/jpeg',
      data: '/9g=',
    })
  })

  it('429 y 5xx son de red (se reintentan)', async () => {
    const f = async () => new Response('saturado', { status: 503 })
    await expect(
      leerHojaConGemini({
        apiKey: 'k',
        campos,
        imagen: new Uint8Array(),
        tipoImagen: 'image/jpeg',
        fetch: f as typeof fetch,
      }),
    ).rejects.toMatchObject({ tipo: 'red' })
  })
})
