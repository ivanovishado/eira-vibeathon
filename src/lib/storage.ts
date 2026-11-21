/** Pide al navegador que no borre los datos locales cuando falte espacio. */
export async function pedirAlmacenamientoPersistente(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  if (await navigator.storage.persisted()) return true
  return navigator.storage.persist()
}

export async function almacenamientoEsPersistente(): Promise<boolean> {
  return (await navigator.storage?.persisted?.()) ?? false
}
