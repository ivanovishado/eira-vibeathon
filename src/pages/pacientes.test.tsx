import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { beforeAll, describe, expect, it } from 'vitest'
import { repo } from '../db/repo'
import { db } from '../db/schema'
import { borrarDatosLocales } from '../db/seed'
import { BuscarPaciente } from './BuscarPaciente'
import { NuevaPaciente } from './NuevaPaciente'

function ExpedienteFalso() {
  return <p>Expediente {useParams().pacienteId}</p>
}

function app(ruta: string) {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route index element={<BuscarPaciente />} />
        <Route path="pacientes/nueva" element={<NuevaPaciente />} />
        <Route path="pacientes/:pacienteId" element={<ExpedienteFalso />} />
      </Routes>
    </MemoryRouter>,
  )
}

let existenteId: string

beforeAll(async () => {
  await borrarDatosLocales()
  const p = await repo.crearPaciente({
    nombres: 'Rosa María',
    apellidoPaterno: 'Vázquez',
    apellidoMaterno: 'Zúñiga',
    fechaNacimiento: '1970-05-10',
    telefonos: ['3415557788'],
    comunidad: 'Usmajac',
  })
  existenteId = p.id
})

describe('BuscarPaciente', () => {
  it('encuentra con el nombre mal escrito y enlaza al expediente', async () => {
    app('/?q=rosa%20basques%20suniga')
    const enlace = await screen.findByRole('link', {
      name: /Rosa María Vázquez Zúñiga/,
    })
    expect(enlace).toHaveAttribute('href', `/pacientes/${existenteId}`)
    expect(enlace).toHaveTextContent('Usmajac')
    expect(enlace).toHaveTextContent('341 555 7788')
  })
})

describe('NuevaPaciente', () => {
  it('avisa de una posible duplicada y no guarda hasta confirmar', async () => {
    app('/pacientes/nueva?q=rosa%20vasquez')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ya hay un expediente parecido',
    )
    expect(
      screen.getByRole('link', { name: /Abrir expediente/ }),
    ).toHaveAttribute('href', `/pacientes/${existenteId}`)

    fireEvent.click(
      screen.getByRole('button', { name: 'Guardar como paciente nueva' }),
    )
    expect(
      await screen.findByText(/confirma que es otra persona/),
    ).toBeInTheDocument()
    expect(await db.pacientes.count()).toBe(1)

    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(
      screen.getByRole('button', { name: 'Guardar como paciente nueva' }),
    )
    expect(await screen.findByText(/^Expediente /)).toBeInTheDocument()
    expect(await db.pacientes.count()).toBe(2)
    expect(await repo.cambiosPendientes()).toBe(2)
  })

  it('pide los campos obligatorios', async () => {
    app('/pacientes/nueva')
    fireEvent.click(await screen.findByRole('button', { name: 'Guardar' }))
    expect(
      await screen.findByText('Escribe el nombre o nombres.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Escribe el primer apellido.')).toBeInTheDocument()
  })
})
