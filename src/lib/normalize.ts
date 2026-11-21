/** Minúsculas, sin acentos ni signos, espacios colapsados. "Ñ" se conserva como "n". */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Solo dígitos; quita el prefijo de país de México si viene incluido. */
export function normalizarTelefono(telefono: string): string {
  const digitos = telefono.replace(/\D/g, '')
  return digitos.length > 10 ? digitos.slice(-10) : digitos
}
