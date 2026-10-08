/*
  Tipos del dominio de conferencias y fichas.

  Traducen a TypeScript la estructura de la ficha de PRD.md sección 4 y
  PLAN.md sección 3. Son solo declaraciones: la lógica que opera sobre ellos
  vive en `query/`, y los datos de ejemplo en los fixtures de esta carpeta.

  Aviso de nombres: en el resto del proyecto `etiqueta` significa "rótulo de un
  control" (Field.etiqueta, SeccionDeNavegacion.etiqueta). Aquí `Etiqueta` es un
  concepto de dominio distinto, con su propio `nombre`. Para no cruzar los dos
  sentidos, dentro de esta carpeta nunca se usa `etiqueta` como rótulo, y el
  componente que la dibuja se llama `Pastilla`, no `Etiqueta`.
*/

/** Punto del recorrido de una conferencia desde que se carga hasta que tiene fichas. */
export type EstadoDeProcesamiento = 'en-cola' | 'procesando' | 'procesada' | 'fallida'

/** Los seis tipos base de unidad de PLAN.md sección 3.2. */
export type TipoDeUnidad =
  'cita-textual' | 'metodo' | 'estrategia' | 'postura' | 'dato-de-impacto' | 'fase-del-trabajo'

/*
  Estado de validación de una ficha (PLAN.md sección 3). Se corresponde uno a
  uno con los tokens semánticos del sistema de diseño: validado, pendiente y
  alta confianza automática.
*/
export type EstadoDeValidacion = 'validada' | 'pendiente' | 'automatica'

/** De dónde viene el contenido original de una conferencia. Nombrado aparte (F3) para que el formulario de carga y `Conferencia` compartan la misma unión. */
export type FuenteDeConferencia = 'audio' | 'transcripcion'

export type Ficha = {
  readonly id: string
  readonly idConferencia: string
  /** Texto exacto extraído de la charla, tal como se dijo. */
  readonly fragmento: string
  /**
   * La misma idea sin las repeticiones del habla, escrita para leerse.
   *
   * Es lo que se muestra por defecto; `fragmento` sigue siendo lo que se
   * cita. Vacío significa que no hizo falta condensarla —ya se entendía
   * leída— o que el análisis corrió antes de que esto existiera, y en los
   * dos casos se enseña la literal.
   */
  readonly condensado: string
  /**
   * La versión escrita a mano por el dueño, si la corrigió. No pisa ni a
   * `fragmento` ni a `condensado`: las tres conviven, y la que se lee es esta
   * cuando existe. Opcional porque las fichas de ejemplo y las filas viejas
   * no la traen; vacía o ausente es lo mismo: sin editar.
   */
  readonly editado?: string
  /** Cuándo se editó. Es lo que marca la ficha como modificada. */
  readonly editadaEl?: string | null
  /** Quién lo dijo. Puede no ser el ponente principal cuando la charla fue un panel. */
  readonly hablante: string
  /** Trazabilidad al segundo exacto, requisito no funcional del PRD sección 9. */
  readonly segundoInicio: number
  readonly segundoFin: number
  /**
   * Referencia a un tema del pool de `features/taxonomia`, no una etiqueta
   * personal ni texto libre. Se guarda el id y no el nombre para que
   * renombrar un tema desde la administración no desligue las fichas ya
   * clasificadas con él.
   */
  readonly idTema: string
  readonly tipoDeUnidad: TipoDeUnidad
  readonly estadoDeValidacion: EstadoDeValidacion
  /** Confianza auto-reportada por el clasificador, entre 0 y 1. */
  readonly confianzaAutomatica: number
  /** Segundos antes y después, para revisar sin reescuchar la charla completa. */
  readonly contextoMinimo: string
}

/*
  Opciones de privacidad de una compartición (PRD.md sección 3.2). Es un
  conjunto extensible, no un interruptor: F8 añade más, y por eso viajan
  agrupadas en un objeto y no como banderas sueltas dentro de Comparticion.

  Candidatas ya identificadas para F8, que no se declaran hasta que algo las
  lea: permitir que el invitado valide fichas, permitir que las recomparta, y
  compartir las notas personales del dueño.
*/
export type PrivacidadDeComparticion = {
  /** Si las etiquetas personales del dueño viajan con la conferencia. */
  readonly compartirEtiquetas: boolean
  /** Si el invitado ve también las fichas que siguen pendientes de revisión. */
  readonly compartirFichasPendientes: boolean
  /** Si el invitado puede marcar como validada una ficha de esta conferencia (F8). */
  readonly permitirValidarFichas: boolean
  /** Si el invitado puede compartir esta misma conferencia con alguien más (F8). */
  readonly permitirRecompartir: boolean
}

