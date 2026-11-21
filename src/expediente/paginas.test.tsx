import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { repo } from '../db/repo'
import { db } from '../db/schema'
import { borrarDatosLocales } from '../db/seed'
import { Expediente } from '../pages/Expediente'
import { NuevaConsulta } from '../pages/NuevaConsulta'
import { RegistroHistorial } from '../pages/RegistroHistorial'
import { claveBorrador } from './captura'
import { haceCuanto, hoyLocal } from './fechas'
import { ESPERA_BORRADOR_MS } from './useCapturaConsulta'

function abrir(ruta: string) {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/" element={<p>Buscar</p>} />
        <Route path="/pacientes/:pacienteId" element={<Expediente />} />
        <Route
          path="/pacientes/:pacienteId/consultas/nueva"
          element={<NuevaConsulta />}
        />
        <Route
          path="/pacientes/:pacienteId/antecedentes/nuevo"
          element={<RegistroHistorial clase="antecedente" />}
        />
        <Route
          path="/pacientes/:pacienteId/atencion-externa/nuevo"
          element={<RegistroHistorial clase="externa" />}
        />
      </Routes>
    </MemoryRouter>,
  )
}

const escribir = (etiqueta: RegExp, valor: string) =>
  fireEvent.change(screen.getByLabelText(etiqueta), {
    target: { value: valor },
  })

let pacienteId: string

afterEach(cleanup)

beforeEach(async () => {
  await borrarDatosLocales(db)
  const p = await repo.crearPaciente({
    nombres: 'Rosa',
    apellidoPaterno: 'Ficticia',
    apellidoMaterno: 'Prueba',
    fechaNacimiento: '1975-04-02',
    telefonos: ['3410000001'],
    comunidad: 'El Fresnito',
  })
  pacienteId = p.id
})

describe('expediente', () => {
  it('avisa si la paciente no existe', async () => {
    abrir('/pacientes/no-existe')
    expect(await screen.findByText('Paciente no encontrada')).toBeVisible()
  })

  it('muestra la línea de tiempo de la más reciente a la más antigua', async () => {
    await repo.crearConsulta({
      pacienteId,
      fecha: '2024-03-01',
      medico: 'Dra. A',
      motivo: 'Tamizaje de rutina',
    })
    const reciente = await repo.crearConsulta({
      pacienteId,
      fecha: '2026-02-10',
      medico: 'Dra. B',
      motivo: 'Bulto palpable',
      diagnostico: 'Requiere ultrasonido',
    })
    await repo.crearEstudio({
      pacienteId,
      consultaId: reciente.id,
      tipo: 'mastografia',
      fecha: '2026-02-10',
      resultado: 'BI-RADS 3',
    })
    abrir(`/pacientes/${pacienteId}`)

    expect(
      await screen.findByRole('heading', { name: 'Rosa Ficticia Prueba' }),
    ).toBeVisible()
    const tarjetas = screen.getAllByRole('article')
    expect(tarjetas[0]).toHaveTextContent('Bulto palpable')
    expect(tarjetas[1]).toHaveTextContent('Tamizaje de rutina')
    expect(within(tarjetas[0]).getByText('Mastografía')).toBeVisible()
    expect(screen.getByText('2 consultas registradas')).toBeVisible()
  })
})

