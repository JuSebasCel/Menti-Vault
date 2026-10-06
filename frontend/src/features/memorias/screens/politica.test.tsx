import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionProvider } from '@/features/auth/session'
import { crearPlantillaDesdeDocx } from '@/features/plantillas/plantillas'
import { mockearSesionAutenticada, reiniciarMocksDeSesion } from '@/test/sesionDePrueba'
import type { Memoria } from '../data'
import { PantallaDetalleMemoria } from './PantallaDetalleMemoria'
import { PantallaMemorias } from './PantallaMemorias'

/* Mismo criterio que el resto de pruebas de pantalla: se sustituyen los repositorios, no Supabase. */
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

const ID_DE_PLANTILLA = 'a2c0f7d1-9b3e-4a52-8f10-6d5c4b3a2e11'
const PLANTILLA = crearPlantillaDesdeDocx(ID_DE_PLANTILLA, `${ID_DE_PLANTILLA}/original.docx`, 'Memoria estándar', [])

const MEMORIA: Memoria = {
  id: '5f8c1d2e-7a3b-4c9d-8e01-2f3a4b5c6d70',
  idConferencia: 'cnf-alc-01',
  idPlantilla: PLANTILLA.id,
  /* Dueña de `cnf-alc-01` en el fixture: Valentina Alcántara Rueda. */
  idDueno: '1ba5af9a-f6a2-4504-ab60-1f018c21290a',
  nombre: 'Memoria de la charla de apertura',
  generadaEl: '2026-04-15T10:00:00.000Z',
  estado: 'lista' as const,
}

vi.mock('@/shared/supabase/cliente')

/*
  Reglas de redacción de las pantallas de F5. Mismo criterio que
  `features/plantillas/screens/politica.test.tsx`.
*/

const LENGUAJE_DE_OBRA_EN_CURSO =
  /próximamente|proximamente|en construcción|en construccion|wip|beta|disponible pronto|v0\.\d/i

/* Guion largo, escrito como escape para no usarlo literalmente en el código. */
const GUION_LARGO = '—'

const ALCANTARA = {
  id: '1ba5af9a-f6a2-4504-ab60-1f018c21290a',
  nombre: 'Valentina Alcántara Rueda',
  correo: 'valentina.alcantara@labanfora.org',
}

beforeEach(() => {
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

function montarListado() {
  return render(
    <SessionProvider>
      <MemoryRouter initialEntries={['/memorias']}>
        <Routes>
          <Route path="/memorias" element={<PantallaMemorias />} />
        </Routes>
      </MemoryRouter>
    </SessionProvider>,
  )
}

function montarDetalle() {
  return render(
    <SessionProvider>
      <MemoryRouter initialEntries={[`/memorias/${MEMORIA.id}`]}>
        <Routes>
          <Route path="/memorias/:idMemoria" element={<PantallaDetalleMemoria />} />
        </Routes>
      </MemoryRouter>
    </SessionProvider>,
  )
}

describe('Redacción de la pantalla de memorias', () => {
  it('se anuncia con un encabezado de nivel 1', () => {
    montarListado()

    expect(screen.getByRole('heading', { level: 1, name: 'Memorias' })).toBeInTheDocument()
  })

  /*
    Política invertida a propósito. Antes se exigía un párrafo bajo el título
    que dijera qué trabajo se hace en la sección; ahora se exige que NO esté.

    El motivo: es texto que se lee una vez en la vida del usuario y ocupa una
    banda de la pantalla en cada visita. El nombre de la sección, el dock y el
    propio contenido ya dicen dónde está uno. La app de referencia que se está
    calcando no pone texto explicativo bajo ningún título.

    Si algún día hace falta explicar una sección, el sitio es su estado vacío
    —donde sí hay espacio y sí hace falta orientación— no el encabezado.
  */
  it('va directo al contenido, sin párrafo explicativo bajo el título', () => {
    montarListado()

    const encabezado = screen.getByRole('heading', { level: 1, name: 'Memorias' })
    const alrededor = encabezado.parentElement?.textContent?.replace('Memorias', '').trim() ?? ''

    expect(alrededor.length).toBeLessThan(30)
  })

  it('no usa lenguaje de obra en curso', async () => {
    montarListado()
    await screen.findByRole('list', { name: 'Memorias' })

    expect(document.body.textContent ?? '').not.toMatch(LENGUAJE_DE_OBRA_EN_CURSO)
  })

  it('no usa el guion largo en ningún texto visible', async () => {
    montarListado()
    await screen.findByRole('list', { name: 'Memorias' })

    expect(document.body.textContent ?? '').not.toContain(GUION_LARGO)
  })
})

describe('Redacción de la pantalla de detalle de una memoria', () => {
  it('no usa lenguaje de obra en curso', async () => {
    montarDetalle()
    await screen.findByText(MEMORIA.nombre)

    expect(document.body.textContent ?? '').not.toMatch(LENGUAJE_DE_OBRA_EN_CURSO)
  })
})
