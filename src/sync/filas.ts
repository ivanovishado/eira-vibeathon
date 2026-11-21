import type { ConfigTabla } from './tablas'

export type Fila = Record<string, unknown>

export const aSnake = (campo: string) =>
  campo.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`)

/** Campos con marca de tiempo (`createdAt`, `updatedAt`, …). */
const esMarcaDeTiempo = (campo: string) => campo.endsWith('At')

/** Registro local → fila del servidor. Los campos vacíos van como null para borrarlos. */
export function aFilaRemota(config: ConfigTabla, registro: object): Fila {
  const fila: Fila = {}
  for (const campo of config.campos)
    fila[aSnake(campo)] = (registro as Fila)[campo] ?? null
  return fila
}

/** Fila del servidor → registro local. Ignora columnas que solo existen en el servidor. */
export function aRegistroLocal(config: ConfigTabla, fila: Fila): Fila {
  const registro: Fila = {}
  for (const campo of config.campos) {
    const valor = fila[aSnake(campo)]
    if (valor === null || valor === undefined) continue
    registro[campo] =
      esMarcaDeTiempo(campo) && typeof valor === 'string'
        ? new Date(valor).toISOString()
        : valor
  }
  return registro
}
