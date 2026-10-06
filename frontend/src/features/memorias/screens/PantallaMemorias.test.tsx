import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionProvider } from '@/features/auth/session'
import { crearPlantillaDesdeDocx } from '@/features/plantillas/plantillas'
import { mockearSesionAutenticada, reiniciarMocksDeSesion } from '@/test/sesionDePrueba'
import { sembrarConferencias } from '@/test/conferenciasDePrueba'
import type { Memoria } from '../data'
import { PantallaMemorias } from './PantallaMemorias'

vi.mock('@/shared/supabase/cliente')
vi.mock('@/features/conferencias/repositorio')

/*
  Dos repositorios sustituidos, porque la pantalla combina dos dominios: sus
  memorias, y las plantillas con las que se generan. Las conferencias siguen
  llegando de `useConferenciasVisibles` (fixture todavía, hasta que se migre
  ese dominio), así que los ids de conferencia son los suyos.
*/
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

/* Dueña de `cnf-alc-01`/`cnf-alc-03` en el fixture: Valentina Alcántara Rueda. */
const ID_ALCANTARA = '1ba5af9a-f6a2-4504-ab60-1f018c21290a'

const MEMORIA_ALCANTARA: Memoria = {
  id: '5f8c1d2e-7a3b-4c9d-8e01-2f3a4b5c6d70',
  idConferencia: 'cnf-alc-01',
  idPlantilla: PLANTILLA.id,
  idDueno: ID_ALCANTARA,
  nombre: 'Memoria de Modelos de lenguaje aplicados a la revisión sistemática de literatura',
  generadaEl: '2026-04-15T10:00:00.000Z',
  estado: 'lista' as const,
}

const MEMORIA_DE_SESGOS: Memoria = {
  id: '5f8c1d2e-7a3b-4c9d-8e01-2f3a4b5c6d71',
  idConferencia: 'cnf-alc-03',
  idPlantilla: PLANTILLA.id,
  idDueno: ID_ALCANTARA,
  nombre: 'Memoria de sesgos algorítmicos',
  generadaEl: '2026-05-20T10:00:00.000Z',
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
  repositorioDeMemorias.listarMemorias.mockResolvedValue({ ok: true, datos: [MEMORIA_ALCANTARA] })
  repositorioDeMemorias.crearMemoria.mockImplementation((memoria: Memoria) =>
    Promise.resolve({ ok: true, datos: memoria }),
  )
  repositorioDeMemorias.eliminarMemoria.mockResolvedValue({ ok: true, datos: null })
  repositorioDePlantillas.listarPlantillas.mockResolvedValue({ ok: true, datos: [PLANTILLA] })
})

afterEach(() => {
  vi.restoreAllMocks()
  /* Desmontar antes de vaciar los simulacros: ver la nota en plantillas/screens/politica.test.tsx. */
  cleanup()
  vi.resetAllMocks()
  reiniciarMocksDeSesion()
})

function montar(rutaInicial = '/memorias') {
  return render(
    <SessionProvider>
      <MemoryRouter initialEntries={[rutaInicial]}>
        <Routes>
          <Route path="/memorias" element={<PantallaMemorias />} />
        </Routes>
      </MemoryRouter>
    </SessionProvider>,
  )
}

