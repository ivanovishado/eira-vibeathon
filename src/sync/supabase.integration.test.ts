// Prueba contra un Supabase de verdad (local con `supabase start` o un proyecto de prueba).
// Se omite si no están las variables; ver README, «Probar contra Supabase».
import 'fake-indexeddb/auto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'
import { crearRepo } from '../db/repo'
import { crearDB } from '../db/schema'
import { crearMotor } from './motor'
import { crearRemotoSupabase } from './supabase'

const env =
  (globalThis as { process?: { env: Record<string, string | undefined> } })
    .process?.env ?? {}
const url = env.SUPABASE_PRUEBA_URL
const llave = env.SUPABASE_PRUEBA_LLAVE
const correo = env.SUPABASE_PRUEBA_CORREO
const contrasena = env.SUPABASE_PRUEBA_CONTRASENA
const configurado = Boolean(url && llave && correo && contrasena)

const nuevoCliente = () =>
  createClient(url!, llave!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

describe.skipIf(!configurado)(
  'sincronización con Supabase',
  { timeout: 30_000 },
  () => {
    let cliente: SupabaseClient
    const marca = `Prueba-integracion-${Date.now()}`

    beforeAll(async () => {
      cliente = nuevoCliente()
      const { error } = await cliente.auth.signInWithPassword({
        email: correo!,
        password: contrasena!,
      })
      if (error) throw error
    })

    it('sube desde un dispositivo y descarga en otro, sin duplicar al reintentar', async () => {
      const remoto = crearRemotoSupabase(async () => cliente)
      const a = crearDB(`integracion-a-${marca}`)
      const b = crearDB(`integracion-b-${marca}`)
      const repo = crearRepo(a)
      const p = await repo.crearPaciente({
        nombres: marca,
        apellidoPaterno: 'Ficticia',
        telefonos: ['3410000001'],
        comunidad: 'Tapalpa',
      })
      const c = await repo.crearConsulta({
        pacienteId: p.id,
        fecha: '2026-11-21',
        medico: 'Dra. Prueba',
        motivo: 'Revisión',
        signosVitales: { pesoKg: 61.5, presionArterial: '120/80' },
      })
      await repo.crearEstudio({
        pacienteId: p.id,
        consultaId: c.id,
        tipo: 'papanicolaou',
        fecha: '2026-11-21',
      })

      const motorA = crearMotor(remoto, a)
      expect((await motorA.sincronizar()).enviados).toBe(3)
      expect(await a.colaSalida.count()).toBe(0)

      // Reenviar lo mismo (respuesta perdida) no duplica ni falla.
      await remoto.subir(
        'consultas',
        [
          {
            ...(
              await cliente.from('consultas').select().eq('id', c.id).single()
            ).data,
            motivo: 'Otro',
          },
        ].map(
          ({
            servidor_xid: _x,
            servidor_actualizado_en: _s,
            creado_por: _c,
            ...f
          }) => f,
        ),
        true,
      )

      const motorB = crearMotor(remoto, b, { loteDescarga: 2 })
      await motorB.descargar()
      expect(await b.pacientes.get(p.id)).toEqual(await a.pacientes.get(p.id))
      expect(await b.consultas.get(c.id)).toEqual(c)
      expect(await b.estudios.where('pacienteId').equals(p.id).count()).toBe(1)

      // Una edición en B llega a A con el cursor incremental.
      await crearRepo(b).actualizarPaciente(p.id, {
        comunidad: undefined,
        municipio: 'Atemajac',
      })
      await motorB.sincronizar()
      await motorA.sincronizar()
      expect(await a.pacientes.get(p.id)).toMatchObject({
        municipio: 'Atemajac',
      })
      expect((await a.pacientes.get(p.id))?.comunidad).toBeUndefined()

      const { count } = await cliente
        .from('consultas')
        .select('*', { count: 'exact', head: true })
        .eq('id', c.id)
      expect(count).toBe(1)
    })

    it('las consultas no se pueden editar en el servidor', async () => {
      const remoto = crearRemotoSupabase(async () => cliente)
      const db = crearDB(`integracion-c-${marca}`)
      const repo = crearRepo(db)
      const p = await repo.crearPaciente({
        nombres: marca,
        apellidoPaterno: 'Ficticia',
        telefonos: [],
      })
      const c = await repo.crearConsulta({
        pacienteId: p.id,
        fecha: '2026-11-21',
        medico: 'Dra. Prueba',
        motivo: 'Original',
      })
      await crearMotor(remoto, db).subir()

      await cliente
        .from('consultas')
        .update({ motivo: 'Editada' })
        .eq('id', c.id)
      const { data } = await cliente
        .from('consultas')
        .select('motivo')
        .eq('id', c.id)
        .single()
      expect(data?.motivo).toBe('Original')
    })

    it('sin sesión no se lee ni se escribe', async () => {
      const anonimo = nuevoCliente()
      const lectura = await anonimo.from('pacientes').select('id').limit(1)
      expect(lectura.data ?? []).toHaveLength(0)
      const escritura = await anonimo.from('pacientes').insert({
        id: crypto.randomUUID(),
        nombres: marca,
        apellido_paterno: 'Ficticia',
        nombre_busqueda: 'x',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      expect(escritura.error).not.toBeNull()
      await expect(
        crearMotor(
          crearRemotoSupabase(async () => anonimo),
          crearDB(`integracion-d-${marca}`),
        ).descargar(),
      ).rejects.toMatchObject({ tipo: 'sesion' })
      const rpc = await anonimo.rpc('cambios_desde', { tabla: 'pacientes' })
      expect(rpc.error).not.toBeNull()
    })
  },
)
