const dos = (n: number) => String(n).padStart(2, '0')

/** Fecha local del dispositivo en formato YYYY-MM-DD. */
export function hoyLocal(ahora = new Date()): string {
  return `${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())}`
}

function partes(fecha: string): [number, number, number] {
  const [a, m, d] = fecha.slice(0, 10).split('-').map(Number)
  return [a, m, d]
}

const formato = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

/** "2025-03-14" → "14 mar 2025". */
export function formatearFecha(fecha: string): string {
  const [a, m, d] = partes(fecha)
  if (!a || !m || !d) return fecha
  return formato.format(new Date(Date.UTC(a, m - 1, d))).replace('.', '')
}

/** Años cumplidos a la fecha `hoy` (ambas YYYY-MM-DD). */
export function edad(fechaNacimiento: string, hoy = hoyLocal()): number {
  const [an, mn, dn] = partes(fechaNacimiento)
  const [ah, mh, dh] = partes(hoy)
  return ah - an - (mh < mn || (mh === mn && dh < dn) ? 1 : 0)
}

/** Meses completos entre dos fechas YYYY-MM-DD. */
export function mesesEntre(desde: string, hasta: string): number {
  const [a1, m1, d1] = partes(desde)
  const [a2, m2, d2] = partes(hasta)
  return (a2 - a1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0)
}

const plural = (n: number, uno: string, varios: string) =>
  `${n} ${n === 1 ? uno : varios}`

/** "hoy", "hace 5 días", "hace 3 meses", "hace 1 año y 2 meses". */
export function haceCuanto(fecha: string, hoy = hoyLocal()): string {
  const [a1, m1, d1] = partes(fecha)
  const [a2, m2, d2] = partes(hoy)
  const dias = Math.round(
    (Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000,
  )
  if (dias < 0) return `en ${plural(-dias, 'día', 'días')}`
  if (dias === 0) return 'hoy'
  if (dias === 1) return 'ayer'
  const meses = mesesEntre(fecha, hoy)
  if (meses < 1) return `hace ${plural(dias, 'día', 'días')}`
  if (meses < 12) return `hace ${plural(meses, 'mes', 'meses')}`
  const anios = Math.floor(meses / 12)
  const resto = meses % 12
  return `hace ${plural(anios, 'año', 'años')}${resto ? ` y ${plural(resto, 'mes', 'meses')}` : ''}`
}
