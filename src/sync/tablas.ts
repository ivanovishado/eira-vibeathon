import type {
  Brigada,
  Consulta,
  Estudio,
  Paciente,
  TablaSincronizada,
} from '../db/schema'

/** Todos los campos de T, ni uno más ni uno menos (lo verifica el compilador). */
type Campos<T> = { [K in keyof Required<T>]: true }

export interface ConfigTabla {
  /** Campos del registro local; en el servidor van en snake_case. */
  campos: readonly string[]
  /** Solo se agregan registros: reenviar uno que ya está no lo modifica. */
  soloAgregar: boolean
}

function tabla<T>(campos: Campos<T>, soloAgregar = false): ConfigTabla {
  return { campos: Object.keys(campos), soloAgregar }
}

/**
 * Tablas que se sincronizan, en el orden en que se suben. Para sincronizar una tabla
 * nueva: agrégala a `TablaSincronizada`, crea su migración en `supabase/migrations`
 * (con las columnas comunes y el trigger `marcar_cambio`) y añade aquí su entrada.
 */
export const TABLAS_SINCRONIZADAS = {
  pacientes: tabla<Paciente>({
    id: true,
    folio: true,
    nombres: true,
    apellidoPaterno: true,
    apellidoMaterno: true,
    fechaNacimiento: true,
    telefonos: true,
    comunidad: true,
    municipio: true,
    curp: true,
    nombreBusqueda: true,
    createdAt: true,
    updatedAt: true,
  }),
  brigadas: tabla<Brigada>({
    id: true,
    fecha: true,
    lugar: true,
    responsable: true,
    createdAt: true,
  }),
  consultas: tabla<Consulta>(
    {
      id: true,
      pacienteId: true,
      brigadaId: true,
      fecha: true,
      medico: true,
      motivo: true,
      antecedentes: true,
      signosVitales: true,
      exploracion: true,
      diagnostico: true,
      plan: true,
      corrigeA: true,
      createdAt: true,
    },
    true,
  ),
  estudios: tabla<Estudio>({
    id: true,
    pacienteId: true,
    consultaId: true,
    tipo: true,
    fecha: true,
    resultado: true,
    createdAt: true,
  }),
} satisfies Record<TablaSincronizada, ConfigTabla>

export const ORDEN_TABLAS = Object.keys(
  TABLAS_SINCRONIZADAS,
) as TablaSincronizada[]
