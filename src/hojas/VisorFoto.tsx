import { useEffect, useRef, useState } from 'react'

const ZOOM_MIN = 1
const ZOOM_MAX = 6

/**
 * Foto con zoom (botones, rueda con Ctrl o pellizco), desplazamiento (arrastrar) y
 * rotación. Con zoom 1 la foto ocupa el ancho del visor.
 */
export function VisorFoto({ url, alt }: { url: string; alt: string }) {
  const marco = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const [giro, setGiro] = useState(0)
  const [ancho, setAncho] = useState(0)
  const [natural, setNatural] = useState({ w: 3, h: 4 })
  const punteros = useRef(new Map<number, { x: number; y: number }>())
  const pellizco = useRef<{ distancia: number; zoom: number }>(undefined)

  useEffect(() => {
    const el = marco.current
    if (!el) return
    const ro = new ResizeObserver(() => setAncho(el.clientWidth))
    ro.observe(el)
    setAncho(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const acotar = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))

  /** Cambia el zoom manteniendo fijo el punto (x, y) del visor. */
  function hacerZoom(nuevo: number, x?: number, y?: number) {
    const el = marco.current
    const z = acotar(nuevo)
    if (!el) return setZoom(z)
    const px = x ?? el.clientWidth / 2
    const py = y ?? el.clientHeight / 2
    const factor = z / zoom
    const left = (el.scrollLeft + px) * factor - px
    const top = (el.scrollTop + py) * factor - py
    setZoom(z)
    requestAnimationFrame(() => el.scrollTo({ left, top }))
  }

  const girada = giro % 180 !== 0
  const anchoCaja = ancho * zoom
  const proporcion = girada ? natural.w / natural.h : natural.h / natural.w
  const altoCaja = anchoCaja * proporcion
  const anchoImagen = girada ? altoCaja : anchoCaja

  function distancia() {
    const [a, b] = [...punteros.current.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  const boton =
    'rounded-md bg-white/90 px-2.5 py-1 text-sm font-medium text-slate-800 shadow hover:bg-white disabled:opacity-40'

  return (
    <div className="relative h-full w-full bg-slate-800">
      <div
        ref={marco}
        className="h-full w-full cursor-grab touch-none overflow-auto overscroll-contain active:cursor-grabbing"
        onWheel={(e) => {
          if (!e.ctrlKey && !e.metaKey) return
          e.preventDefault()
          const r = e.currentTarget.getBoundingClientRect()
          hacerZoom(
            zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15),
            e.clientX - r.left,
            e.clientY - r.top,
          )
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
          if (punteros.current.size === 2)
            pellizco.current = { distancia: distancia(), zoom }
        }}
        onPointerMove={(e) => {
          const antes = punteros.current.get(e.pointerId)
          if (!antes) return
          punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
          if (punteros.current.size === 2 && pellizco.current) {
            hacerZoom(
              (pellizco.current.zoom * distancia()) / pellizco.current.distancia,
            )
            return
          }
          e.currentTarget.scrollLeft -= e.clientX - antes.x
          e.currentTarget.scrollTop -= e.clientY - antes.y
        }}
        onPointerUp={(e) => {
          punteros.current.delete(e.pointerId)
          if (punteros.current.size < 2) pellizco.current = undefined
        }}
        onPointerCancel={(e) => {
          punteros.current.delete(e.pointerId)
          pellizco.current = undefined
        }}
      >
        {ancho > 0 && (
          <div
            className="relative"
            style={{ width: anchoCaja, height: altoCaja }}
          >
            <img
              src={url}
              alt={alt}
              draggable={false}
              onLoad={(e) =>
                setNatural({
                  w: e.currentTarget.naturalWidth || 3,
                  h: e.currentTarget.naturalHeight || 4,
                })
              }
              className="absolute top-1/2 left-1/2 max-w-none select-none"
              style={{
                width: anchoImagen,
                transform: `translate(-50%, -50%) rotate(${giro}deg)`,
              }}
            />
          </div>
        )}
      </div>
      <div className="absolute right-2 bottom-2 flex gap-1">
        <button
          type="button"
          className={boton}
          onClick={() => hacerZoom(zoom / 1.5)}
          disabled={zoom <= ZOOM_MIN}
          aria-label="Alejar"
        >
          −
        </button>
        <button
          type="button"
          className={boton}
          onClick={() => hacerZoom(zoom * 1.5)}
          disabled={zoom >= ZOOM_MAX}
          aria-label="Acercar"
        >
          +
        </button>
        <button
          type="button"
          className={boton}
          onClick={() => setGiro((g) => (g + 90) % 360)}
          aria-label="Girar foto"
        >
          ↻
        </button>
        <button
          type="button"
          className={boton}
          onClick={() => {
            setZoom(1)
            marco.current?.scrollTo({ left: 0, top: 0 })
          }}
          disabled={zoom === 1}
        >
          Ajustar
        </button>
      </div>
    </div>
  )
}
