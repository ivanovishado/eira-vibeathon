import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { sincronizacionConfigurada } from '../cuenta/config'
import { medicoDeCuenta, useCuenta } from '../cuenta/cuenta'
import { db, type EstadoHoja, type Hoja } from '../db/schema'
import { leerRecordados } from '../expediente/captura'
import { formatearFecha } from '../expediente/fechas'
import { fechaDeMarca, horaDeMarca } from '../expediente/presentacion'
import { ETIQUETA_ESTADO, esPendiente } from '../hojas/estados'
import {
  leerHojasAhora,
  lectorSimulado,
  motivoSinLectura,
  puedeLeer,
  useLecturaHojas,
} from '../hojas/fondo'
import { capturarHoja, descartarHoja, reintentarLectura } from '../hojas/hojas'
import { reducirImagen } from '../hojas/imagen'
import { useMiniatura } from '../hojas/useImagen'
import { useEnLinea } from '../lib/useEnLinea'

type Pestana = 'pendientes' | 'confirmada' | 'descartada'

const PESTANAS: { id: Pestana; titulo: string }[] = [
  { id: 'pendientes', titulo: 'Por revisar' },
  { id: 'confirmada', titulo: 'Confirmadas' },
  { id: 'descartada', titulo: 'Descartadas' },
]

const ESTILO_ESTADO: Record<EstadoHoja, string> = {
  'sin-enviar': 'bg-slate-100 text-slate-700',
  leyendo: 'bg-sky-100 text-sky-800',
  'por-revisar': 'bg-amber-100 text-amber-900',
  confirmada: 'bg-emerald-100 text-emerald-800',
  descartada: 'bg-slate-200 text-slate-600',
  error: 'bg-red-100 text-red-800',
}

const enPestana = (h: Hoja, p: Pestana) =>
  p === 'pendientes' ? esPendiente(h) : h.estado === p

