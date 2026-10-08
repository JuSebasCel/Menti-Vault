import { describe, expect, it } from 'vitest'
import {
  filaParaInsertar,
  mapearComparticion,
  mapearConferencia,
  mapearFicha,
  mapearFilas,
  mapearPrivacidad,
} from './mapeo'
import type { FilaDeConferencia, FilaDeFicha } from './mapeo'

function filaDeConferencia(cambios: Partial<FilaDeConferencia> = {}): FilaDeConferencia {
  return {
    id: 'conf-1',
    titulo: 'Sesgos en modelos de predicción',
    ponente: 'Mariana Escobar',
    evento: 'Jornadas de IA Aplicada',
    codigo_de_evento: 'JIA-2026-03',
    fecha_del_evento: '2026-05-14',
    duracion_en_segundos: 2700,
    id_dueno: 'usuario-1',
    estado: 'procesada',
    id_tema_principal: 'tema-1',
    resumen: 'Resumen de la charla.',
    fuente: 'audio',
    cargada_el: null,
    ...cambios,
  }
}

function filaDeFicha(cambios: Partial<FilaDeFicha> = {}): FilaDeFicha {
  return {
    id: 'ficha-1',
    id_conferencia: 'conf-1',
    fragmento: 'El dato nunca es neutral.',
    hablante: 'Mariana Escobar',
    segundo_inicio: 120,
    segundo_fin: 148,
    id_tema: 'tema-1',
    tipo_de_unidad: 'cita-textual',
    estado_de_validacion: 'validada',
    confianza_automatica: 0.94,
    contexto_minimo: 'Contexto anterior y posterior.',
    ...cambios,
  }
}

describe('mapearPrivacidad', () => {
  it('traduce las cuatro banderas del jsonb', () => {
    expect(
      mapearPrivacidad({
        compartirEtiquetas: true,
        compartirFichasPendientes: false,
        permitirValidarFichas: true,
        permitirRecompartir: false,
      }),
    ).toEqual({
      compartirEtiquetas: true,
      compartirFichasPendientes: false,
      permitirValidarFichas: true,
      permitirRecompartir: false,
    })
  })

  /*
    El caso que importa de verdad: ante un jsonb incompleto o corrupto la
    respuesta tiene que ser la más restrictiva. Si una bandera ausente se
    leyera como verdadera, una compartición malformada abriría fichas
    pendientes a quien el dueño nunca autorizó.
  */
  it('ante un jsonb incompleto asume todo cerrado, nunca abierto', () => {
    expect(mapearPrivacidad({ compartirEtiquetas: true })).toEqual({
      compartirEtiquetas: true,
      compartirFichasPendientes: false,
      permitirValidarFichas: false,
      permitirRecompartir: false,
    })
  })

  it('ante un valor que no es un objeto asume todo cerrado', () => {
    for (const crudo of [null, undefined, 'sí', 42, ['compartirEtiquetas']]) {
      expect(mapearPrivacidad(crudo)).toEqual({
        compartirEtiquetas: false,
        compartirFichasPendientes: false,
        permitirValidarFichas: false,
        permitirRecompartir: false,
      })
    }
  })

  /* Solo el booleano verdadero abre: una cadena "true" es un dato corrupto, no un permiso. */
  it('no acepta valores que solo parecen verdaderos', () => {
    expect(mapearPrivacidad({ compartirEtiquetas: 'true', permitirRecompartir: 1 })).toEqual({
      compartirEtiquetas: false,
      compartirFichasPendientes: false,
      permitirValidarFichas: false,
      permitirRecompartir: false,
    })
  })
})

describe('mapearComparticion', () => {
  it('traduce la fila embebida con su privacidad', () => {
    expect(
      mapearComparticion({
        id_invitado: 'usuario-2',
        compartida_el: '2026-06-01T10:00:00Z',
        privacidad: { compartirEtiquetas: true },
      }),
    ).toEqual({
      idInvitado: 'usuario-2',
      compartidaEl: '2026-06-01T10:00:00Z',
      /* Sin la columna, se asume lo menos permisivo: sin acceso hasta que se acepte. */
      estado: 'pendiente',
      respondidaEl: null,
      invitadoNombre: '',
      invitadoCorreo: '',
      privacidad: {
        compartirEtiquetas: true,
        compartirFichasPendientes: false,
        permitirValidarFichas: false,
        permitirRecompartir: false,
      },
    })
  })
})

