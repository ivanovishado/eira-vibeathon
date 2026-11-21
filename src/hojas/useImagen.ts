import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db, type Hoja } from '../db/schema'
import { obtenerImagen } from './imagen'
import { obtenerServicio } from './fondo'

/** URL temporal para unos bytes de imagen; se libera al desmontar. */
export function useUrlImagen(datos?: ArrayBuffer, tipo = 'image/jpeg') {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!datos) return
    const u = URL.createObjectURL(new Blob([datos], { type: tipo }))
    // La URL es un recurso del navegador que hay que crear y liberar aquí.
    // oxlint-disable-next-line react/set-state-in-effect
    setUrl(u)
    return () => {
      URL.revokeObjectURL(u)
      setUrl(undefined)
    }
  }, [datos, tipo])
  return url
}

/** Miniatura solo si la foto ya está en el dispositivo (no descarga). */
export function useMiniatura(hojaId: string) {
  const imagen = useLiveQuery(() => db.imagenesHoja.get(hojaId), [hojaId])
  return useUrlImagen(imagen?.miniatura, 'image/jpeg')
}

export type EstadoFoto =
  | { fase: 'cargando' }
  | { fase: 'lista'; url: string }
  | { fase: 'sin-foto'; motivo: string }

/** Foto completa: la local, o la descarga bajo demanda y la guarda. */
export function useFotoHoja(hoja?: Pick<Hoja, 'id' | 'rutaImagen'>) {
  const local = useLiveQuery(
    () => (hoja ? db.imagenesHoja.get(hoja.id) : undefined),
    [hoja?.id],
  )
  const [fallo, setFallo] = useState<{ clave: string; texto: string }>()
  const [intento, setIntento] = useState(0)
  const url = useUrlImagen(local?.datos, local?.tipo)
  const id = hoja?.id
  const ruta = hoja?.rutaImagen
  const descargar = local === undefined && Boolean(id)
  const clave = `${id}:${ruta}:${intento}`
  const error = fallo?.clave === clave ? fallo.texto : undefined
  const setError = (texto: string) => setFallo({ clave, texto })

  useEffect(() => {
    if (!descargar || !id) return
    let vigente = true
    obtenerImagen({ id, rutaImagen: ruta }, obtenerServicio())
      .then((img) => {
        if (vigente && !img)
          setError(
            ruta
              ? 'Este dispositivo no puede descargar la foto (falta servidor o sesión).'
              : 'La foto todavía no sube desde el dispositivo que la tomó.',
          )
      })
      .catch((e: unknown) => {
        if (vigente)
          setError(
            `No se pudo descargar la foto: ${e instanceof Error ? e.message : String(e)}`,
          )
      })
    return () => {
      vigente = false
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- setError depende de clave
  }, [descargar, id, ruta, clave])

  const estado: EstadoFoto = url
    ? { fase: 'lista', url }
    : error
      ? { fase: 'sin-foto', motivo: error }
      : { fase: 'cargando' }
  return { estado, reintentar: () => setIntento((n) => n + 1) }
}
