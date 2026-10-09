import { fecha, minuto, mismoPonente } from '../formato'
import { leerTranscripcion } from '../repositorio'
import type { DatosDelEvento, Ponencia } from '../tipos'

/*
  El motor de Menti: responde preguntas sobre el evento con lo que el evento
  tiene, sin inventar. Primero reconoce qué tipo de pregunta es —la agenda,
  quién habló de algo, qué ponencias tocaron un tema, de qué trató una
  ponencia, si lo que se dijo es cierto— y, si no es ninguna, busca en las
  transcripciones.

  La búsqueda puntúa ventanas de tres segmentos (unos quince segundos de
  habla) por los términos de la pregunta, con más peso para los términos
  raros en el evento y para los que aparecen juntos. Los resultados se
  devuelven con su ponente, su ponencia y su minuto, para escucharlos: una
  respuesta del chat se comprueba igual que una cita de un artículo.

  Recuerda de qué se venía hablando —las ponencias y el tema de la última
  respuesta— para que "¿y de esos, qué tan cierto es?" sepa a qué se
  refiere "esos". La memoria vive lo que vive la conversación.
*/

export type Fragmento = {
  readonly idConferencia: string
  readonly idDueno: string
  readonly ponencia: string
  readonly ponente: string
  readonly segundo: number
  readonly texto: string
  /** Qué clase de afirmación es, cuando se pidió comprobar: un dato se contrasta, una opinión se discute. */
  readonly etiqueta?: 'dato' | 'opinion' | 'afirmacion'
  /** Una búsqueda académica con la idea del fragmento, para contrastarla fuera del evento. */
  readonly contrastar?: string
}

export type Respuesta = {
  readonly texto: string
  readonly fragmentos: readonly Fragmento[]
  /** Sesiones a las que la respuesta remite, para abrirlas. */
  readonly sesiones: readonly { readonly id: string; readonly titulo: string; readonly detalle: string }[]
  readonly puntos?: readonly string[]
}

const VACIAS = new Set(
  'a al algo algun alguna algunas alguno algunos ante antes asi aun aunque cada como con contra cual cuales cuando de del desde donde dos el ella ellas ellos en entre era es esa esas ese eso esos esta estaba estan estas este esto estos fue fueron ha habia han hasta hay la las le les lo los mas me mi mucho muy nada ni no nos o otra otro para pero poco por porque que quien quienes se sea segun ser si sin sobre son su sus tambien tan te tiene todo todos tu un una unas uno unos y ya yo dijo dijeron dicho hablo hablaron hablaba ponencia ponencias charla charlas sesion sesiones evento eventos conferencia conferencias ponente ponentes cuenta cuentame dime dame explica explicame resume resumen menti hola gracias falso falsa falsos verdad verdadero cierto cierta ciertos veraz exacto preciso real verifica verificar comprueba comprobar contrasta contrastar chequea fiable confiable dijeron hablaron trataron trato menciono mencionaron tema temas hubo habra hay dia dias hoy ayer manana lunes martes miercoles jueves viernes sabado domingo'.split(
    ' ',
  ),
)

/* Siglas cortas que sí son temas: sin esto "IA" se descartaba por tener dos letras. */
const SIGLAS = new Set(['ia', 'ai', 'ti', 'tic', 'tics', 'vr', 'ra', 'rv', 'ods', 'llm', 'gpt', 'ml', 'iot', 'bim', 'erp'])

/* Variantes de un mismo tema: quien pregunta por "IA" también quiere lo que se dijo de "inteligencia artificial". */
const SINONIMOS: Record<string, readonly string[]> = {
  ia: ['ia', 'inteligencia artificial', 'chatgpt', 'gpt'],
  ai: ['ia', 'inteligencia artificial'],
  llm: ['llm', 'modelos de lenguaje', 'chatgpt'],
  tic: ['tic', 'tecnologias de la informacion'],
  tics: ['tic', 'tecnologias de la informacion'],
  rv: ['realidad virtual', 'rv'],
  vr: ['realidad virtual'],
  ra: ['realidad aumentada'],
}

export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
}

function terminos(texto: string): string[] {
  return normalizar(texto)
    .split(/[^a-z0-9ñ]+/)
    .filter((palabra) => (palabra.length > 2 || SIGLAS.has(palabra)) && !VACIAS.has(palabra))
}