describe('nueva consulta', () => {
  it('registra la consulta con estudios y la muestra en el historial', async () => {
    abrir(`/pacientes/${pacienteId}/consultas/nueva`)
    await screen.findByRole('heading', { name: 'Nueva consulta' })

    escribir(/Médica o médico/, 'Dra. Prueba')
    escribir(/Motivo de consulta/, 'Dolor mamario')
    escribir(/Presión arterial/, '118/76')
    escribir(/Diagnóstico/, 'Mastopatía fibroquística')
    fireEvent.click(screen.getByRole('button', { name: '+ Ultrasonido' }))
    escribir(/Resultado/, 'Quiste simple')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar consulta' }))

    expect(
      await screen.findByText('Consulta guardada en este dispositivo.'),
    ).toBeVisible()
    const tarjeta = screen.getAllByRole('article')[0]
    expect(tarjeta).toHaveTextContent('Dolor mamario')
    expect(tarjeta).toHaveTextContent('118/76 mmHg')
    expect(tarjeta).toHaveTextContent('Quiste simple')
    expect(await db.consultas.count()).toBe(1)
    expect(await db.borradores.get(claveBorrador(pacienteId))).toBeUndefined()
  })

  it('no guarda si faltan campos obligatorios', async () => {
    abrir(`/pacientes/${pacienteId}/consultas/nueva`)
    await screen.findByRole('heading', { name: 'Nueva consulta' })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar consulta' }))

    expect(await screen.findAllByText('Campo obligatorio.')).toHaveLength(2)
    expect(screen.getByLabelText(/Médica o médico/)).toHaveFocus()
    expect(await db.consultas.count()).toBe(0)
  })

  it('guarda el borrador y lo recupera al volver', async () => {
    const vista = abrir(`/pacientes/${pacienteId}/consultas/nueva`)
    await screen.findByRole('heading', { name: 'Nueva consulta' })
    escribir(/Motivo de consulta/, 'Revisión anual')
    fireEvent.click(screen.getByRole('button', { name: '+ Papanicolaou' }))
    await waitFor(
      async () =>
        expect(
          await db.borradores.get(claveBorrador(pacienteId)),
        ).toBeDefined(),
      { timeout: ESPERA_BORRADOR_MS * 5 },
    )
    vista.unmount()

    abrir(`/pacientes/${pacienteId}/consultas/nueva`)
    expect(
      await screen.findByText(/Recuperamos la captura sin terminar/),
    ).toBeVisible()
    expect(screen.getByLabelText(/Motivo de consulta/)).toHaveValue(
      'Revisión anual',
    )
    expect(screen.getByRole('heading', { name: 'Papanicolaou' })).toBeVisible()
  })

  it('guarda el borrador al salir aunque no haya pasado la espera', async () => {
    const vista = abrir(`/pacientes/${pacienteId}/consultas/nueva`)
    await screen.findByRole('heading', { name: 'Nueva consulta' })
    escribir(/Motivo de consulta/, 'Cierre rápido')
    act(() => vista.unmount())

    await waitFor(async () => {
      const b = await db.borradores.get(claveBorrador(pacienteId))
      expect(b?.datos).toMatchObject({
        valores: { motivo: 'Cierre rápido' },
      })
    })
  })

  it('una corrección crea una consulta nueva y se marca en la línea de tiempo', async () => {
    const original = await repo.crearConsulta({
      pacienteId,
      fecha: '2026-02-10',
      medico: 'Dra. B',
      motivo: 'Bulto palpable',
      diagnostico: 'Sin hallazgos',
    })
    abrir(`/pacientes/${pacienteId}`)
    fireEvent.click(await screen.findByRole('link', { name: 'Corregir' }))

    await screen.findByRole('heading', { name: 'Corregir consulta' })
    expect(screen.getByLabelText(/Motivo de consulta/)).toHaveValue(
      'Bulto palpable',
    )
    escribir(/Diagnóstico/, 'Requiere ultrasonido')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar consulta' }))

    await screen.findByText('Consulta guardada en este dispositivo.')
    const [correccion] = screen.getAllByRole('article')
    expect(correccion).toHaveTextContent('Corrección')
    expect(correccion).toHaveTextContent('Cambió: Diagnóstico')
    expect(screen.getByText('Corregida')).toBeInTheDocument()
    expect(await db.consultas.get(original.id)).toEqual(original)
    expect(await db.consultas.count()).toBe(2)
  })

  it('avisa si la consulta a corregir no es de la paciente', async () => {
    abrir(`/pacientes/${pacienteId}/consultas/nueva?corrige=otra`)
    expect(await screen.findByText('Consulta no encontrada')).toBeVisible()
  })
})

