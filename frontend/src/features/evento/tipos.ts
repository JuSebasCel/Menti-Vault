/*
  El evento como unidad de trabajo: quién habló, qué consintió, qué aprobó y
  qué se produjo con ello.

  Es el modelo del producto reorientado (ver `planes/referencia-melonmind-mind.md`
  y la memoria del proyecto): ya no gira en torno a las fichas, sino al ciclo
  editorial de un congreso hasta su publicación.
*/

export type EstadoDeConsentimiento = 'sin-enviar' | 'enviado' | 'aceptado' | 'rechazado'

export type EstadoDeAprobacion = 'sin-enviar' | 'enviada' | 'aprobada' | 'con-cambios'

/*
  Un uso por clave y no un único "acepto": publicar una cita en redes es un
  uso distinto a la memoria académica, y quien acepta uno puede no aceptar el
  otro.
*/
export const USOS_DEL_CONSENTIMIENTO = [
  { clave: 'grabacion', etiqueta: 'Que grabemos su sesión' },
  { clave: 'transcripcion', etiqueta: 'Que la transcribamos' },
  { clave: 'memoria', etiqueta: 'Que la incluyamos en la memoria del evento' },
  { clave: 'produccion_academica', etiqueta: 'Que la citemos en artículos académicos' },
  { clave: 'ia_de_terceros', etiqueta: 'Que la procesemos con inteligencia artificial' },
  { clave: 'redes', etiqueta: 'Que publiquemos citas y fotos suyas en redes' },
] as const

export type UsoDelConsentimiento = (typeof USOS_DEL_CONSENTIMIENTO)[number]['clave']

export type Evento = {
  readonly id: string
  readonly nombre: string
  readonly descripcion: string
  readonly lugar: string
  readonly fechaInicio: string | null
  readonly fechaFin: string | null
  /** Los ejes temáticos que el evento usa; vacío si no agrupa por ejes. */
  readonly ejes: readonly string[]
  /** Ruta del `.docx` con el formato de las memorias, uno por evento. */
  readonly formatoDeMemoria: string | null
  /** Reglas en lenguaje natural que acompañan al formato al redactar. */
  readonly indicacionesDeMemoria: string
}

export type ResumenDeEvento = { readonly id: string; readonly nombre: string; readonly ponencias: number }

export type Ponente = {
  readonly id: string
  readonly nombre: string
  readonly correo: string | null
  readonly institucion: string
  readonly consentimiento: EstadoDeConsentimiento
  readonly usos: Partial<Record<UsoDelConsentimiento, boolean>>
  readonly versionDelConsentimiento: string | null
  readonly enviadoEl: string | null
  readonly respondidoEl: string | null
}

export type Ponencia = {
  readonly id: string
  readonly titulo: string
  readonly ponente: string
  readonly fecha: string
  readonly duracionEnSegundos: number
  readonly agrupacion: string
  readonly orden: number
  readonly aprobacion: EstadoDeAprobacion
  readonly aprobadaEl: string | null
  readonly comentarioDelPonente: string
  readonly idDueno: string
  /** `HH:MM`, o null si la sesión todavía no tiene hora en la agenda. */
  readonly horaInicio: string | null
  readonly horaFin: string | null
  readonly sala: string
  readonly tipo: TipoDeSesion
  /** Etiqueta temática opcional; vacía si el evento no usa ejes. */
  readonly eje: string
  /** Si ya hay grabación o transcripción: una sesión de la agenda puede no tenerla todavía. */
  readonly tieneTranscripcion: boolean
}

export type TipoDeSesion = 'conferencia' | 'taller' | 'panel' | 'apertura' | 'cierre'

export type Memoria = {
  readonly id: string
  readonly nombre: string
  readonly alcance: 'ponencia' | 'agrupacion' | 'evento'
  readonly idConferencia: string | null
  /** El eje de una memoria por eje; null en las de ponencia y la del evento. */
  readonly agrupacion: string | null
  readonly archivoPdf: string | null
  readonly archivoDocx: string | null
  readonly generadaEl: string
  /** Lo esencial de la memoria en texto, para quien la consulte sin abrir el PDF (el chat, por ejemplo). */
  readonly resumen: string
  readonly conclusiones: readonly string[]
}

export type Evidencia = {
  readonly clave: string
  readonly idConferencia: string
  readonly ponente: string
  readonly segundo: number
  readonly texto: string
  readonly verificada: boolean
}

export type Enfoque = {
  readonly titulo: string
  readonly pregunta: string
  readonly tipo: string
  readonly ponentes: number
  readonly evidencias: number
  readonly respaldo: 'solido' | 'suficiente' | 'insuficiente'
  readonly recomendado: boolean
  readonly por_que: string
}

export type Produccion = {
  readonly id: string
  readonly titulo: string
  readonly tipo: string
  readonly idea: string
  readonly enfoques: readonly Enfoque[]
  readonly esquema: readonly { readonly titulo: string; readonly evidencias: readonly string[] }[]
  readonly secciones: readonly { readonly titulo: string; readonly texto: string }[]
  readonly evidencias: readonly Evidencia[]
  readonly creadaEl: string
}

export type Publicacion = {
  readonly id: string
  readonly idConferencia: string | null
  readonly red: 'linkedin' | 'instagram' | 'x' | 'facebook'
  readonly formato: 'cita' | 'resumen' | 'carrusel' | 'anuncio'
  readonly texto: string
  readonly cita: string
  readonly ponente: string
  readonly programadaPara: string | null
  readonly estado: 'propuesta' | 'aprobada' | 'programada' | 'publicada'
}

export type DatosDelEvento = {
  readonly evento: Evento
  readonly ponentes: readonly Ponente[]
  readonly ponencias: readonly Ponencia[]
  readonly memorias: readonly Memoria[]
  readonly producciones: readonly Produccion[]
  readonly publicaciones: readonly Publicacion[]
}

export type Segmento = {
  readonly inicio: number
  readonly fin: number
  readonly texto: string
}
