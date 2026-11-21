import { describe, expect, it, vi } from 'vitest'
import { reducirHastaCaber, TAMANO_MAXIMO_FOTO } from './imagen'

describe('reducirHastaCaber', () => {
  it('se queda con la primera versión que pesa menos de 1 MB', async () => {
    const pesos = [1_400_000, 1_100_000, 900_000]
    const comprimir = vi.fn(async () => new ArrayBuffer(pesos.shift() ?? 1))
    const datos = await reducirHastaCaber(comprimir)
    expect(datos.byteLength).toBe(900_000)
    expect(TAMANO_MAXIMO_FOTO).toBeLessThan(1024 * 1024)
    // Primero baja la calidad a 2000 px, luego la resolución.
    expect(comprimir.mock.calls).toEqual([
      [2000, 0.85],
      [2000, 0.75],
      [1800, 0.7],
    ])
  })

  it('si nada cabe, lo dice', async () => {
    await expect(
      reducirHastaCaber(async () => new ArrayBuffer(2_000_000)),
    ).rejects.toThrow(/pesada/)
  })
})