describe('mapearConferencia', () => {
  it('traduce snake_case a camelCase conservando todos los campos', () => {
    const conferencia = mapearConferencia(filaDeConferencia())

    expect(conferencia).toEqual({
      id: 'conf-1',
      titulo: 'Sesgos en modelos de predicción',
      ponente: 'Mariana Escobar',
      evento: 'Jornadas de IA Aplicada',
      codigoDeEvento: 'JIA-2026-03',
      fechaDelEvento: '2026-05-14',
      duracionEnSegundos: 2700,
      /* La fila no trae la columna: se cargó sin elegir tope, y cae a null. */
      maximoDeFichas: null,
      tiemposEstimados: false,
      idDueno: 'usuario-1',
      estado: 'procesada',
      idTemaPrincipal: 'tema-1',
      resumen: 'Resumen de la charla.',
      /* La fila no trae la columna: se cargó antes de que existiera, y cae a vacía. */
      descripcion: '',
      fuente: 'audio',
      comparticiones: [],
    })
  })

  /*
    Una conferencia recién cargada no tiene tema todavía. El nulo se traduce a
    la cadena vacía aquí y no en cada componente: el tipo del dominio declara
    `idTemaPrincipal: string`, y propagar el nulo obligaría a cada pantalla a
    defenderse por su cuenta.
  */
  it('sin tema principal deja la cadena vacía, no un nulo', () => {
    expect(mapearConferencia(filaDeConferencia({ id_tema_principal: null }))?.idTemaPrincipal).toBe('')
  })

  it('omite `cargadaEl` cuando la fila no la trae, en vez de dejarla en nulo', () => {
    const conferencia = mapearConferencia(filaDeConferencia({ cargada_el: null }))

    expect(conferencia).not.toHaveProperty('cargadaEl')
  })

  it('conserva `cargadaEl` cuando la fila la trae', () => {
    expect(
      mapearConferencia(filaDeConferencia({ cargada_el: '2026-06-02T08:30:00Z' }))?.cargadaEl,
    ).toBe('2026-06-02T08:30:00Z')
  })

  it('mapea las comparticiones embebidas', () => {
    const conferencia = mapearConferencia(
      filaDeConferencia({
        comparticiones: [
          { id_invitado: 'usuario-2', compartida_el: '2026-06-01T10:00:00Z', privacidad: {} },
        ],
      }),
    )

    expect(conferencia?.comparticiones).toHaveLength(1)
    expect(conferencia?.comparticiones[0]?.idInvitado).toBe('usuario-2')
  })

  /*
    Los `check` de la migración garantizan estos literales, así que una fila
    que no los cumpla significa que el esquema y el mapeo se
    desincronizaron. Se descarta en vez de dibujarse con un estado que la
    interfaz no sabe pintar.
  */
  it('descarta una fila con un estado que el dominio no conoce', () => {
    expect(mapearConferencia(filaDeConferencia({ estado: 'archivada' }))).toBeNull()
  })

  it('descarta una fila con una fuente que el dominio no conoce', () => {
    expect(mapearConferencia(filaDeConferencia({ fuente: 'video' }))).toBeNull()
  })
})

describe('mapearFicha', () => {
  it('traduce la fila conservando la coordenada exacta en la fuente', () => {
    const ficha = mapearFicha(filaDeFicha())

    expect(ficha).toEqual({
      id: 'ficha-1',
      idConferencia: 'conf-1',
      fragmento: 'El dato nunca es neutral.',
      /* La fila no trae la columna: es una escrita antes de que existiera, y cae a vacio. */
      condensado: '',
      editado: '',
      editadaEl: null,
      hablante: 'Mariana Escobar',
      segundoInicio: 120,
      segundoFin: 148,
      idTema: 'tema-1',
      tipoDeUnidad: 'cita-textual',
      estadoDeValidacion: 'validada',
      confianzaAutomatica: 0.94,
      contextoMinimo: 'Contexto anterior y posterior.',
    })
  })

  it('descarta una ficha con un tipo de unidad desconocido', () => {
    expect(mapearFicha(filaDeFicha({ tipo_de_unidad: 'anecdota' }))).toBeNull()
  })

  it('descarta una ficha con un estado de validación desconocido', () => {
    expect(mapearFicha(filaDeFicha({ estado_de_validacion: 'revisada' }))).toBeNull()
  })
})

describe('mapearFilas', () => {
  it('conserva el orden de las filas válidas y descarta las que no se pudieron mapear', () => {
    const filas = [
      filaDeConferencia({ id: 'a' }),
      filaDeConferencia({ id: 'b', estado: 'inventado' }),
      filaDeConferencia({ id: 'c' }),
    ]

    expect(mapearFilas(filas, mapearConferencia).map((conferencia) => conferencia.id)).toEqual([
      'a',
      'c',
    ])
  })

  it('con todas las filas inválidas devuelve una lista vacía, no lanza', () => {
    expect(mapearFilas([filaDeConferencia({ fuente: 'video' })], mapearConferencia)).toEqual([])
  })
})

describe('filaParaInsertar', () => {
  const datos = {
    titulo: 'Charla nueva',
    ponente: 'Rodrigo Peñaloza',
    evento: 'Jornadas de IA Aplicada',
    codigoDeEvento: 'JIA-2026-09',
    fechaDelEvento: '2026-09-01',
    idDueno: 'usuario-1',
    fuente: 'audio',
  } as const

  it('traduce a snake_case lo que sí decide el cliente', () => {
    const fila = filaParaInsertar(datos)

    expect(fila['titulo']).toBe('Charla nueva')
    expect(fila['codigo_de_evento']).toBe('JIA-2026-09')
    expect(fila['fecha_del_evento']).toBe('2026-09-01')
    expect(fila['id_dueno']).toBe('usuario-1')
    expect(fila['fuente']).toBe('audio')
  })

  /*
    El estado inicial no es negociable desde el cliente: poder insertar
    `procesada` sería poder afirmar que una conferencia ya tiene fichas
    validadas sin que nadie las haya producido.
  */
  it('siempre nace en cola, sin resumen y sin duración analizada', () => {
    const fila = filaParaInsertar(datos)

    expect(fila['estado']).toBe('en-cola')
    expect(fila['resumen']).toBe('')
    expect(fila['duracion_en_segundos']).toBe(0)
  })

  it('no inventa un id ni un tema principal: los decide Postgres y el análisis', () => {
    const fila = filaParaInsertar(datos)

    expect(fila).not.toHaveProperty('id')
    expect(fila).not.toHaveProperty('id_tema_principal')
  })
})
