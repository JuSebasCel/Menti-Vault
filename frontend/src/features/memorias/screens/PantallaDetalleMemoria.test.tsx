import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionProvider } from '@/features/auth/session'
import { crearPlantillaDesdeDocx } from '@/features/plantillas/plantillas'
import { mockearSesionAutenticada, reiniciarMocksDeSesion } from '@/test/sesionDePrueba'
import { sembrarConferencias } from '@/test/conferenciasDePrueba'
import type { Memoria } from '../data'
import { PantallaDetalleMemoria } from './PantallaDetalleMemoria'

vi.mock('@/shared/supabase/cliente')
vi.mock('@/features/conferencias/repositorio')

const repositorioDeMemorias = vi.hoisted(() => ({
  listarMemorias: vi.fn(),
  crearMemoria: vi.fn(),
  eliminarMemoria: vi.fn(),
}))

const repositorioDePlantillas = vi.hoisted(() => ({
  listarPlantillas: vi.fn(),
  crearPlantilla: vi.fn(),
  actualizarPlantilla: vi.fn(),
  eliminarPlantilla: vi.fn(),
  subirDocxDePlantilla: vi.fn(),
  descargarDocxDePlantilla: vi.fn(),
  eliminarDocxDePlantilla: vi.fn(),
}))

vi.mock('../repositorio', () => repositorioDeMemorias)
vi.mock('@/features/plantillas/repositorio', () => repositorioDePlantillas)

const ID_DE_PLANTILLA = 'c7d2e4a9-53b1-4f08-9c6e-2a1b8d4f7c33'
const PLANTILLA = crearPlantillaDesdeDocx(ID_DE_PLANTILLA, `${ID_DE_PLANTILLA}/original.docx`, 'Memoria estándar', [])

const MEMORIA: Memoria = {
  id: '5f8c1d2e-7a3b-4c9d-8e01-2f3a4b5c6d70',
  idConferencia: 'cnf-alc-01',
  idPlantilla: PLANTILLA.id,
  /* Dueña de `cnf-alc-01` en el fixture: Valentina Alcántara Rueda. */
  idDueno: '1ba5af9a-f6a2-4504-ab60-1f018c21290a',
  nombre: 'Memoria de Modelos de lenguaje aplicados a la revisión sistemática de literatura',
  generadaEl: '2026-04-15T10:00:00.000Z',
  estado: 'lista' as const,
}

const ALCANTARA = {
  id: '1ba5af9a-f6a2-4504-ab60-1f018c21290a',
  nombre: 'Valentina Alcántara Rueda',
  correo: 'valentina.alcantara@labanfora.org',
}

beforeEach(() => {
  sembrarConferencias()
  mockearSesionAutenticada(ALCANTARA)
  repositorioDeMemorias.listarMemorias.mockResolvedValue({ ok: true, datos: [MEMORIA] })
  repositorioDePlantillas.listarPlantillas.mockResolvedValue({ ok: true, datos: [PLANTILLA] })
  repositorioDePlantillas.descargarDocxDePlantilla.mockImplementation(() => new Promise(() => {}))
})

afterEach(() => {
  /* Desmontar antes de vaciar los simulacros: ver la nota en plantillas/screens/politica.test.tsx. */
  cleanup()
  vi.resetAllMocks()
  reiniciarMocksDeSesion()
})

function montar(idMemoria: string) {
  return render(
    <SessionProvider>
      <MemoryRouter initialEntries={[`/memorias/${idMemoria}`]}>
        <Routes>
          <Route path="/memorias" element={<p>Listado</p>} />
          <Route path="/memorias/:idMemoria" element={<PantallaDetalleMemoria />} />
        </Routes>
      </MemoryRouter>
    </SessionProvider>,
  )
}

describe('PantallaDetalleMemoria — mientras carga', () => {
  /*
    Tres lecturas de red (memoria, plantilla, conferencias) antes de saber si
    la memoria existe. Decir "no encontramos esa memoria" mientras alguna sigue
    en curso sería mentir, y era lo que se veía al recargar sobre esta URL.
  */
  it('muestra el esqueleto y no el error de memoria inexistente', () => {
    repositorioDeMemorias.listarMemorias.mockReturnValue(new Promise(() => {}))

    montar(MEMORIA.id)

    expect(screen.getByLabelText('Cargando la memoria')).toBeInTheDocument()
    expect(screen.queryByText(/no encontramos esa memoria/i)).not.toBeInTheDocument()
  })
})

describe('PantallaDetalleMemoria — id inexistente', () => {
  it('muestra el error MEM_NO_ENCONTRADA y un enlace de regreso', async () => {
    montar('5f8c1d2e-7a3b-4c9d-8e01-2f3a4b5c6d99')

    expect(await screen.findByText(/no encontramos esa memoria/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /volver a memorias/i })).toHaveAttribute('href', '/memorias')
  })
})

describe('PantallaDetalleMemoria — memoria válida', () => {
  it('muestra la memoria y pide el archivo de su plantilla para rehacerla', async () => {
    montar(MEMORIA.id)

    expect(await screen.findByText(MEMORIA.nombre)).toBeInTheDocument()
    expect(repositorioDePlantillas.descargarDocxDePlantilla).toHaveBeenCalledWith(PLANTILLA.rutaArchivoOriginal)
  })
})

describe('PantallaDetalleMemoria — plantilla de origen eliminada', () => {
  it('muestra un error en vez de un documento a medias', async () => {
    repositorioDePlantillas.listarPlantillas.mockResolvedValue({ ok: true, datos: [] })

    montar(MEMORIA.id)

    expect(await screen.findByText(/no encontramos esa plantilla/i)).toBeInTheDocument()
  })
})

describe('PantallaDetalleMemoria — plantilla importada cuyo archivo no baja', () => {
  /*
    La fila de la plantilla existe y sus marcadores también; lo que falta son
    los bytes del bucket. Sin ese aviso, la pantalla se quedaba en "Generando
    la memoria…" para siempre.
  */
  it('lo dice con nombre propio en vez de quedarse generando indefinidamente', async () => {
    const idPlantilla = 'a2c0f7d1-9b3e-4a52-8f10-6d5c4b3a2e11'
    repositorioDePlantillas.listarPlantillas.mockResolvedValue({
      ok: true,
      datos: [
        {
          id: idPlantilla,
          nombre: 'Importada',
          origen: 'docx',
          rutaArchivoOriginal: `${idPlantilla}/original.docx`,
          marcadores: [],
          actualizadaEl: '2026-04-10T09:00:00.000Z',
        },
      ],
    })
    repositorioDePlantillas.descargarDocxDePlantilla.mockResolvedValue({
      ok: false,
      codigo: 'PLANT_DOCX_FALLO_DESCARGA',
    })
    repositorioDeMemorias.listarMemorias.mockResolvedValue({
      ok: true,
      datos: [{ ...MEMORIA, idPlantilla }],
    })

    montar(MEMORIA.id)

    expect(await screen.findByText(/no pudimos recuperar el archivo original/i)).toBeInTheDocument()
  })
})
