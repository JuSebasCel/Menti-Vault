import type { TonoDePlantilla } from '../tono'
/*
  Tipos del dominio de plantillas.

  Una plantilla es un `.docx` diseñado en Word y conservado intacto: la app
  nunca lo reconstruye ni lo edita, solo lee sus marcadores `[[...]]` y guarda,
  para cada uno, qué debe escribir la IA ahí. El diseño se hace en Word porque
  ahí ya se sabe hacer, y un editor dentro de la app —que llegó a existir, la
  "plantilla en blanco"— habría sido un Word peor.
*/

/** Los cinco campos del repositorio que `PLAN.md` sección 5.6 nombra como ejemplo de placeholder. */
export type CampoDeMarcador =
  | 'tema_principal'
  | 'cita_destacada'
  | 'nombre_ponente'
  | 'fecha_evento'
  | 'resumen_metodo'

/** Cómo se espera que se vea el contenido generado para un marcador simple. */
export type FormatoDeMarcador = 'parrafo' | 'lista_vinetas' | 'lista_numerada'

/**
 * Un marcador liga a uno de los cinco campos fijos del repositorio, o a una
 * etiqueta de texto libre cuando la plantilla necesita algo que ningún campo
 * fijo cubre (ej. "Puntos de la agenda del evento"). Nunca ambos a la vez.
 */
export type OrigenDeMarcador =
  | { readonly tipo: 'campo'; readonly campo: CampoDeMarcador }
  | { readonly tipo: 'personalizado'; readonly etiqueta: string }

// ---------------------------------------------------------------------------
// Plantilla importada de .docx: el archivo original nunca se modifica.
// ---------------------------------------------------------------------------

/**
 * Un marcador simple sustituye un único `[[texto]]` por el dato mapeado —
 * `editor/prepararComandos.ts` lo traduce a un `INS` de `docx-templates`.
 */
export type MarcadorSimpleDeDocx = {
  readonly tipo: 'simple'
  readonly id: string
  /** El texto exacto tal como aparece en el archivo, ej. `"[[Nombre grupo]]"`. */
  readonly textoOriginal: string
  /** Texto completo del párrafo que contiene el marcador — para mostrarlo con contexto, no como un corchete suelto. */
  readonly contexto: string
  readonly origenDeDato: OrigenDeMarcador
  readonly formato: FormatoDeMarcador
  /**
   * Qué tiene que escribir la IA en este hueco, en palabras de quien diseñó la
   * plantilla: "resume en dos párrafos la tesis principal del ponente".
   *
   * Se escribe una vez al configurar la plantilla y vale para todas las
   * memorias que salgan de ella. Opcional porque las plantillas subidas antes
   * de que existiera no la tienen, y `marcadores` es un `jsonb`: añadir el
   * campo no pidió migración, pero tampoco lo rellenó en las filas viejas.
   */
  readonly instruccion?: string
  /**
   * Qué hacer cuando la IA no encuentra nada para este campo. Sin valor,
   * `quitar`: en "Tema: [[Tema]]", dejar el renglón deja un "Tema:" colgando,
   * que se lee como un descuido. Quitarlo entero no deja rastro de que ese
   * campo existía.
   */
  readonly siVacio?: ComportamientoSiVacio
  /**
   * Si la IA redacta o copia. Sin valor, `redactar`.
   *
   * Existe porque hay campos que no se pueden parafrasear: una "Cita
   * destacada" que el modelo reescribe deja de ser una cita, y la memoria
   * estaría entrecomillando algo que nadie dijo así.
   */
  readonly modo?: ModoDeCampo
  /** Cuánto debe ocupar lo redactado. Sin valor, `media`. No aplica a una cita, que mide lo que mide. */
  readonly extension?: ExtensionDeCampo
  /**
   * De qué lista salió la configuración de este campo (ver `tiposDeCampo.ts`).
   * Solo sirve para enseñar en la interfaz de dónde vino: lo que manda es la
   * instrucción, que después se edita libremente.
   */
  readonly tipoDeCampo?: string
  /**
   * Las únicas respuestas admitidas. Con esto, la IA no redacta: escoge una
   * de estas, copiada igual. Para campos como "Modalidad: conferencia /
   * taller / panel", donde una palabra distinta rompe el documento.
   */
  readonly opciones?: readonly string[]
}

/**
 * `redactar`: la IA escribe con sus palabras a partir de las fichas.
 * `cita`: copia palabra por palabra el fragmento de la charla que mejor
 * responde a la instrucción, sin tocarlo.
 */
export type ModoDeCampo = 'redactar' | 'cita'

/**
 * Cuánto ocupa lo que se escribe. Es lo que más descuadra una plantilla de
 * Word: un campo pensado para una línea que recibe tres párrafos empuja todo
 * lo de debajo a la página siguiente.
 */
export type ExtensionDeCampo = 'breve' | 'media' | 'extensa'

/**
 * Lo que pasa con un hueco para el que la conferencia no dio material — una
 * charla sin tesis clara, un marcador de "datos de impacto" sin datos. Lo
 * elige quien diseña la plantilla, no la IA: inventar texto para rellenar es
 * justo lo que una memoria no puede hacer.
 */
export type ComportamientoSiVacio = 'dejar-vacio' | 'quitar' | 'avisar'

/**
 * Envuelve un tramo del documento escrito en Word entre `[[SI: descripción]]`
 * / `[[FIN SI]]` (condicional) o `[[REPETIR: descripción]]` / `[[FIN
 * REPETIR]]` (repetible) — se traduce a `IF`/`FOR` de `docx-templates`.
 */
export type MarcadorDeSeccionDeDocx = {
  readonly tipo: 'condicional' | 'repetible'
  readonly id: string
  readonly descripcion: string
  readonly origenDeDato: OrigenDeMarcador
}

export type MarcadorDeDocx = MarcadorSimpleDeDocx | MarcadorDeSeccionDeDocx

export type PlantillaDesdeDocx = {
  readonly id: string
  readonly nombre: string
  readonly origen: 'docx'
  /**
   * Ruta del `.docx` dentro del bucket `plantillas-docx`, nunca sus bytes.
   *
   * Hasta B6 este campo era el archivo entero como data URL en base64. Un
   * `.docx` de los 10 MB que admite `validarDocx` ocupaba ahí cerca de 14 MB
   * de texto, dentro de un `sessionStorage` con una cuota típica de 5 MB:
   * bastaba una plantilla real para que el guardado empezara a fallar en
   * silencio. Ahora el archivo se sube al bucket y el registro guarda solo su
   * ruta (`plantillas.ruta_archivo_original`); los bytes se descargan cuando
   * de verdad hacen falta (miniatura, confirmación, generación de memoria).
   */
  readonly rutaArchivoOriginal: string
  readonly marcadores: readonly MarcadorDeDocx[]
  readonly actualizadaEl: string
  /** Con qué tono se redactan sus memorias. Ausente = el de siempre (ver `tono.ts`). */
  readonly tono?: TonoDePlantilla
}

export type Plantilla = PlantillaDesdeDocx

/**
 * Dato real de una conferencia para uno o más de los cinco campos fijos,
 * usado por F5 al generar una memoria — ver `campos.ts`. Un campo ausente del
 * registro cae al dato de ejemplo de ese campo, nunca lanza.
 */
export type RegistroDeDatosDeCampo = Partial<Record<CampoDeMarcador, { readonly parrafo: string; readonly lista: readonly string[] }>>

