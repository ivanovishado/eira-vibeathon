import { useSyncExternalStore } from 'react'

function suscribir(avisar: () => void) {
  window.addEventListener('online', avisar)
  window.addEventListener('offline', avisar)
  return () => {
    window.removeEventListener('online', avisar)
    window.removeEventListener('offline', avisar)
  }
}

/** `true` si el navegador reporta conexión de red. */
export function useEnLinea(): boolean {
  return useSyncExternalStore(suscribir, () => navigator.onLine)
}
