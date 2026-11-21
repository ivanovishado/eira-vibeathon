import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { LIMITE_LECTOR_MS } from '../../supabase/functions/_shared/lecturaHoja'
import { fetchConLimite } from '../cuenta/cliente'
import { crearServicioSupabase, LIMITE_LECTURA_MS } from './servicio'

describe('crearServicioSupabase().leer', () => {
  it('espera a la función más que ella al lector, sin el límite general de 20 s', async () => {
    expect(LIMITE_LECTURA_MS).toBeGreaterThan(LIMITE_LECTOR_MS)
    const invoke = vi.fn(async () => ({
      data: { valores: {}, dudosos: [], ilegibles: [], modelo: 'm' },
      error: null,
    }))
    const cliente = {
      auth: {
        getSession: async () => ({ data: { session: {} }, error: null }),
      },
      functions: { invoke },
    } as unknown as SupabaseClient
    await crearServicioSupabase(async () => cliente).leer('a.jpg', [])
    const opciones = (invoke.mock.calls[0] as unknown[])[1] as {
      signal: AbortSignal
    }

    // El fetch global del cliente deja pasar esa señal tal cual.
    const f = vi.fn(
      async (..._args: Parameters<typeof fetch>) => new Response(),
    )
    vi.stubGlobal('fetch', f)
    await fetchConLimite('https://ejemplo.test', { signal: opciones.signal })
    vi.unstubAllGlobals()
    expect(f.mock.calls[0]![1]?.signal).toBe(opciones.signal)
  })

  it('un error de configuración del lector no se reintenta: queda visible', async () => {
    const respuesta = new Response(
      JSON.stringify({
        error: 'La llave de OCR.space no es válida.',
        tipo: 'config',
      }),
      { status: 500 },
    )
    const cliente = {
      auth: {
        getSession: async () => ({ data: { session: {} }, error: null }),
      },
      functions: {
        invoke: async () => ({
          data: null,
          error: { message: 'Edge Function error', context: respuesta },
        }),
      },
    } as unknown as SupabaseClient
    const e = await crearServicioSupabase(async () => cliente)
      .leer('a.jpg', [])
      .catch((x) => x)
    expect(e.tipo).toBe('rechazo')
    expect(e.message).toMatch(/Configuración del lector: La llave/)
  })
})
