import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Memoria } from '../data'
import { TarjetaDeMemoria } from './TarjetaDeMemoria'

const MEMORIA: Memoria = {
  id: 'mem-prueba',
  idConferencia: 'cnf-prueba',
  idPlantilla: 'pla-prueba',
  idDueno: 'usr-prueba',
  nombre: 'Memoria de prueba',
  generadaEl: '2026-05-01T10:00:00.000Z',
  estado: 'lista' as const,
}

afterEach(() => {
  vi.restoreAllMocks()
})

function montar(alEliminar = vi.fn()) {
  return render(
    <MemoryRouter>
      <TarjetaDeMemoria
        memoria={MEMORIA}
        nombreConferencia="Charla de prueba"
        nombrePlantilla="Plantilla de prueba"
        alEliminar={alEliminar}
      />
    </MemoryRouter>,
  )
}

describe('TarjetaDeMemoria', () => {
  it('enlaza a la vista previa de esa memoria', () => {
    montar()

    expect(screen.getByRole('link', { name: /memoria de prueba/i })).toHaveAttribute(
      'href',
      '/memorias/mem-prueba',
    )
  })

  it('muestra el nombre de la conferencia y de la plantilla de origen', () => {
    montar()

    expect(screen.getByText('Charla de prueba')).toBeInTheDocument()
    expect(screen.getByText('Plantilla de prueba')).toBeInTheDocument()
  })

  it('muestra la fecha de generación en formato legible', () => {
    montar()

    expect(screen.getByText(/1 may 2026/i)).toBeInTheDocument()
  })

  it('el botón eliminar pide confirmación y solo llama a alEliminar si se confirma', async () => {
    const usuario = userEvent.setup()
    const alEliminar = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    montar(alEliminar)
    await usuario.click(screen.getByRole('button', { name: /eliminar «memoria de prueba»/i }))

    expect(alEliminar).not.toHaveBeenCalled()

    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await usuario.click(screen.getByRole('button', { name: /eliminar «memoria de prueba»/i }))

    expect(alEliminar).toHaveBeenCalledOnce()
  })
})
