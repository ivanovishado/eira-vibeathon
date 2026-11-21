import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { EstadoConexion } from '../components/EstadoConexion'
import { Cuenta } from './Cuenta'

afterEach(cleanup)

describe('modo solo local', () => {
  it('la pantalla de cuenta explica que no hay servidor configurado', () => {
    render(<Cuenta />)
    expect(screen.getByText('Modo solo local')).toBeVisible()
    expect(screen.queryByLabelText('Correo')).toBeNull()
  })

  it('el estado de conexión no ofrece cuenta ni sincronización', () => {
    render(
      <MemoryRouter>
        <EstadoConexion />
      </MemoryRouter>,
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      /En línea|Sin conexión/,
    )
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByText('Sin cuenta')).toBeNull()
  })
})
