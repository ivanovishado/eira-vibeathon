import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type FormEvent } from 'react'
import { sincronizacionConfigurada } from '../cuenta/config'
import {
  cambiarNombre,
  cerrarSesion,
  iniciarSesion,
  useCuenta,
  type Cuenta as DatosCuenta,
} from '../cuenta/cuenta'
import { repo } from '../db/repo'
import { useEnLinea } from '../lib/useEnLinea'
import { ultimaDescargaCompleta } from '../sync/motor'
import { sincronizarAhora, useSincronizacion } from '../sync/sincronizacion'

const estiloEntrada =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base outline-none focus:border-pink-600 focus:ring-2 focus:ring-pink-200 sm:text-sm'
const boton =
  'rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50'
const tarjeta = 'rounded-xl border border-slate-200 bg-white p-4'

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

export function Cuenta() {
  const cuenta = useCuenta()
  const sync = useSincronizacion()

  if (!sincronizacionConfigurada)
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">Cuenta y sincronización</h1>
        <div className={tarjeta}>
          <h2 className="font-medium">Modo solo local</h2>
          <p className="mt-1 text-sm text-slate-600">
            Este dispositivo no está conectado a un servidor: los expedientes se
            guardan solo aquí. Para sincronizar, configura{' '}
            <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code>{' '}
            (ver README).
          </p>
        </div>
      </section>
    )

  const sesionVencida = sync.error?.tipo === 'sesion' && cuenta

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Cuenta y sincronización</h1>
      {!cuenta || sesionVencida ? (
        <FormularioSesion correoInicial={cuenta?.correo} vencida={!!cuenta} />
      ) : (
        <DatosDeCuenta cuenta={cuenta} />
      )}
      {cuenta && <PanelSincronizacion />}
    </section>
  )
}

function FormularioSesion({
  correoInicial = '',
  vencida,
}: {
  correoInicial?: string
  vencida: boolean
}) {
  const enLinea = useEnLinea()
  const [correo, setCorreo] = useState(correoInicial)
  const [contrasena, setContrasena] = useState('')
  const [error, setError] = useState<string>()
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setError(undefined)
    setEnviando(true)
    try {
      await iniciarSesion(correo, contrasena)
      setContrasena('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar} className={`${tarjeta} flex flex-col gap-3`}>
      <div>
        <h2 className="font-medium">
          {vencida ? 'Vuelve a iniciar sesión' : 'Iniciar sesión'}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {vencida
            ? 'La sesión venció. Puedes seguir trabajando sin conexión; inicia sesión para volver a sincronizar.'
            : 'Inicia sesión con internet antes de salir a la brigada. Después la app funciona sin conexión y sincroniza sola cuando haya red.'}
        </p>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">Correo</span>
        <input
          type="email"
          autoComplete="username"
          required
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          className={estiloEntrada}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">Contraseña</span>
        <input
          type="password"
          autoComplete="current-password"
          required
          value={contrasena}
          onChange={(e) => setContrasena(e.target.value)}
          className={estiloEntrada}
        />
      </label>
      {!enLinea && (
        <p className="text-sm text-amber-800">
          Necesitas conexión para iniciar sesión.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div>
        <button
          type="submit"
          disabled={enviando || !enLinea}
          className={`${boton} bg-pink-700 text-white`}
        >
          {enviando ? 'Entrando…' : 'Iniciar sesión'}
        </button>
      </div>
    </form>
  )
}

function DatosDeCuenta({ cuenta }: { cuenta: DatosCuenta }) {
  const [nombre, setNombre] = useState(cuenta.nombre)
  const pendientes = useLiveQuery(() => repo.cambiosPendientes(), [], 0)
  const cambiado = nombre.trim() !== cuenta.nombre

  async function salir() {
    const aviso =
      pendientes > 0
        ? `Hay ${pendientes} cambios sin sincronizar. Se quedan en este dispositivo y se enviarán cuando vuelvas a iniciar sesión. ¿Cerrar sesión?`
        : '¿Cerrar sesión en este dispositivo?'
    if (window.confirm(aviso)) await cerrarSesion()
  }

  return (
    <div className={`${tarjeta} flex flex-col gap-3`}>
      <div>
        <h2 className="font-medium">Sesión iniciada</h2>
        <p className="mt-1 text-sm text-slate-600">{cuenta.correo}</p>
      </div>
      <form
        className="flex flex-col gap-1 text-sm"
        onSubmit={(e) => {
          e.preventDefault()
          void cambiarNombre(nombre)
        }}
      >
        <label htmlFor="nombre-medico" className="font-medium text-slate-700">
          Tu nombre
        </label>
        <div className="flex gap-2">
          <input
            id="nombre-medico"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Dra. Nombre Apellido"
            className={estiloEntrada}
          />
          <button
            type="submit"
            disabled={!cambiado}
            className={`${boton} shrink-0 border border-slate-300`}
          >
            Guardar
          </button>
        </div>
        <span className="text-xs text-slate-500">
          Se usa para prellenar «Médica o médico» en las consultas nuevas.
          {cuenta.nombreSinSubir &&
            ' Se guardará en tu cuenta cuando haya red.'}
        </span>
      </form>
      <div>
        <button
          type="button"
          onClick={() => void salir()}
          className={`${boton} border border-slate-300`}
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}

function PanelSincronizacion() {
  const enLinea = useEnLinea()
  const sync = useSincronizacion()
  const pendientes = useLiveQuery(() => repo.cambiosPendientes(), [], 0)
  const ultimaDescarga = useLiveQuery(() => ultimaDescargaCompleta(), [])

  return (
    <div className={tarjeta}>
      <h2 className="font-medium">Sincronización</h2>
      <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-slate-500">Conexión</dt>
          <dd className="font-medium">
            {enLinea ? 'En línea' : 'Sin conexión'}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Cambios por enviar</dt>
          <dd className="font-medium">{pendientes.toLocaleString('es-MX')}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Última descarga completa</dt>
          <dd className="font-medium">
            {ultimaDescarga ? fechaHora(ultimaDescarga) : 'Nunca'}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Estado</dt>
          <dd className="font-medium">
            {sync.sincronizando
              ? 'Sincronizando…'
              : sync.error
                ? 'Con error'
                : sync.ultimoExito
                  ? `Al día (${fechaHora(sync.ultimoExito)})`
                  : enLinea
                    ? 'En espera'
                    : 'Esperando conexión'}
          </dd>
        </div>
      </dl>
      {sync.error && (
        <p
          role="alert"
          className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {sync.error.tipo === 'red'
            ? 'No se pudo contactar al servidor'
            : 'Error de sincronización'}{' '}
          ({fechaHora(sync.error.en)}): {sync.error.mensaje}
          {sync.proximoIntento &&
            ` Se reintentará a las ${new Date(sync.proximoIntento).toLocaleTimeString('es-MX', { timeStyle: 'short' })}.`}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!enLinea || sync.sincronizando}
          onClick={() => void sincronizarAhora()}
          className={`${boton} bg-pink-700 text-white`}
        >
          {sync.sincronizando ? 'Sincronizando…' : 'Sincronizar ahora'}
        </button>
        <span className="text-xs text-slate-500">
          La sincronización corre sola en segundo plano; puedes seguir
          trabajando mientras tanto.
        </span>
      </div>
    </div>
  )
}
