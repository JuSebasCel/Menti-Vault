import type {
  Comparticion,
  Conferencia,
  EstadoDeComparticion,
  EstadoDeProcesamiento,
  EstadoDeValidacion,
  Ficha,
  FuenteDeConferencia,
  PrivacidadDeComparticion,
  TipoDeUnidad,
} from '../data'

/*
  Traducción entre la fila de Postgres y el tipo del dominio.

  Vive aparte del repositorio, y no dentro de cada consulta, porque es la
  única parte de la migración que se puede probar sin simular la red: si el
  mapeo está bien, lo que queda en el repositorio es una consulta y poco más.

  Dos convenciones cruzan la frontera aquí. La base de datos escribe en
  `snake_case` y el dominio en `camelCase`; y la base admite nulos donde el
  dominio exige un valor (`id_tema_principal` de una conferencia que todavía
  no se ha procesado, por ejemplo). Traducir en un solo lugar evita que cada
  pantalla tenga que acordarse de las dos cosas.

  Sobre las filas malformadas: se descartan en vez de repararse a medias. Los
  `check` de las migraciones garantizan los literales de estado, fuente y tipo
  de unidad, así que una fila que no los cumpla significa que el esquema y
  este archivo se desincronizaron — y dibujar una ficha con un estado que la
  interfaz no sabe pintar es peor que no dibujarla. Descartar deja el resto
  del listado utilizable; lanzar dejaría la pantalla entera en blanco.
*/

/** Forma cruda de una fila de `comparticiones`, tal como la devuelve PostgREST. */
export type FilaDeComparticion = {
  readonly id_invitado: string
  readonly compartida_el: string
  readonly privacidad: unknown
  readonly estado?: string | null
  readonly respondida_el?: string | null
  readonly invitado_nombre?: string | null
  readonly invitado_correo?: string | null
  readonly respuesta_vista_por_dueno?: boolean | null
}

export type FilaDeConferencia = {
  readonly id: string
  readonly titulo: string
  readonly ponente: string
  readonly evento: string
  readonly codigo_de_evento: string
  readonly fecha_del_evento: string
  readonly duracion_en_segundos: number
  readonly maximo_de_fichas?: number | null
  readonly tiempos_estimados?: boolean | null
  readonly id_dueno: string
  readonly estado: string
  readonly id_tema_principal: string | null
  readonly resumen: string
  /* Ausente en las filas escritas antes de la migracion que anadio la columna. */
  readonly descripcion?: string | null
  readonly fuente: string
  readonly cargada_el: string | null
  /* Viaja embebida al pedir `comparticiones(...)` en el select; ausente si no se pidió. */
  readonly comparticiones?: readonly FilaDeComparticion[] | null
}

export type FilaDeFicha = {
  readonly id: string
  readonly id_conferencia: string
  readonly fragmento: string
  /* Ausente en las filas escritas antes de la migración que añadió la columna. */
  readonly condensado?: string | null
  /* Ausentes antes de la migración 20260922120000. */
  readonly editado?: string | null
  readonly editada_el?: string | null
  readonly hablante: string
  readonly segundo_inicio: number
  readonly segundo_fin: number
  readonly id_tema: string
  readonly tipo_de_unidad: string
  readonly estado_de_validacion: string
  readonly confianza_automatica: number
  readonly contexto_minimo: string
}

const ESTADOS_DE_PROCESAMIENTO: readonly string[] = ['en-cola', 'procesando', 'procesada', 'fallida']
const FUENTES: readonly string[] = ['audio', 'transcripcion']
const TIPOS_DE_UNIDAD: readonly string[] = [
  'cita-textual',
  'metodo',
  'estrategia',
  'postura',
  'dato-de-impacto',
  'fase-del-trabajo',
]
const ESTADOS_DE_VALIDACION: readonly string[] = ['validada', 'pendiente', 'automatica']

/*
  Valor por defecto de la privacidad, idéntico al `default` de la columna
  `privacidad` en la migración: todo cerrado. Se repite aquí a propósito — si
  el jsonb llegara incompleto, la interfaz debe asumir lo más restrictivo,
  nunca lo más permisivo. Un `undefined` interpretado como verdadero abriría
  fichas pendientes a quien no debía verlas.
*/
const PRIVACIDAD_CERRADA: PrivacidadDeComparticion = {
  compartirEtiquetas: false,
  compartirFichasPendientes: false,
  permitirValidarFichas: false,
  permitirRecompartir: false,
}

function bandera(fuente: Record<string, unknown>, nombre: keyof PrivacidadDeComparticion): boolean {
  return fuente[nombre] === true
}

export function mapearPrivacidad(crudo: unknown): PrivacidadDeComparticion {
  if (typeof crudo !== 'object' || crudo === null || Array.isArray(crudo)) {
    return PRIVACIDAD_CERRADA
  }

  const fuente = crudo as Record<string, unknown>

  return {
    compartirEtiquetas: bandera(fuente, 'compartirEtiquetas'),
    compartirFichasPendientes: bandera(fuente, 'compartirFichasPendientes'),
    permitirValidarFichas: bandera(fuente, 'permitirValidarFichas'),
    permitirRecompartir: bandera(fuente, 'permitirRecompartir'),
  }
}

const ESTADOS_DE_COMPARTICION: readonly string[] = ['pendiente', 'aceptada', 'rechazada']