export function Hojas() {
  const hojas = useLiveQuery(
    () => db.hojas.orderBy('createdAt').reverse().toArray(),
    [],
  )
  const [pestana, setPestana] = useState<Pestana>('pendientes')
  const enLinea = useEnLinea()
  const cuenta = useCuenta()
  const lectura = useLecturaHojas()
  const motivo = motivoSinLectura({
    configurado: sincronizacionConfigurada,
    simulado: lectorSimulado,
    enLinea,
    conCuenta: Boolean(cuenta),
    error: lectura.error,
  })
  const sinEnviar = hojas?.filter((h) => h.estado === 'sin-enviar').length ?? 0
  const visibles = hojas?.filter((h) => enPestana(h, pestana)) ?? []

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Hojas en papel</h1>
        <p className="text-sm text-slate-600">
          Fotografía las hojas de consulta; se leen cuando hay conexión y nada
          llega al expediente hasta que alguien las revisa y confirma.
        </p>
      </div>

      <Captura />

      {motivo && sinEnviar > 0 && (
        <p
          role="status"
          className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900"
        >
          {sinEnviar === 1
            ? '1 hoja sin enviar. '
            : `${sinEnviar} hojas sin enviar. `}
          {motivo}
        </p>
      )}

      <div>
        <div
          role="tablist"
          aria-label="Bandeja de hojas"
          className="flex gap-1 border-b border-slate-200"
        >
          {PESTANAS.map((p) => {
            const n = hojas?.filter((h) => enPestana(h, p.id)).length ?? 0
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={pestana === p.id}
                onClick={() => setPestana(p.id)}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${pestana === p.id ? 'border-pink-700 text-pink-800' : 'border-transparent text-slate-600 hover:text-slate-900'}`}
              >
                {p.titulo}
                {n > 0 && (
                  <span className="ml-1 text-xs text-slate-500">({n})</span>
                )}
              </button>
            )
          })}
        </div>
        {hojas === undefined ? (
          <p className="py-4 text-sm text-slate-500">Cargando…</p>
        ) : visibles.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">
            {pestana === 'pendientes'
              ? 'No hay hojas por revisar.'
              : pestana === 'confirmada'
                ? 'Aún no hay hojas confirmadas.'
                : 'No hay hojas descartadas.'}
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {visibles.map((h) => (
              <FilaHoja key={h.id} hoja={h} />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function Captura() {
  const camara = useRef<HTMLInputElement>(null)
  const archivos = useRef<HTMLInputElement>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const [procesando, setProcesando] = useState(0)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string }>()
  // Con red y sesión, tras una sola foto se espera la lectura y se abre la revisión.
  const [esperando, setEsperando] = useState<string>()
  const vioLeyendo = useRef(false)
  const navegar = useNavigate()
  const enEspera = useLiveQuery(
    () => (esperando ? db.hojas.get(esperando) : undefined),
    [esperando],
  )
  useEffect(() => {
    if (!esperando || !enEspera) return
    if (enEspera.estado === 'leyendo') vioLeyendo.current = true
    else if (enEspera.estado === 'por-revisar' || enEspera.estado === 'error')
      navegar(`/hojas/${esperando}`)
    else if (enEspera.estado === 'sin-enviar' && vioLeyendo.current) {
      // Falló la red o la sesión: queda en la cola, como sin conexión.
      setEsperando(undefined)
      setAviso({
        tipo: 'ok',
        texto:
          'Hoja guardada en el dispositivo; no se pudo leer ahora y se reintentará sola.',
      })
    }
  }, [esperando, enEspera, navegar])

  async function guardar(lista: FileList | File[] | null) {
    const imagenes = [...(lista ?? [])].filter(
      (f) => f.type.startsWith('image/') || f.type === '',
    )
    if (!imagenes.length) return
    setAviso(undefined)
    const capturadaPor =
      medicoDeCuenta().medico ?? (await leerRecordados()).medico
    let guardadas = 0
    let ultima: string | undefined
    const errores: string[] = []
    for (const archivo of imagenes) {
      setProcesando((n) => n + 1)
      try {
        ultima = (
          await capturarHoja(await reducirImagen(archivo), capturadaPor)
        ).id
        guardadas++
      } catch (e) {
        errores.push(`${archivo.name}: ${e instanceof Error ? e.message : e}`)
      } finally {
        setProcesando((n) => n - 1)
      }
    }
    if (imagenes.length === 1 && ultima && puedeLeer()) {
      vioLeyendo.current = false
      setEsperando(ultima)
      void leerHojasAhora()
      return
    }
    setAviso(
      errores.length
        ? { tipo: 'error', texto: errores.join(' · ') }
        : {
            tipo: 'ok',
            texto:
              guardadas === 1
                ? 'Hoja guardada en el dispositivo. Puedes tomar la siguiente.'
                : `${guardadas} hojas guardadas en el dispositivo.`,
          },
    )
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setArrastrando(true)
      }}
      onDragLeave={() => setArrastrando(false)}
      onDrop={(e) => {
        e.preventDefault()
        setArrastrando(false)
        void guardar(e.dataTransfer.files)
      }}
      className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-4 text-center ${arrastrando ? 'border-pink-500 bg-pink-50' : 'border-slate-300 bg-white'}`}
    >
      <input
        ref={camara}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        data-testid="entrada-camara"
        onChange={(e) => {
          void guardar(e.target.files)
          e.target.value = ''
        }}
      />
      <input
        ref={archivos}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        data-testid="entrada-archivos"
        onChange={(e) => {
          void guardar(e.target.files)
          e.target.value = ''
        }}
      />
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
        <button
          type="button"
          onClick={() => camara.current?.click()}
          className="rounded-lg bg-pink-700 px-5 py-3 text-base font-medium text-white shadow hover:bg-pink-800"
        >
          Tomar foto de hoja
        </button>
        <button
          type="button"
          onClick={() => archivos.current?.click()}
          className="rounded-lg border border-pink-300 bg-white px-5 py-3 text-base font-medium text-pink-800 hover:bg-pink-50"
        >
          Elegir archivos
        </button>
      </div>
      <p className="hidden text-sm text-slate-500 [@media(pointer:fine)]:block">
        o arrastra aquí las fotos de las hojas
      </p>
      <p aria-live="polite" className="text-sm">
        {procesando > 0 ? (
          <span className="text-slate-600">Guardando foto…</span>
        ) : esperando ? (
          <span
            role="status"
            className="inline-flex flex-wrap items-center justify-center gap-2 text-pink-800"
          >
            <span
              aria-hidden
              className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-pink-300 border-t-pink-700"
            />
            Leyendo la hoja… al terminar se abre la revisión.
            <button
              type="button"
              onClick={() => setEsperando(undefined)}
              className="underline"
            >
              Seguir capturando
            </button>
          </span>
        ) : (
          aviso && (
            <span
              className={
                aviso.tipo === 'ok' ? 'text-emerald-700' : 'text-red-700'
              }
            >
              {aviso.texto}
            </span>
          )
        )}
      </p>
    </div>
  )
}

function FilaHoja({ hoja }: { hoja: Hoja }) {
  const miniatura = useMiniatura(hoja.id)
  const v = hoja.lectura?.valores
  const nombre = v
    ? [v['paciente.nombres'], v['paciente.apellidoPaterno']]
        .filter(Boolean)
        .join(' ')
    : ''
  const accion =
    hoja.estado === 'confirmada' || hoja.estado === 'descartada'
      ? 'Ver'
      : hoja.estado === 'por-revisar'
        ? 'Revisar'
        : 'Pasar a mano'

  return (
    <li className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2 pr-3">
      <Link
        to={`/hojas/${hoja.id}`}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <div className="flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-slate-100 text-center text-[10px] leading-tight text-slate-500">
          {miniatura ? (
            <img
              src={miniatura}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            'Foto en el servidor'
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTILO_ESTADO[hoja.estado]}`}
            >
              {ETIQUETA_ESTADO[hoja.estado]}
              {hoja.estado === 'leyendo' && '…'}
            </span>
            {nombre && <span className="truncate font-medium">{nombre}</span>}
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {formatearFecha(fechaDeMarca(hoja.createdAt))},{' '}
            {horaDeMarca(hoja.createdAt)}
            {hoja.capturadaPor && ` · ${hoja.capturadaPor}`}
          </p>
          {hoja.estado === 'error' && hoja.errorLectura && (
            <p className="mt-0.5 truncate text-xs text-red-700">
              {hoja.errorLectura}
            </p>
          )}
        </div>
      </Link>
      <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
        {hoja.estado === 'error' && (
          <button
            type="button"
            onClick={() =>
              void reintentarLectura(hoja.id).then(() => leerHojasAhora())
            }
            className="text-sm font-medium text-pink-700 underline"
          >
            Reintentar
          </button>
        )}
        {(hoja.estado === 'sin-enviar' || hoja.estado === 'error') && (
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  '¿Descartar esta hoja? Se conserva en Descartadas.',
                )
              )
                void descartarHoja(hoja.id)
            }}
            className="text-sm text-slate-600 underline"
          >
            Descartar
          </button>
        )}
        <Link
          to={`/hojas/${hoja.id}`}
          className="text-sm font-medium text-pink-700 underline"
        >
          {accion}
        </Link>
      </div>
    </li>
  )
}