/* Raíz corta para que "éticas" encuentre "ética" y "evaluar" encuentre "evaluación". */
function raiz(palabra: string): string {
  return palabra.length > 6 ? palabra.slice(0, palabra.length - 2) : palabra
}

/* Cada término de la pregunta, con sus variantes. Un grupo cuenta si aparece cualquiera de ellas. */
function gruposDe(palabras: readonly string[]): string[][] {
  const vistos = new Set<string>()
  const grupos: string[][] = []
  for (const palabra of palabras) {
    const variantes = SINONIMOS[palabra] ?? [raiz(palabra)]
    const clave = variantes.join('|')
    if (!vistos.has(clave)) {
      vistos.add(clave)
      grupos.push([...variantes])
    }
  }
  return grupos
}

/* Las siglas cortas se cuentan como palabra entera: "ia" no puede encontrarse dentro de "historia". */
function vecesEn(normal: string, variante: string): number {
  if (variante.length <= 3) {
    return normal.match(new RegExp(`\\b${variante}\\b`, 'g'))?.length ?? 0
  }
  return normal.split(variante).length - 1
}

function vecesDelGrupo(normal: string, grupo: readonly string[]): number {
  return grupo.reduce((suma, variante) => suma + vecesEn(normal, variante), 0)
}

type Ventana = Fragmento & { readonly normal: string }

const indices = new Map<string, readonly Ventana[]>()

async function ventanasDe(ponencia: Ponencia): Promise<readonly Ventana[]> {
  const recordada = indices.get(ponencia.id)
  if (recordada !== undefined) {
    return recordada
  }
  const segmentos = (await leerTranscripcion(ponencia.idDueno, ponencia.id)) ?? []
  const ventanas: Ventana[] = []
  for (let indice = 0; indice < segmentos.length; indice += 2) {
    const tramo = segmentos.slice(indice, indice + 3)
    const texto = tramo.map((segmento) => segmento.texto.trim()).join(' ')
    const primero = tramo[0]
    if (primero !== undefined && texto.length > 40) {
      ventanas.push({
        idConferencia: ponencia.id,
        idDueno: ponencia.idDueno,
        ponencia: ponencia.titulo,
        ponente: ponencia.ponente,
        segundo: primero.inicio,
        texto,
        normal: normalizar(texto),
      })
    }
  }
  indices.set(ponencia.id, ventanas)
  return ventanas
}

/* Carga todas las transcripciones del evento una vez; las siguientes preguntas ya no esperan. */
export async function prepararIndice(datos: DatosDelEvento): Promise<number> {
  const conGrabacion = datos.ponencias.filter((ponencia) => ponencia.tieneTranscripcion)
  await Promise.all(conGrabacion.map(ventanasDe))
  return conGrabacion.length
}

type Puntuada = { ventana: Ventana; distintos: number; puntos: number }

async function puntuar(datos: DatosDelEvento, grupos: readonly string[][], idsPonencias: readonly string[] | null): Promise<Puntuada[]> {
  if (grupos.length === 0) {
    return []
  }
  const ponencias = datos.ponencias.filter(
    (ponencia) => ponencia.tieneTranscripcion && (idsPonencias === null || idsPonencias.includes(ponencia.id)),
  )
  const todas = (await Promise.all(ponencias.map(ventanasDe))).flat()

  /* Cuántas ventanas tienen cada término: los que salen en todas partes pesan menos. */
  const frecuencia = grupos.map((grupo) => todas.filter((ventana) => vecesDelGrupo(ventana.normal, grupo) > 0).length)
  return (
    todas
      .map((ventana) => {
        let puntos = 0
        let distintos = 0
        grupos.forEach((grupo, posicion) => {
          const veces = vecesDelGrupo(ventana.normal, grupo)
          if (veces > 0) {
            distintos += 1
            puntos += Math.min(veces, 3) * Math.log(1 + todas.length / (1 + (frecuencia[posicion] ?? 0)))
          }
        })
        return { ventana, distintos, puntos: puntos * (1 + distintos * 0.6) }
      })
      /*
        Con varios términos, un fragmento tiene que tener al menos dos: uno solo
        suelto ("haces", "bien") aparece en cualquier charla y no responde nada.
        Si ninguno llega, mejor decir que no se encontró que enseñar ruido.
      */
      .filter((resultado) => resultado.puntos > 0 && resultado.distintos >= Math.min(2, grupos.length))
      .sort((uno, otro) => otro.puntos - uno.puntos)
  )
}