export function mapearComparticion(fila: FilaDeComparticion): Comparticion {
  /*
    Un estado que no se reconoce cae a `pendiente`, que es el menos permisivo:
    ante una fila que no se entiende, lo correcto es no dar acceso. Lo mismo
    para una fila vieja sin la columna.
  */
  const estado = ESTADOS_DE_COMPARTICION.includes(fila.estado ?? '')
    ? (fila.estado as EstadoDeComparticion)
    : 'pendiente'

  return {
    idInvitado: fila.id_invitado,
    compartidaEl: fila.compartida_el,
    estado,
    respondidaEl: fila.respondida_el ?? null,
    invitadoNombre: fila.invitado_nombre ?? '',
    invitadoCorreo: fila.invitado_correo ?? '',
    ...(fila.respuesta_vista_por_dueno === true ? { respuestaVista: true } : {}),
    privacidad: mapearPrivacidad(fila.privacidad),
  }
}

export function mapearConferencia(fila: FilaDeConferencia): Conferencia | null {
  if (!ESTADOS_DE_PROCESAMIENTO.includes(fila.estado) || !FUENTES.includes(fila.fuente)) {
    return null
  }

  const base: Conferencia = {
    id: fila.id,
    titulo: fila.titulo,
    ponente: fila.ponente,
    evento: fila.evento,
    codigoDeEvento: fila.codigo_de_evento,
    fechaDelEvento: fila.fecha_del_evento,
    duracionEnSegundos: fila.duracion_en_segundos,
    /* `0` tambien es "sin tope": un tope de cero fichas no significa nada. */
    maximoDeFichas: fila.maximo_de_fichas ? fila.maximo_de_fichas : null,
    tiemposEstimados: fila.tiempos_estimados === true,
    idDueno: fila.id_dueno,
    estado: fila.estado as EstadoDeProcesamiento,
    /*
      Una conferencia recién cargada todavía no tiene tema principal: nadie la
      ha analizado. La cadena vacía es el «sin tema» que el dominio ya sabe
      mostrar, en vez de propagar el nulo hasta cada componente.
    */
    idTemaPrincipal: fila.id_tema_principal ?? '',
    resumen: fila.resumen,
    descripcion: fila.descripcion ?? '',
    fuente: fila.fuente as FuenteDeConferencia,
    comparticiones: (fila.comparticiones ?? []).map(mapearComparticion),
  }

  /* `cargadaEl` es opcional en el dominio: se omite en vez de quedar en nulo. */
  return fila.cargada_el === null ? base : { ...base, cargadaEl: fila.cargada_el }
}

export function mapearFicha(fila: FilaDeFicha): Ficha | null {
  if (
    !TIPOS_DE_UNIDAD.includes(fila.tipo_de_unidad) ||
    !ESTADOS_DE_VALIDACION.includes(fila.estado_de_validacion)
  ) {
    return null
  }

  return {
    id: fila.id,
    idConferencia: fila.id_conferencia,
    fragmento: fila.fragmento,
    condensado: fila.condensado ?? '',
    editado: fila.editado ?? '',
    editadaEl: fila.editada_el ?? null,
    hablante: fila.hablante,
    segundoInicio: fila.segundo_inicio,
    segundoFin: fila.segundo_fin,
    idTema: fila.id_tema,
    tipoDeUnidad: fila.tipo_de_unidad as TipoDeUnidad,
    estadoDeValidacion: fila.estado_de_validacion as EstadoDeValidacion,
    confianzaAutomatica: fila.confianza_automatica,
    contextoMinimo: fila.contexto_minimo,
  }
}

/** Descarta las filas que no se pudieron mapear, conservando el orden de las que sí. */
export function mapearFilas<F, T>(filas: readonly F[], mapear: (fila: F) => T | null): readonly T[] {
  const mapeadas: T[] = []

  for (const fila of filas) {
    const mapeada = mapear(fila)

    if (mapeada !== null) {
      mapeadas.push(mapeada)
    }
  }

  return mapeadas
}

/*
  Sentido inverso, para insertar. No es simétrico a propósito: el id y el
  estado inicial no los decide el cliente, y una conferencia recién creada
  todavía no tiene tema principal, resumen ni duración analizada.
*/
export type ConferenciaParaInsertar = {
  readonly titulo: string
  readonly ponente: string
  readonly evento: string
  readonly codigoDeEvento: string
  readonly fechaDelEvento: string
  readonly idDueno: string
  readonly fuente: FuenteDeConferencia
  /** Leída del propio archivo cuando es audio; 0 en transcripción. */
  readonly duracionEnSegundos?: number
  /** Cuantas fichas se piden. `null` es sin limite. */
  readonly maximoDeFichas?: number | null
}

export function filaParaInsertar(conferencia: ConferenciaParaInsertar): Record<string, unknown> {
  return {
    titulo: conferencia.titulo,
    ponente: conferencia.ponente,
    evento: conferencia.evento,
    codigo_de_evento: conferencia.codigoDeEvento,
    fecha_del_evento: conferencia.fechaDelEvento,
    id_dueno: conferencia.idDueno,
    /*
      Nace `en-cola`: la carga solo deja el material disponible. Quien lo
      transcribe y lo despieza en fichas es el backend de análisis, que mueve
      el estado a `procesando` y de ahí a `procesada` o `fallida`. Que el
      cliente pudiera escribir `procesada` sería poder afirmar que hay fichas
      sin que nadie las haya producido.
    */
    estado: 'en-cola',
    fuente: conferencia.fuente,
    resumen: '',
    duracion_en_segundos: conferencia.duracionEnSegundos ?? 0,
    maximo_de_fichas: conferencia.maximoDeFichas ?? null,
    cargada_el: new Date().toISOString(),
  }
}