/*
  Una comparticion nace `pendiente`: compartir es invitar, no dar acceso.

  Mientras no se acepte, el invitado ve de que va la charla pero no su
  contenido — la politica de RLS sobre `fichas` exige el estado `aceptada`.
*/
export type EstadoDeComparticion = 'pendiente' | 'aceptada' | 'rechazada'

export type Comparticion = {
  readonly idInvitado: string
  readonly estado: EstadoDeComparticion
  /*
    Copia del nombre y el correo en el momento de invitar. Se guardan aqui
    porque `profiles` no es legible entre cuentas, y sin esto el aviso al
    dueno solo podria decir "Aceptaron tu charla" sin decir quien.
  */
  readonly invitadoNombre: string
  readonly invitadoCorreo: string
  /** El dueño ya descartó el aviso de que le contestaron: no vuelve a la campana. */
  readonly respuestaVista?: boolean
  /** Cuando el invitado contesto, en ISO. `null` mientras siga pendiente. */
  readonly respondidaEl: string | null
  /** Fecha ISO en que el dueño compartió la conferencia. */
  readonly compartidaEl: string
  readonly privacidad: PrivacidadDeComparticion
}

export type Conferencia = {
  readonly id: string
  readonly titulo: string
  readonly ponente: string
  readonly evento: string
  /** Coordenada de la charla dentro del evento. Se muestra en monoespaciada. */
  readonly codigoDeEvento: string
  /** Fecha ISO. Se guarda como cadena para poder ordenar sin construir un Date. */
  readonly fechaDelEvento: string
  readonly duracionEnSegundos: number
  /**
   * Cuantas fichas se pidieron al cargarla. `null` es sin tope.
   *
   * Se guarda y se ensena porque es una decision de quien la subio, y sin
   * verla no hay forma de saber si el analisis obedecio: una charla con
   * ciento cuarenta y nueve fichas se lee igual de bien tanto si es lo que se
   * pidio como si el tope se perdio por el camino.
   */
  readonly maximoDeFichas: number | null
  /**
   * Los minutos de sus fichas son una estimación, no un dato: la charla llegó
   * como texto sin marcas de tiempo. La interfaz no los enseña, porque un
   * minuto que parece medido y no lo es resulta peor que no dar ninguno.
   */
  readonly tiemposEstimados?: boolean
  /** Cuenta que cargó la conferencia y decide con quién se comparte. */
  readonly idDueno: string
  readonly estado: EstadoDeProcesamiento
  /** Tema dominante de la charla, referenciado por id igual que `Ficha.idTema`. */
  readonly idTemaPrincipal: string
  readonly resumen: string
  /**
   * Nota escrita a mano por quien la subio. Vacia es lo normal.
   *
   * No es `resumen`: ese lo escribe el analisis y lo reescribe cada vez que
   * se reanaliza, asi que lo que una persona pusiera ahi se perderia sin
   * avisar. Esta no la toca el backend nunca.
   */
  readonly descripcion: string
  readonly fuente: FuenteDeConferencia
  readonly comparticiones: readonly Comparticion[]
  /**
   * Fecha y hora ISO en que se cargó, presente solo en conferencias subidas
   * en esta sesión (F3). Sirve para simular en el listado el avance del
   * procesamiento en tiempo real; el fixture no la trae.
   */
  readonly cargadaEl?: string
}

/*
  Etiqueta personal: texto libre que cada persona crea al vuelo para organizar
  su propio trabajo. Es privada por defecto y no forma parte de la taxonomía de
  temas del sistema (PRD.md sección 3.1, PLAN.md sección 3.1.1). Dos personas
  pueden tener una etiqueta con el mismo nombre sin que sea la misma etiqueta.
*/
export type Etiqueta = {
  readonly id: string
  readonly nombre: string
  readonly idPropietario: string
}

export type AsignacionDeEtiqueta = {
  readonly idEtiqueta: string
  readonly idConferencia: string
}

/** Todo lo que una persona ha etiquetado. Un espacio por usuario, sin cruce entre ellos. */
export type EspacioDeEtiquetas = {
  readonly etiquetas: readonly Etiqueta[]
  readonly asignaciones: readonly AsignacionDeEtiqueta[]
}

export const ESPACIO_DE_ETIQUETAS_VACIO: EspacioDeEtiquetas = {
  etiquetas: [],
  asignaciones: [],
}

/*
  Evento y ponente son el directorio compartido de F3 (carga de conferencia):
  a diferencia de las etiquetas, no son del espacio personal de nadie, son
  datos del grupo. Un ponente queda asociado a un evento porque la misma
  persona real puede hablar en más de uno sin que sean la misma entrada
  (PLAN.md sección 7).
*/
export type Evento = {
  readonly id: string
  readonly nombre: string
}

export type Ponente = {
  readonly id: string
  readonly nombre: string
  readonly idEvento: string
}
