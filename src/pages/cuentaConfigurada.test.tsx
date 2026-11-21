import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { repo } from '../db/repo'
import { db } from '../db/schema'
import { borrarDatosLocales } from '../db/seed'

const auth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  updateUser: vi.fn(async () => ({ error: null })),
  signOut: vi.fn(async () => ({ error: null })),
}))

vi.mock('../cuenta/config', () => ({
  configSupabase: { url: 'https://prueba.supabase.co', llave: 'llave' },
  sincronizacionConfigurada: true,
}))
vi.mock('../cuenta/cliente', () => ({
  obtenerCliente: async () => ({ auth }),
}))

const { Cuenta } = await import('./Cuenta')
const { NuevaConsulta } = await import('./NuevaConsulta')
const { cerrarSesion } = await import('../cuenta/cuenta')

afterEach(async () => {
  cleanup()
  await cerrarSesion()
})

beforeEach(async () => {
  await borrarDatosLocales(db)
  auth.signInWithPassword.mockResolvedValue({
    data: {
      user: {
        id: 'u1',
        email: 'dra@example.com',
        user_metadata: { nombre: 'Dra. Cuenta Ficticia' },
      },
    },
    error: null,
  })
})

async function entrar() {
  render(<Cuenta />)
  fireEvent.change(screen.getByLabelText('Correo'), {
    target: { value: 'dra@example.com' },
  })
  fireEvent.change(screen.getByLabelText('Contraseña'), {
    target: { value: 'secreta' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))
  await screen.findByText('Sesión iniciada')
}

describe('cuenta del médico', () => {
  it('inicia sesión, muestra el estado de sincronización y guarda la cuenta en el dispositivo', async () => {
    await entrar()
    expect(screen.getByText('dra@example.com')).toBeVisible()
    expect(screen.getByLabelText('Tu nombre')).toHaveValue(
      'Dra. Cuenta Ficticia',
    )
    expect(screen.getByText('Última descarga completa')).toBeVisible()
    expect(screen.getByText('Nunca')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Sincronizar ahora' }),
    ).toBeVisible()
    expect(JSON.parse(localStorage.getItem('eira:cuenta')!)).toMatchObject({
      id: 'u1',
      nombre: 'Dra. Cuenta Ficticia',
    })
  })

  it('muestra el error de inicio de sesión', async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid login credentials', status: 400 },
    })
    render(<Cuenta />)
    fireEvent.change(screen.getByLabelText('Correo'), {
      target: { value: 'dra@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Contraseña'), {
      target: { value: 'mala' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Correo o contraseña incorrectos.',
    )
  })

  it('el nombre de la cuenta prellena el campo médico de la consulta', async () => {
    await entrar()
    fireEvent.change(screen.getByLabelText('Tu nombre'), {
      target: { value: 'Dra. Nombre Nuevo' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() =>
      expect(auth.updateUser).toHaveBeenCalledWith({
        data: { nombre: 'Dra. Nombre Nuevo' },
      }),
    )
    cleanup()

    const p = await repo.crearPaciente({
      nombres: 'Rosa',
      apellidoPaterno: 'Ficticia',
      telefonos: [],
    })
    render(
      <MemoryRouter initialEntries={[`/pacientes/${p.id}/consultas/nueva`]}>
        <Routes>
          <Route
            path="/pacientes/:pacienteId/consultas/nueva"
            element={<NuevaConsulta />}
          />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByLabelText(/Médica o médico/)).toHaveValue(
      'Dra. Nombre Nuevo',
    )
  })

  it('cerrar sesión no borra los expedientes locales', async () => {
    await entrar()
    await repo.crearPaciente({
      nombres: 'Rosa',
      apellidoPaterno: 'Ficticia',
      telefonos: [],
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    expect(await screen.findByLabelText('Correo')).toBeVisible()
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(await db.pacientes.count()).toBe(1)
  })
})