/* No más de dos fragmentos por ponencia, ni dos casi seguidos: una respuesta que repite la misma charla dice poco. */
function elegir(puntuadas: readonly Puntuada[], cuantos: number, porPonencia = 2): Fragmento[] {
  const elegidos: Ventana[] = []
  for (const { ventana } of puntuadas) {
    const deLaMisma = elegidos.filter((elegido) => elegido.idConferencia === ventana.idConferencia)
    if (deLaMisma.length >= porPonencia || deLaMisma.some((elegido) => Math.abs(elegido.segundo - ventana.segundo) < 60)) {
      continue
    }
    elegidos.push(ventana)
    if (elegidos.length >= cuantos) {
      break
    }
  }
  return elegidos.map(({ normal: _normal, ...fragmento }) => fragmento)
}

async function buscar(datos: DatosDelEvento, grupos: readonly string[][], idsPonencias: readonly string[] | null, cuantos: number): Promise<Fragmento[]> {
  return elegir(await puntuar(datos, grupos, idsPonencias), cuantos)
}

const DIAS: Record<string, number> = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 }

function ponentesNombrados(datos: DatosDelEvento, pregunta: string): string[] {
  const normal = normalizar(pregunta)
  const nombres = [...new Set([...datos.ponentes.map((ponente) => ponente.nombre), ...datos.ponencias.map((ponencia) => ponencia.ponente)])]
  return nombres.filter((nombre) =>
    normalizar(nombre)
      .split(' ')
      .filter((parte) => parte.length > 3)
      .some((parte) => new RegExp(`\\b${parte}\\b`).test(normal)),
  )
}

function lista(nombres: readonly string[]): string {
  return nombres.length <= 1 ? (nombres[0] ?? '') : `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1) ?? ''}`
}

/*
  Lo que Menti recuerda de la conversación. Vive lo que vive la
  conversación: "Nueva" o recargar la página lo borra (`olvidarConversacion`).
*/
let nombreDeLaPersona: string | null = null
let contexto: { ponencias: readonly string[]; tema: readonly string[]; textoDelTema: string } | null = null
let preguntasHechas: string[] = []

export function olvidarConversacion(): void {
  nombreDeLaPersona = null
  contexto = null
  preguntasHechas = []
}

function recordar(ponencias: readonly string[], tema: readonly string[], textoDelTema: string): void {
  if (ponencias.length > 0) {
    contexto = { ponencias: [...new Set(ponencias)], tema, textoDelTema }
  }
}

function saludo(): string {
  return nombreDeLaPersona === null ? '¡Hola!' : `¡Hola, ${nombreDeLaPersona}!`
}

const CAPACIDADES =
  'Puedo decirte qué ponencias tocaron un tema, quién habló de algo, qué dijo alguien, de qué trató una ponencia o qué sesiones hubo un día. Recuerdo de qué venimos hablando, así que puedes seguir con "¿y de esos…?". Si me preguntas si algo es cierto, separo los datos de las opiniones y te doy cómo contrastarlos.'

const CONVERSACION: readonly { patron: RegExp; responder: (datos: DatosDelEvento) => string }[] = [
  {
    patron: /\b(como estas|como vas|que tal estas|como te va)\b/,
    responder: (datos) => `Muy bien, gracias${nombreDeLaPersona === null ? '' : `, ${nombreDeLaPersona}`}. ¿Qué quieres saber de ${datos.evento.nombre}?`,
  },
  {
    patron: /\b(como me llamo|sabes mi nombre|recuerdas mi nombre)\b/,
    responder: () =>
      nombreDeLaPersona === null ? 'Todavía no me lo has dicho. ¿Cómo te llamas?' : `Te llamas ${nombreDeLaPersona}. ¿Seguimos con el evento?`,
  },
  {
    patron: /\b(que haces|quien eres|que eres|que puedes|que sabes|para que sirves|como funcionas|en que (me )?ayudas|ayuda|que te puedo preguntar)\b/,
    responder: (datos) => `Soy Menti, y conozco las ponencias de ${datos.evento.nombre}. ${CAPACIDADES}`,
  },
  {
    patron: /\b(internet|en linea|google|la web|buscar afuera|fuentes externas)\b/,
    responder: () =>
      'Por ahora solo leo lo que se dijo en el evento: no tengo conexión a internet. Cuando me pidas comprobar algo, te dejo una búsqueda académica lista para cada afirmación, para que la contrastes tú.',
  },
  {
    patron: /^(hola|buenas|buenos dias|buenas tardes|buenas noches|hey|que tal|saludos)\b/,
    responder: (datos) => `${saludo()} Pregúntame lo que quieras sobre ${datos.evento.nombre}: un tema, un ponente o una sesión.`,
  },
  {
    patron: /^(gracias|muchas gracias|genial|perfecto|excelente|vale|ok|listo|super)\b/,
    responder: () => 'Con gusto. Si quieres, sigue preguntando: un tema, un ponente o un día del evento.',
  },
  { patron: /^(adios|chao|hasta luego|nos vemos)\b/, responder: () => 'Hasta luego. La conversación queda aquí mientras no abras una nueva.' },
]