describe('PantallaMemorias', () => {
  it('lista lo guardado, con el nombre de la conferencia y la plantilla de origen', async () => {
    montar()
    const listado = within(await screen.findByRole('list', { name: 'Memorias' }))

    expect(listado.getByText(MEMORIA_ALCANTARA.nombre)).toBeInTheDocument()
    expect(listado.getByText('Modelos de lenguaje aplicados a la revisión sistemática de literatura')).toBeInTheDocument()
    expect(listado.getByText('Memoria estándar')).toBeInTheDocument()
  })

  /*
    Se espera también a las conferencias: la tarjeta muestra el nombre de la
    conferencia de origen, y pintarla antes diría "Conferencia no disponible"
    sobre memorias que están perfectamente bien.
  */
  it('mientras la lectura no resuelve, muestra el esqueleto y no el estado vacío', () => {
    repositorioDeMemorias.listarMemorias.mockReturnValue(new Promise(() => {}))

    montar()

    expect(screen.getByLabelText('Cargando las memorias')).toBeInTheDocument()
    expect(screen.queryByText(/generar tu primera memoria/i)).not.toBeInTheDocument()
  })

  it('si la lectura falla, lo dice en vez de invitar a generar la primera memoria', async () => {
    repositorioDeMemorias.listarMemorias.mockResolvedValue({ ok: false, codigo: 'DATOS_SIN_CONEXION' })

    montar()

    expect(await screen.findByText(/no pudimos conectarnos/i)).toBeInTheDocument()
    expect(screen.queryByText(/generar tu primera memoria/i)).not.toBeInTheDocument()
  })

  it('«Generar memoria» abre el panel', async () => {
    const usuario = userEvent.setup()
    montar()
    await screen.findByRole('list', { name: 'Memorias' })

    await usuario.click(screen.getByRole('button', { name: 'Generar memoria' }))

    expect(screen.getByRole('dialog', { name: 'Generar memoria' })).toBeInTheDocument()
  })

  it('con ?conferencia= en la URL, el panel se abre solo y preselecciona esa conferencia', async () => {
    montar('/memorias?conferencia=cnf-alc-01')

    const dialogo = await screen.findByRole('dialog', { name: 'Generar memoria' })
    expect(dialogo).toBeInTheDocument()
    /* La pastilla lleva puesto su valor: el título de la conferencia preseleccionada. */
    await waitFor(() => expect(screen.getByRole('button', { name: /^Conferencia: Modelos de lenguaje/ })).toBeInTheDocument())
  })

  it('eliminar quita la memoria de la lista y la borra en el repositorio', async () => {
    const usuario = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    montar()
    await screen.findByRole('list', { name: 'Memorias' })

    await usuario.click(screen.getByRole('button', { name: new RegExp(`eliminar «${MEMORIA_ALCANTARA.nombre}»`, 'i') }))

    await waitFor(() => expect(screen.queryByText(MEMORIA_ALCANTARA.nombre)).not.toBeInTheDocument())
    expect(repositorioDeMemorias.eliminarMemoria).toHaveBeenCalledWith(MEMORIA_ALCANTARA.id)
  })

  it('sin ninguna memoria, muestra el estado vacío', async () => {
    repositorioDeMemorias.listarMemorias.mockResolvedValue({ ok: true, datos: [] })

    montar()

    expect(await screen.findByText(/generar tu primera memoria/i)).toBeInTheDocument()
  })

  /*
    La búsqueda del listado (a diferencia de conferencias/F2 y catálogo/F6,
    F5 no tenía ningún control) empareja por el nombre de la memoria, el de
    su conferencia de origen o el de su plantilla, que es lo que la tarjeta
    ya muestra.
  */
  it('buscar filtra el listado por nombre de memoria, conferencia o plantilla', async () => {
    repositorioDeMemorias.listarMemorias.mockResolvedValue({ ok: true, datos: [MEMORIA_DE_SESGOS, MEMORIA_ALCANTARA] })
    const usuario = userEvent.setup()
    montar()

    const listado = within(await screen.findByRole('list', { name: 'Memorias' }))
    expect(listado.getByText('Memoria de sesgos algorítmicos')).toBeInTheDocument()

    await usuario.type(screen.getByLabelText(/buscar por memoria, conferencia o plantilla/i), 'sesgos')

    expect(listado.getByText('Memoria de sesgos algorítmicos')).toBeInTheDocument()
    expect(listado.queryByText(MEMORIA_ALCANTARA.nombre)).not.toBeInTheDocument()
  })

  /*
    Los dos vacíos no son el mismo: uno se resuelve generando una memoria y
    el otro quitando un filtro. Decir lo mismo en los dos manda a la persona
    al lugar equivocado (mismo criterio que F2/F6).
  */
  it('distingue el vacío por filtros del vacío por falta de datos, y el botón para quitarlos restablece el listado', async () => {
    const usuario = userEvent.setup()
    montar()
    await screen.findByRole('list', { name: 'Memorias' })

    await usuario.type(screen.getByLabelText(/buscar por memoria, conferencia o plantilla/i), 'palabra-inexistente')

    expect(await screen.findByText(/cumple lo que buscaste/i)).toBeInTheDocument()
    expect(screen.queryByText(/generar tu primera memoria/i)).not.toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: /quitar filtros/i }))

    expect(await screen.findByText(MEMORIA_ALCANTARA.nombre)).toBeInTheDocument()
  })

  /*
    `?conferencia=<id>` es el punto de entrada desde el detalle de una
    conferencia (preselecciona y abre el panel): escribir en la búsqueda no
    puede perder ese parámetro, o la preselección se rompería al primer
    caracter escrito.
  */
  it('escribir en la búsqueda conserva ?conferencia= si ya estaba en la URL', async () => {
    const usuario = userEvent.setup()
    montar('/memorias?conferencia=cnf-alc-01')
    await screen.findByRole('list', { name: 'Memorias' })

    await usuario.type(screen.getByLabelText(/buscar por memoria, conferencia o plantilla/i), 'modelos')

    expect(screen.getByRole('button', { name: /^Conferencia: Modelos de lenguaje/ })).toBeInTheDocument()
  })
})
