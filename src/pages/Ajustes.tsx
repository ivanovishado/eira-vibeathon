import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db } from '../db/schema'
import { borrarDatosLocales, cargarDatosFicticios } from '../db/seed'
import { almacenamientoEsPersistente } from '../lib/storage'

export function Ajustes() {
  const conteo = useLiveQuery(
    async () => ({
      pacientes: await db.pacientes.count(),
      consultas: await db.consultas.count(),
      estudios: await db.estudios.count(),
    }),
    [],
  )
  const [persistente, setPersistente] = useState<boolean>()
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    void almacenamientoEsPersistente().then(setPersistente)
  }, [])

  async function ejecutar(accion: () => Promise<unknown>) {
    setOcupado(true)
    try {
      await accion()
    } finally {
      setOcupado(false)
    }
  }

  const boton = 'rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50'

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Ajustes</h1>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-medium">Datos en este dispositivo</h2>
        <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
          {(['pacientes', 'consultas', 'estudios'] as const).map((k) => (
            <div key={k}>
              <dt className="text-slate-500 capitalize">{k}</dt>
              <dd className="text-lg font-semibold">
                {conteo?.[k].toLocaleString('es-MX') ?? '…'}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-sm text-slate-600">
          Almacenamiento persistente:{' '}
          {persistente === undefined
            ? '…'
            : persistente
              ? 'sí'
              : 'no (el navegador podría borrar datos)'}
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-medium">Datos de prueba</h2>
        <p className="mt-1 text-sm text-slate-600">
          Reemplaza todo el contenido local con 2,000 pacientes ficticias. No
          usar en un dispositivo con expedientes reales.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={ocupado}
            className={`${boton} bg-pink-700 text-white`}
            onClick={() => ejecutar(() => cargarDatosFicticios())}
          >
            Cargar datos ficticios
          </button>
          <button
            type="button"
            disabled={ocupado}
            className={`${boton} border border-slate-300`}
            onClick={() => {
              if (
                window.confirm('¿Borrar todos los datos de este dispositivo?')
              ) {
                void ejecutar(() => borrarDatosLocales())
              }
            }}
          >
            Borrar datos locales
          </button>
        </div>
      </div>
    </section>
  )
}
