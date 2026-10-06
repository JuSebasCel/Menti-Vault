import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockearFalloDeTabla, mockearTabla, reiniciarMocksDeDatos } from '@/test/supabaseDePrueba'
import { crearMemoria, eliminarMemoria, listarMemorias } from './repositorio'

vi.mock('@/shared/supabase/cliente')

afterEach(() => {
  reiniciarMocksDeDatos()
})

const FILA = {
  id: '5f8c1d2e-7a3b-4c9d-8e01-2f3a4b5c6d70',
  id_conferencia: 'a1b2c3d4-1111-4222-8333-444455556666',
  id_plantilla: 'b1b2c3d4-1111-4222-8333-444455556666',
  id_dueno: 'c1c2c3c4-1111-4222-8333-444455556666',
  nombre: 'Memoria de la charla de apertura',
  generada_el: '2026-04-15T10:00:00.000Z',
}

const MEMORIA = {
  id: FILA.id,
  idConferencia: FILA.id_conferencia,
  idPlantilla: FILA.id_plantilla,
  idDueno: FILA.id_dueno,
  nombre: FILA.nombre,
  generadaEl: FILA.generada_el,
  estado: 'lista' as const,
}

describe('listarMemorias', () => {
  it('traduce la fila a su forma de dominio', async () => {
    mockearTabla('memorias', [FILA])

    expect(await listarMemorias()).toEqual({ ok: true, datos: [MEMORIA] })
  })

  /*
    La fila guarda referencias, nunca el documento generado (PLAN.md 1.3): la
    memoria se regenera al abrirla, así que refleja las fichas validadas de hoy
    y no las del día en que se pulsó "Generar".
  */
  it('lo que vuelve son referencias, sin rastro de un documento congelado', async () => {
    mockearTabla('memorias', [FILA])

    const resultado = await listarMemorias()

    expect(resultado.ok).toBe(true)
    if (resultado.ok) {
      expect(Object.keys(resultado.datos[0] ?? {})).toEqual([
        'id',
        'idConferencia',
        'idPlantilla',
        'idDueno',
        'nombre',
        'generadaEl',
        'estado',
      ])
    }
  })

  it('sin filas devuelve una lista vacía, no un fallo', async () => {
    mockearTabla('memorias', [])

    expect(await listarMemorias()).toEqual({ ok: true, datos: [] })
  })

  it('traduce una caída de red al código de sin conexión', async () => {
    mockearFalloDeTabla('memorias', '', 'TypeError: Failed to fetch')

    expect(await listarMemorias()).toEqual({ ok: false, codigo: 'DATOS_SIN_CONEXION' })
  })
})

describe('escrituras de memorias', () => {
  it('crear devuelve la misma memoria que se pidió guardar', async () => {
    mockearTabla('memorias', null)

    expect(await crearMemoria(MEMORIA)).toEqual({ ok: true, datos: MEMORIA })
  })

  /*
    Generar sobre una conferencia o una plantilla que ya no existe rompe la
    llave foránea. La capa compartida lo traduce a "no te corresponde", que es
    lo correcto de cara a quien lo ve: distinguir "no existe" de "es de otra
    persona" convertiría el panel en un oráculo sobre lo que cargaron los demás.
  */
  it('una llave foránea rota se traduce a sin permiso', async () => {
    mockearFalloDeTabla('memorias', '23503')

    expect(await crearMemoria(MEMORIA)).toEqual({ ok: false, codigo: 'DATOS_SIN_PERMISO' })
  })

  it('eliminar propaga el fallo con su código traducido', async () => {
    mockearFalloDeTabla('memorias', '42501')

    expect(await eliminarMemoria(MEMORIA.id)).toEqual({ ok: false, codigo: 'DATOS_SIN_PERMISO' })
  })
})
