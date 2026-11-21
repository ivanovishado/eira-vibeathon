import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { LIMITE_GEMINI_MS } from '../../supabase/functions/_shared/lecturaHoja'
import { fetchConLimite } from '../cuenta/cliente'
import { crearServicioSupabase, LIMITE_LECTURA_MS } from './servicio'

describe('crearServicioSupabase().leer', () => {
  it('espera a la función más que ella a Gemini, sin el límite general de 20 s', async () => {
    expect(LIMITE_LECTURA_MS).toBeGreaterThan(LIMITE_GEMINI_MS)
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
})
