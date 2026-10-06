import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Memoria } from './data'
import type { ResultadoMemoria } from './memorias'
import { useMemorias } from './useMemorias'

/*
  Mismo límite que en `usePlantillas.test.tsx`: se sustituye el repositorio,
  no el cliente de Supabase. Qué consulta se arma lo cubre
  `repositorio.test.ts`.
*/
const repositorio = vi.hoisted(() => ({
  listarMemorias: vi.fn(),
  crearMemoria: vi.fn(),
  eliminarMemoria: vi.fn(),
}))

vi.mock('./repositorio', () => repositorio)

const ID_USUARIO = 'c1c2c3c4-1111-4222-8333-444455556666'

const MEMORIA_GUARDADA: Memoria = {
  id: '5f8c1d2e-7a3b-4c9d-8e01-2f3a4b5c6d70',
  idConferencia: 'a1b2c3d4-1111-4222-8333-444455556666',
  idPlantilla: 'b1b2c3d4-1111-4222-8333-444455556666',
  idDueno: ID_USUARIO,
  nombre: 'Memoria de la charla de apertura',
  generadaEl: '2026-04-15T10:00:00.000Z',
  estado: 'lista' as const,
}

beforeEach(() => {
  repositorio.listarMemorias.mockResolvedValue({ ok: true, datos: [MEMORIA_GUARDADA] })
  repositorio.crearMemoria.mockImplementation((memoria: Memoria) => Promise.resolve({ ok: true, datos: memoria }))
  repositorio.eliminarMemoria.mockResolvedValue({ ok: true, datos: null })
})

afterEach(() => {
  /* Desmontar antes de vaciar los simulacros: ver la nota en plantillas/screens/politica.test.tsx. */
  cleanup()
  vi.resetAllMocks()
})

async function montarCargado() {
  const { result } = renderHook(() => useMemorias(ID_USUARIO))
  await waitFor(() => expect(result.current.cargando).toBe(false))
  return result
}

describe('useMemorias', () => {
  it('arranca cargando y sin memorias, para no afirmar que no hay ninguna antes de saberlo', () => {
    repositorio.listarMemorias.mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useMemorias(ID_USUARIO))

    expect(result.current.cargando).toBe(true)
    expect(result.current.memorias).toEqual([])
  })

  it('trae el listado del repositorio', async () => {
    const result = await montarCargado()

    expect(result.current.memorias).toEqual([MEMORIA_GUARDADA])
    expect(result.current.codigoDeError).toBeNull()
  })

  it('si la lectura falla, expone el código en vez de quedarse en un vacío mudo', async () => {
    repositorio.listarMemorias.mockResolvedValue({ ok: false, codigo: 'DATOS_SIN_CONEXION' })

    const result = await montarCargado()

    expect(result.current.codigoDeError).toBe('DATOS_SIN_CONEXION')
  })

  it('generar guarda la memoria y la deja disponible sin recargar', async () => {
    const result = await montarCargado()

    let resultado: ResultadoMemoria | undefined
    await act(async () => {
      resultado = await result.current.generar(MEMORIA_GUARDADA.idConferencia, MEMORIA_GUARDADA.idPlantilla, 'Nueva memoria')
    })

    expect(resultado?.ok).toBe(true)
    expect(repositorio.crearMemoria).toHaveBeenCalledOnce()
    expect(result.current.memorias).toHaveLength(2)
    /* De la más reciente a la más antigua, igual que las lee el repositorio. */
    expect(result.current.memorias[0]?.nombre).toBe('Nueva memoria')
  })

  it('generar sin nombre no escribe nada y devuelve el código de error', async () => {
    const result = await montarCargado()

    let resultado: ResultadoMemoria | undefined
    await act(async () => {
      resultado = await result.current.generar(MEMORIA_GUARDADA.idConferencia, MEMORIA_GUARDADA.idPlantilla, '')
    })

    expect(resultado).toEqual({ ok: false, codigo: 'MEM_NOMBRE_REQUERIDO' })
    expect(repositorio.crearMemoria).not.toHaveBeenCalled()
    expect(result.current.memorias).toHaveLength(1)
  })

  /*
    Sin esperar la confirmación, una memoria que la base rechaza aparecería en
    el listado y desaparecería sola en la siguiente visita, sin que nadie haya
    dicho nunca que falló.
  */
  it('si el insert falla, la memoria no entra al listado y el error vuelve a quien la pidió', async () => {
    repositorio.crearMemoria.mockResolvedValue({ ok: false, codigo: 'DATOS_SIN_PERMISO' })
    const result = await montarCargado()

    let resultado: ResultadoMemoria | undefined
    await act(async () => {
      resultado = await result.current.generar(MEMORIA_GUARDADA.idConferencia, MEMORIA_GUARDADA.idPlantilla, 'Nueva')
    })

    expect(resultado).toEqual({ ok: false, codigo: 'DATOS_SIN_PERMISO' })
    expect(result.current.memorias).toEqual([MEMORIA_GUARDADA])
  })

  it('eliminar la quita del listado y la borra en el repositorio', async () => {
    const result = await montarCargado()

    await act(async () => {
      await result.current.eliminar(MEMORIA_GUARDADA.id)
    })

    expect(result.current.memorias).toEqual([])
    expect(repositorio.eliminarMemoria).toHaveBeenCalledWith(MEMORIA_GUARDADA.id)
  })
})