describe('historial entre visitas', () => {
  it('muestra antecedentes y la atención externa en la línea de tiempo', async () => {
    await repo.crearConsulta({
      pacienteId,
      fecha: '2026-02-10',
      medico: 'Dra. B',
      motivo: 'Tamizaje de rutina',
    })
    await repo.crearAntecedente({
      pacienteId,
      ambito: 'familiar',
      parentesco: 'Madre',
      tipo: 'cancer',
      descripcion: 'Mama',
      cuando: '2015',
    })
    await repo.crearAtencionExterna({
      pacienteId,
      tipo: 'consulta',
      especialidad: 'Nutrición',
      fecha: '2026-05-15',
      fechaAproximada: true,
      resumen: 'Plan de alimentación',
    })
    abrir(`/pacientes/${pacienteId}`)

    const antecedentes = await screen.findByRole('region', {
      name: 'Antecedentes',
    })
    expect(antecedentes).toHaveTextContent('Madre')
    expect(antecedentes).toHaveTextContent('Mama')
    const [externa, consulta] = screen.getAllByRole('article')
    expect(externa).toHaveTextContent('Fuera de EIRA')
    expect(externa).toHaveTextContent('Nutrición')
    expect(externa).toHaveTextContent('aprox. may 2026')
    expect(consulta).toHaveTextContent('Tamizaje de rutina')
    expect(
      screen.getByText('Fuera de EIRA desde la última consulta'),
    ).toBeVisible()
  })

  it('agrega un antecedente y su corrección conserva el rastro', async () => {
    abrir(`/pacientes/${pacienteId}`)
    fireEvent.click(
      await screen.findByRole('link', { name: '+ Cáncer en la familia' }),
    )
    await screen.findByRole('heading', { name: 'Agregar antecedente' })
    expect(screen.getByRole('radio', { name: 'De un familiar' })).toBeChecked()
    escribir(/Familiar/, 'Abuela materna')
    escribir(/Tipo de cáncer/, 'Ovario')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(
      await screen.findByText('Antecedente guardado en este dispositivo.'),
    ).toBeVisible()
    fireEvent.click(screen.getByRole('link', { name: /Corregir.*Ovario/ }))
    await screen.findByRole('heading', { name: 'Corregir antecedente' })
    escribir(/Cuándo/, 'a los 60 años')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await screen.findByText('Antecedente guardado en este dispositivo.')
    expect(
      screen.getByRole('region', { name: 'Antecedentes' }),
    ).toHaveTextContent('a los 60 años')
    expect(screen.getByText(/Historial de cambios \(2\)/)).toBeInTheDocument()
    expect(await db.antecedentes.count()).toBe(2)
  })

  it('la consulta nueva muestra cuánto pasó y registra lo de fuera de EIRA', async () => {
    await repo.crearConsulta({
      pacienteId,
      fecha: '2026-02-10',
      medico: 'Dra. B',
      motivo: 'Tamizaje de rutina',
    })
    abrir(`/pacientes/${pacienteId}/consultas/nueva`)
    const seccion = await screen.findByRole('group', {
      name: 'Desde la última visita',
    })
    expect(
      await within(seccion).findByText(haceCuanto('2026-02-10', hoyLocal())),
    ).toBeVisible()

    escribir(/Médica o médico/, 'Dra. Prueba')
    escribir(/Motivo de consulta/, 'Seguimiento')
    fireEvent.click(within(seccion).getByRole('button', { name: '+ Consulta' }))
    fireEvent.change(within(seccion).getByLabelText(/Especialidad/), {
      target: { value: 'Nutrición' },
    })
    fireEvent.change(within(seccion).getByLabelText(/^Fecha/), {
      target: { value: '2026-06-01' },
    })
    fireEvent.change(within(seccion).getByLabelText(/Resumen/), {
      target: { value: 'Plan de alimentación' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar consulta' }))

    await screen.findByText('Consulta guardada en este dispositivo.')
    const tarjetas = screen.getAllByRole('article')
    expect(tarjetas[0]).toHaveTextContent('Seguimiento')
    expect(tarjetas[1]).toHaveTextContent('Fuera de EIRA')
    expect(tarjetas[1]).toHaveTextContent('Plan de alimentación')
    expect(await db.atencionesExternas.count()).toBe(1)
  })

  it('en la primera consulta invita a preguntar por atención previa', async () => {
    abrir(`/pacientes/${pacienteId}/consultas/nueva`)
    expect(
      await screen.findByText('Es su primera consulta en EIRA.'),
    ).toBeVisible()
  })
})
