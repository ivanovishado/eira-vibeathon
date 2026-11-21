import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchConLimite, limitePropio } from './cliente'

afterEach(() => {
  vi.unstubAllGlobals()
})

function espiarFetch() {
  const f = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response())
  vi.stubGlobal('fetch', f)
  return () => f.mock.calls[0]![1]?.signal
}

describe('fetchConLimite', () => {
  it('pone el límite general a las peticiones', async () => {
    const senal = espiarFetch()
    await fetchConLimite('https://ejemplo.test')
    expect(senal()).toBeInstanceOf(AbortSignal)
  })

  it('combina el límite general con la señal de quien llama', async () => {
    const senal = espiarFetch()
    const propia = new AbortController().signal
    await fetchConLimite('https://ejemplo.test', { signal: propia })
    expect(senal()).not.toBe(propia)
  })

  it('respeta un límite propio sin agregar el general', async () => {
    const senal = espiarFetch()
    const propia = limitePropio(120_000)
    await fetchConLimite('https://ejemplo.test', { signal: propia })
    expect(senal()).toBe(propia)
  })
})