/* Qué clase de afirmación es un fragmento. Es una lectura del texto, no un veredicto: por eso se dice "parece". */
function clasificar(normal: string): 'dato' | 'opinion' | 'afirmacion' {
  if (/\d|por ciento|millones|\bmil\b|estudio|encuesta|informe|investigacion|estadistic|segun|cifras?\b/.test(normal)) {
    return 'dato'
  }
  if (/\b(creo|pienso|considero|me parece|para mi|opino|deberiamos|hay que|tenemos que|yo diria)\b/.test(normal)) {
    return 'opinion'
  }
  return 'afirmacion'
}

/* Una búsqueda en Google Académico con las palabras con más carga del fragmento. */
function busquedaAcademica(texto: string, tema: string): string {
  const clave = terminos(texto)
    .filter((palabra) => palabra.length > 4)
    .slice(0, 6)
    .join(' ')
  return `https://scholar.google.com/scholar?hl=es&q=${encodeURIComponent(`${tema} ${clave}`.trim())}`
}

export async function responder(datos: DatosDelEvento, pregunta: string): Promise<Respuesta> {
  const normal = normalizar(pregunta).replace(/[¿?¡!.,]/g, '').trim()
  const anteriores = preguntasHechas
  preguntasHechas = [...preguntasHechas, pregunta]

  /*
    Presentarse ("hola, soy Sebastián", "me llamo Ana"): se recuerda el
    nombre y se contesta como persona, no como buscador. Solo cuenta si
    después del nombre no viene una pregunta sobre el evento.
  */
  const presentacion = /\b(me llamo|mi nombre es|soy)\s+([a-zñ]+)(\s+[a-zñ]+)?\s*$/.exec(normal)
  if (presentacion !== null && ponentesNombrados(datos, pregunta).length === 0) {
    const crudo = pregunta.replace(/[¿?¡!.,]/g, '').trim().split(/\s+/)
    const posicion = normal.split(/\s+/).indexOf(presentacion[2] ?? '')
    const nombre = posicion >= 0 ? (crudo[posicion] ?? presentacion[2] ?? '') : (presentacion[2] ?? '')
    nombreDeLaPersona = nombre.charAt(0).toUpperCase() + nombre.slice(1)
    return {
      texto: `¡Mucho gusto, ${nombreDeLaPersona}! Soy Menti. Conozco las ponencias de ${datos.evento.nombre}: pregúntame qué ponencias tocaron un tema, quién habló de algo o qué sesiones hubo un día.`,
      fragmentos: [],
      sesiones: [],
    }
  }

  /* Lo que ya se habló en esta conversación. */
  if (/\b(que te (pregunte|dije|he preguntado)|de que (hablamos|estabamos hablando|veniamos hablando)|que hemos hablado|lo que hablamos)\b/.test(normal)) {
    if (anteriores.length === 0) {
      return { texto: 'Acabamos de empezar: esta es tu primera pregunta.', fragmentos: [], sesiones: [] }
    }
    return {
      texto: `Esto es lo que me has preguntado${contexto === null ? '' : `; lo último fue sobre «${contexto.textoDelTema}»`}:`,
      puntos: anteriores.slice(-6),
      fragmentos: [],
      sesiones: [],
    }
  }

  const charla = CONVERSACION.find((intencion) => intencion.patron.test(normal))
  if (charla !== undefined) {
    return { texto: charla.responder(datos), fragmentos: [], sesiones: [] }
  }

  const nombrados = ponentesNombrados(datos, pregunta)
  const diaPedido = Object.entries(DIAS).find(([nombre]) => normal.includes(nombre))
  const partesDeNombres = new Set(nombrados.flatMap((nombre) => normalizar(nombre).split(' ')))
  const tema = terminos(pregunta).filter((palabra) => !partesDeNombres.has(palabra))

  /*
    Seguir el hilo: "de esos", "lo que dijeron", "y ellos…" se refieren a las
    ponencias de la respuesta anterior. Si la pregunta nueva no trae tema, se
    sigue con el de antes.
  */
  const refiere =
    contexto !== null && /\b(esos|esas|estos|estas|ellos|ellas|eso|esto|lo anterior|lo que dijeron|lo que se dijo|dicho)\b/.test(normal)
  const alcance: readonly string[] | null =
    nombrados.length > 0
      ? datos.ponencias.filter((ponencia) => nombrados.some((nombre) => mismoPonente(ponencia.ponente, nombre))).map((ponencia) => ponencia.id)
      : refiere && contexto !== null
        ? contexto.ponencias
        : null
  const temaEfectivo = tema.length > 0 ? tema : refiere && contexto !== null ? contexto.tema : []
  const textoDelTema = tema.length > 0 ? tema.join(' ') : (contexto?.textoDelTema ?? '')
  const grupos = gruposDe(temaEfectivo)

  /*
    ¿Es cierto lo que dijeron? Sin conexión a internet no hay veredicto
    honesto posible, y un "es verdad" inventado sería lo peor que podría
    decir. Lo que sí puede hacer: separar los datos (que se contrastan) de
    las opiniones (que se discuten) y dejar la búsqueda lista para cada uno.
  */
  if (/\b(falso|falsa|falsos|verdad|verdadero|cierto|cierta|ciertos|veraz|exacto|preciso|verifica|verificar|comprueba|comprobar|contrasta|contrastar|chequea|fiable|confiable|riguroso)\b/.test(normal)) {
    if (grupos.length === 0 && alcance === null) {
      return {
        texto: '¿Qué quieres que compruebe? Pregúntame primero por un tema —por ejemplo, "¿qué ponencias hablaron de IA?"— y luego "¿qué tan cierto es lo que dijeron?".',
        fragmentos: [],
        sesiones: [],
      }
    }
    const puntuadas = grupos.length > 0 ? await puntuar(datos, grupos, alcance) : []
    let fragmentos = elegir(puntuadas, 6)
    if (fragmentos.length === 0 && alcance !== null) {
      /* Sin tema, lo más sustancioso de esas ponencias: los tramos con datos. */
      const todas = (await Promise.all(datos.ponencias.filter((ponencia) => alcance.includes(ponencia.id)).map(ventanasDe))).flat()
      fragmentos = elegir(
        todas.filter((ventana) => clasificar(ventana.normal) === 'dato').map((ventana) => ({ ventana, distintos: 1, puntos: 1 })),
        6,
      )
    }
    if (fragmentos.length === 0) {
      return { texto: 'No encontré afirmaciones concretas sobre eso en las transcripciones.', fragmentos: [], sesiones: [] }
    }
    const conEtiqueta = fragmentos
      .map((fragmento) => ({
        ...fragmento,
        etiqueta: clasificar(normalizar(fragmento.texto)),
        contrastar: busquedaAcademica(fragmento.texto, textoDelTema),
      }))
      .sort((uno, otro) => ['dato', 'afirmacion', 'opinion'].indexOf(uno.etiqueta) - ['dato', 'afirmacion', 'opinion'].indexOf(otro.etiqueta))
    const cuenta = (etiqueta: string): number => conEtiqueta.filter((fragmento) => fragmento.etiqueta === etiqueta).length
    recordar(
      conEtiqueta.map((fragmento) => fragmento.idConferencia),
      temaEfectivo,
      textoDelTema,
    )
    return {
      texto:
        'No puedo darte un veredicto: no tengo conexión a internet y no voy a decirte que algo es verdad o mentira sin poder sostenerlo. Lo que sí hice fue separar qué tipo de afirmación es cada una:',
      puntos: [
        `${cuenta('dato')} con datos o cifras: son las que vale la pena contrastar con una fuente.`,
        `${cuenta('afirmacion')} afirmaciones generales: razonables o no según el contexto.`,
        `${cuenta('opinion')} opiniones: no son verdaderas ni falsas; se discuten.`,
        'Cada fragmento trae "Contrastar", con una búsqueda académica lista.',
      ],
      fragmentos: conEtiqueta,
      sesiones: [],
    }
  }

  /*
    Qué ponencias tocaron un tema ("¿cuáles eventos hablaron sobre IA?"): la
    lista de charlas, ordenada por cuánto lo trataron, con un fragmento de
    las que más. Es la pregunta que abre un hilo, así que se recuerda.
  */
  if (
    grupos.length > 0 &&
    /\b(cuales|que|en que|cuantas|cuantos)\s+(eventos?|ponencias?|charlas?|conferencias?|sesiones?)\b|\b(eventos?|ponencias?|charlas?|conferencias?|sesiones?)\s+(que\s+)?(hablaron|trataron|tocaron|mencionaron|hablan|tratan)\b/.test(normal)
  ) {
    const puntuadas = await puntuar(datos, grupos, alcance)
    const porPonencia = new Map<string, { puntos: number; veces: number }>()
    for (const { ventana, puntos } of puntuadas) {
      const actual = porPonencia.get(ventana.idConferencia) ?? { puntos: 0, veces: 0 }
      porPonencia.set(ventana.idConferencia, { puntos: actual.puntos + puntos, veces: actual.veces + 1 })
    }
    const ordenadas = datos.ponencias
      .filter((ponencia) => porPonencia.has(ponencia.id))
      .sort((una, otra) => (porPonencia.get(otra.id)?.puntos ?? 0) - (porPonencia.get(una.id)?.puntos ?? 0))
    if (ordenadas.length === 0) {
      return { texto: `Ninguna ponencia transcrita habló de «${textoDelTema}».`, fragmentos: [], sesiones: [] }
    }
    recordar(
      ordenadas.map((ponencia) => ponencia.id),
      temaEfectivo,
      textoDelTema,
    )
    return {
      texto: `${ordenadas.length === 1 ? 'Una ponencia habló' : `${ordenadas.length} ponencias hablaron`} de «${textoDelTema}». De la que más lo trató a la que menos, con lo más claro que dijeron:`,
      sesiones: ordenadas.map((ponencia) => {
        const veces = porPonencia.get(ponencia.id)?.veces ?? 0
        return { id: ponencia.id, titulo: ponencia.titulo, detalle: `${ponencia.ponente} · ${veces} ${veces === 1 ? 'mención' : 'menciones'}` }
      }),
      fragmentos: elegir(puntuadas, 3, 1),
    }
  }

  /* La agenda: qué hubo, cuándo, a qué hora. */
  if (/(agenda|programa|cronograma|que sesiones|cuales sesiones|a que hora|cuando (fue|es|era|hablo|dio))/.test(normal)) {
    const sesiones = datos.ponencias
      .filter((ponencia) => ponencia.horaInicio !== null)
      .filter((ponencia) => diaPedido === undefined || new Date(`${ponencia.fecha}T12:00:00`).getDay() === diaPedido[1])
      .filter((ponencia) => nombrados.length === 0 || nombrados.some((nombre) => mismoPonente(ponencia.ponente, nombre)))
    if (sesiones.length === 0) {
      return { texto: 'No encuentro sesiones con esos datos en la agenda.', fragmentos: [], sesiones: [] }
    }
    recordar(
      sesiones.map((sesion) => sesion.id),
      [],
      diaPedido?.[0] ?? 'la agenda',
    )
    return {
      texto:
        sesiones.length === 1
          ? `Fue el ${fecha(sesiones[0]?.fecha ?? '')}, de ${sesiones[0]?.horaInicio} a ${sesiones[0]?.horaFin}.`
          : `En la agenda hay ${sesiones.length} sesiones${diaPedido === undefined ? '' : ` el ${diaPedido[0]}`}:`,
      fragmentos: [],
      sesiones: sesiones.map((sesion) => ({
        id: sesion.id,
        titulo: sesion.titulo,
        detalle: `${fecha(sesion.fecha)} · ${sesion.horaInicio} · ${sesion.ponente}`,
      })),
    }
  }

  /* De qué trató una ponencia: su memoria lo dice mejor que cualquier fragmento suelto. */
  /* Si además del ponente se nombra un tema ("¿qué dijo Rafael sobre la equidad?"), se busca ese tema en su charla. */
  const pideTema = /\b(sobre|acerca|respecto)\b/.test(normal) && tema.length > 0
  if (/(resum|de que (trato|hablo|va)|sobre que (trato|hablo)|que dijo|conclusion)/.test(normal) && nombrados.length > 0 && !pideTema) {
    const ponencia = datos.ponencias.find((una) => nombrados.some((nombre) => mismoPonente(una.ponente, nombre)))
    const memoria = datos.memorias.find((una) => una.idConferencia === ponencia?.id && una.resumen !== '')
    if (ponencia !== undefined && memoria !== undefined) {
      recordar([ponencia.id], [], ponencia.titulo)
      return {
        texto: memoria.resumen,
        puntos: memoria.conclusiones,
        fragmentos: [],
        sesiones: [{ id: ponencia.id, titulo: ponencia.titulo, detalle: `${ponencia.ponente} · ${fecha(ponencia.fecha)}` }],
      }
    }
  }

  /* Quién habló de algo: los ponentes con más fragmentos sobre el tema. */
  if (/^(quien|quienes)\b|\bquien(es)? (hablo|hablaron|menciono|trato)/.test(normal) && grupos.length > 0) {
    /*
      Primero quienes lo tratan en su memoria —es el tema de su charla, no una
      mención al paso— y después quienes solo lo nombran en la transcripción.
    */
    const porMemoria = datos.ponencias
      .filter((ponencia) =>
        datos.memorias.some(
          (memoria) => memoria.idConferencia === ponencia.id && grupos.some((grupo) => vecesDelGrupo(normalizar(memoria.resumen), grupo) > 0),
        ),
      )
      .map((ponencia) => ponencia.id)
    const sueltos = await buscar(datos, grupos, alcance, 10)
    const deLaMemoria = porMemoria.length === 0 ? [] : await buscar(datos, grupos, porMemoria, 4)
    const fragmentos = [...deLaMemoria, ...sueltos.filter((fragmento) => !deLaMemoria.some((otro) => otro.idConferencia === fragmento.idConferencia))]
    const quienes = [
      ...new Set([
        ...datos.ponencias.filter((ponencia) => porMemoria.includes(ponencia.id)).map((ponencia) => ponencia.ponente),
        ...fragmentos.map((fragmento) => fragmento.ponente),
      ]),
    ]
    if (quienes.length === 0) {
      return { texto: 'Nadie lo trató de forma directa en las ponencias transcritas.', fragmentos: [], sesiones: [] }
    }
    recordar([...porMemoria, ...fragmentos.map((fragmento) => fragmento.idConferencia)], temaEfectivo, textoDelTema)
    return {
      texto: `Lo trataron ${lista(quienes.slice(0, 4))}. Esto es lo que dijeron:`,
      fragmentos: fragmentos.slice(0, 4),
      sesiones: [],
    }
  }

  /* Cualquier otra cosa: buscar en lo que se dijo, en las ponencias de quien se nombró o de las que se venía hablando. */
  if (grupos.length === 0 && alcance === null) {
    return {
      texto: 'No estoy seguro de qué buscar. Pregúntame por un tema ("¿qué ponencias hablaron de IA?"), un ponente o un día del evento.',
      fragmentos: [],
      sesiones: [],
    }
  }
  const fragmentos = grupos.length > 0 ? await buscar(datos, grupos, alcance, 4) : []
  if (fragmentos.length === 0) {
    return {
      texto: 'No encontré eso en las transcripciones. Prueba con otras palabras, o pregúntame por un ponente o un tema.',
      fragmentos: [],
      sesiones: [],
    }
  }
  recordar(
    fragmentos.map((fragmento) => fragmento.idConferencia),
    temaEfectivo,
    textoDelTema,
  )
  const ponencias = [...new Set(fragmentos.map((fragmento) => fragmento.ponencia))]
  return {
    texto:
      nombrados.length > 0
        ? `${lista(nombrados)} lo trató así:`
        : `Lo encontré en ${ponencias.length === 1 ? 'una ponencia' : `${ponencias.length} ponencias`}. Esto fue lo que se dijo:`,
    fragmentos,
    sesiones: [],
  }
}

export function citaCorta(fragmento: Fragmento): string {
  return `${fragmento.ponente} · min. ${minuto(fragmento.segundo)}`
}
