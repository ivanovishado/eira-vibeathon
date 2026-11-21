const MESES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
]

function partes(fecha: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha)
  if (!m) return undefined
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const d = new Date(anio, mes - 1, dia)
  // Descarta fechas imposibles como 1980-02-31 o 1980-13-01.
  if (d.getMonth() !== mes - 1 || d.getDate() !== dia) return undefined
  return { anio, mes, dia }
}

/** Fecha local de hoy en formato YYYY-MM-DD. */
export function hoyISO(hoy = new Date()): string {
  const dos = (n: number) => String(n).padStart(2, '0')
  return `${hoy.getFullYear()}-${dos(hoy.getMonth() + 1)}-${dos(hoy.getDate())}`
}

/** Edad cumplida a la fecha `hoy`, o undefined si la fecha no es válida. */
export function calcularEdad(
  fechaNacimiento: string | undefined,
  hoy = new Date(),
): number | undefined {
  const f = fechaNacimiento ? partes(fechaNacimiento) : undefined
  if (!f) return undefined
  const yaCumplio =
    hoy.getMonth() + 1 > f.mes ||
    (hoy.getMonth() + 1 === f.mes && hoy.getDate() >= f.dia)
  return hoy.getFullYear() - f.anio - (yaCumplio ? 0 : 1)
}

/** "1980-03-05" → "5 mar 1980". */
export function formatearFecha(fecha: string): string {
  const f = partes(fecha)
  return f ? `${f.dia} ${MESES[f.mes - 1]} ${f.anio}` : fecha
}

/** "3411234567" → "341 123 4567". */
export function formatearTelefono(telefono: string): string {
  return telefono.length === 10
    ? `${telefono.slice(0, 3)} ${telefono.slice(3, 6)} ${telefono.slice(6)}`
    : telefono
}
