import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { crearProgramador } from './programador'
import { ErrorSincronizacion } from './remoto'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

function preparar(fallas: ErrorSincronizacion[] = []) {
  const sincronizar = vi.fn(async () => {
    const f = fallas.shift()
    if (f) throw f
  })
  let puede = true
  const p = crearProgramador({
    sincronizar,
    puede: () => puede,
    esperaBaseMs: 1_000,
    esperaMaxMs: 8_000,
    periodoMs: 60_000,
    agruparMs: 500,
    azar: () => 0.5,
  })
  return { p, sincronizar, setPuede: (v: boolean) => (puede = v) }
}

const red = () => new ErrorSincronizacion('red', 'Failed to fetch')

describe('programador', () => {
  it('reintenta con espera exponencial hasta lograrlo', async () => {
    const { p, sincronizar } = preparar([red(), red(), red()])
    await p.ahora()
    expect(p.obtenerEstado().error?.tipo).toBe('red')

    await vi.advanceTimersByTimeAsync(999)
    expect(sincronizar).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(sincronizar).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(sincronizar).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(4_000)
    expect(sincronizar).toHaveBeenCalledTimes(4)
    expect(p.obtenerEstado().error).toBeUndefined()
    expect(p.obtenerEstado().ultimoExito).toBeDefined()
  })

  it('la espera no pasa del máximo', async () => {
    const { p, sincronizar } = preparar(Array.from({ length: 10 }, red))
    await p.ahora()
    await vi.advanceTimersByTimeAsync(1_000 + 2_000 + 4_000 + 8_000)
    expect(sincronizar).toHaveBeenCalledTimes(5)
    await vi.advanceTimersByTimeAsync(8_000)
    expect(sincronizar).toHaveBeenCalledTimes(6)
  })

  it('sin red o sin sesión no intenta', async () => {
    const { p, sincronizar, setPuede } = preparar()
    setPuede(false)
    await p.ahora()
    p.pronto()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(sincronizar).not.toHaveBeenCalled()
  })

  it('un error de sesión no se reintenta solo', async () => {
    const { p, sincronizar } = preparar([
      new ErrorSincronizacion('sesion', 'Inicia sesión'),
    ])
    await p.ahora()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(sincronizar).toHaveBeenCalledTimes(1)
    expect(p.obtenerEstado().proximoIntento).toBeUndefined()
  })

  it('junta los cambios locales y no corre dos a la vez', async () => {
    let terminar = () => {}
    const sincronizar = vi.fn(() => new Promise<void>((r) => (terminar = r)))
    const p = crearProgramador({
      sincronizar,
      puede: () => true,
      agruparMs: 500,
    })
    p.pronto()
    p.pronto()
    await vi.advanceTimersByTimeAsync(500)
    expect(sincronizar).toHaveBeenCalledTimes(1)
    expect(p.obtenerEstado().sincronizando).toBe(true)

    void p.ahora()
    p.pronto()
    expect(sincronizar).toHaveBeenCalledTimes(1)
    terminar()
    await vi.advanceTimersByTimeAsync(0)
    expect(sincronizar).toHaveBeenCalledTimes(2)
    terminar()
    await vi.advanceTimersByTimeAsync(0)
    expect(p.obtenerEstado().sincronizando).toBe(false)
  })

  it('sincronizar ahora reinicia la espera tras fallos', async () => {
    const { p, sincronizar } = preparar([red(), red()])
    await p.ahora()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(sincronizar).toHaveBeenCalledTimes(2)
    await p.ahora()
    expect(sincronizar).toHaveBeenCalledTimes(3)
    expect(p.obtenerEstado().error).toBeUndefined()
  })
})
