import { fecha, minuto, mismoPonente } from '../formato'
import { leerTranscripcion } from '../repositorio'
import type { DatosDelEvento, Ponencia } from '../tipos'

/*
  El motor de Menti: responde preguntas sobre el evento con lo que el evento
  tiene, sin inventar. Primero reconoce qué tipo de pregunta es —la agenda,
  quién habló de algo, de qué trató una ponencia— y, si no es ninguna,
  busca en las transcripciones.

  La búsqueda puntúa ventanas de tres segmentos (unos quince segundos de
  habla) por los términos de la pregunta, con más peso para los términos
  raros en el evento y para los que aparecen juntos. Los resultados se
  devuelven con su ponente, su ponencia y su minuto, para escucharlos: una
  respuesta del chat se comprueba igual que una cita de un artículo.
*/

export type Fragmento = {
  readonly idConferencia: string
  readonly idDueno: string
  readonly ponencia: string
  readonly ponente: string
  readonly segundo: number
  readonly texto: string
}

export type Respuesta = {
  readonly texto: string
  readonly fragmentos: readonly Fragmento[]
  /** Sesiones a las que la respuesta remite, para abrirlas. */
  readonly sesiones: readonly { readonly id: string; readonly titulo: string; readonly detalle: string }[]
  readonly puntos?: readonly string[]
}

const VACIAS = new Set(
  'a al algo algun alguna algunas alguno algunos ante antes asi aun aunque cada como con contra cual cuales cuando de del desde donde dos el ella ellas ellos en entre era es esa esas ese eso esos esta estaba estan estas este esto estos fue fueron ha habia han hasta hay la las le les lo los mas me mi mucho muy nada ni no nos o otra otro para pero poco por porque que quien quienes se sea segun ser si sin sobre son su sus tambien tan te tiene todo todos tu un una unas uno unos y ya yo dijo dijeron hablo hablaron hablaba ponencia ponencias charla charlas sesion sesiones evento ponente ponentes cuenta dime dame explica explicame resume resumen menti hola gracias'.split(
    ' ',
  ),
)

export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
}

function terminos(texto: string): string[] {
  return normalizar(texto)
    .split(/[^a-z0-9ñ]+/)
    .filter((palabra) => palabra.length > 2 && !VACIAS.has(palabra))
}

/* Raíz corta para que "éticas" encuentre "ética" y "evaluar" encuentre "evaluación". */
function raiz(palabra: string): string {
  return palabra.length > 6 ? palabra.slice(0, palabra.length - 2) : palabra
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

async function buscar(datos: DatosDelEvento, pregunta: string, ponentesFiltro: readonly string[], cuantos: number): Promise<Fragmento[]> {
  const raices = [...new Set(terminos(pregunta).map(raiz))]
  if (raices.length === 0) {
    return []
  }
  const ponencias = datos.ponencias.filter(
    (ponencia) =>
      ponencia.tieneTranscripcion && (ponentesFiltro.length === 0 || ponentesFiltro.some((nombre) => mismoPonente(ponencia.ponente, nombre))),
  )
  const todas = (await Promise.all(ponencias.map(ventanasDe))).flat()

  /* Cuántas ventanas tienen cada término: los que salen en todas partes pesan menos. */
  const frecuencia = new Map(raices.map((termino) => [termino, todas.filter((ventana) => ventana.normal.includes(termino)).length]))
  const puntuadas = todas
    .map((ventana) => {
      let puntos = 0
      let distintos = 0
      for (const termino of raices) {
        const veces = ventana.normal.split(termino).length - 1
        if (veces > 0) {
          distintos += 1
          puntos += Math.min(veces, 3) * Math.log(1 + todas.length / (1 + (frecuencia.get(termino) ?? 0)))
        }
      }
      return { ventana, distintos, puntos: puntos * (1 + distintos * 0.6) }
    })
    /*
      Con varios términos, un fragmento tiene que tener al menos dos: uno solo
      suelto ("haces", "bien") aparece en cualquier charla y no responde nada.
      Si ninguno llega, mejor decir que no se encontró que enseñar ruido.
    */
    .filter((resultado) => resultado.puntos > 0 && resultado.distintos >= Math.min(2, raices.length))
    .sort((uno, otro) => otro.puntos - uno.puntos)

  /* No más de dos fragmentos por ponencia, ni dos casi seguidos: una respuesta que repite la misma charla dice poco. */
  const elegidos: Ventana[] = []
  for (const { ventana } of puntuadas) {
    const deLaMisma = elegidos.filter((elegido) => elegido.idConferencia === ventana.idConferencia)
    if (deLaMisma.length >= 2 || deLaMisma.some((elegido) => Math.abs(elegido.segundo - ventana.segundo) < 60)) {
      continue
    }
    elegidos.push(ventana)
    if (elegidos.length >= cuantos) {
      break
    }
  }
  return elegidos.map(({ normal: _normal, ...fragmento }) => fragmento)
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
  Las "herramientas" de Menti, en el orden en que se prueban: conversar,
  la agenda, el resumen de una ponencia, quién habló de un tema y, solo si
  la pregunta trata de verdad del contenido, buscar en las transcripciones.
  Sin este primer filtro, un "¿qué haces?" se buscaba como si fuera un tema
  y devolvía fragmentos de ponencias que no venían a cuento.
*/
/* El nombre de quien conversa, si lo dijo. Vive lo que vive la conversación. */
let nombreDeLaPersona: string | null = null

export function olvidarNombre(): void {
  nombreDeLaPersona = null
}

function saludo(): string {
  return nombreDeLaPersona === null ? '¡Hola!' : `¡Hola, ${nombreDeLaPersona}!`
}

const CONVERSACION: readonly { patron: RegExp; responder: (datos: DatosDelEvento) => string }[] = [
  {
    patron: /\b(como estas|como vas|que tal estas|como te va)\b/,
    responder: (datos) => `Muy bien, gracias${nombreDeLaPersona === null ? '' : `, ${nombreDeLaPersona}`}. ¿Qué quieres saber de ${datos.evento.nombre}?`,
  },
  {
    patron: /\b(que haces|quien eres|que eres|que puedes|que sabes|para que sirves|como funcionas|en que (me )?ayudas|ayuda|que te puedo preguntar)\b/,
    responder: (datos) =>
      `Soy Menti, y conozco las ponencias de ${datos.evento.nombre}. Puedo decirte quién habló de un tema, qué dijo alguien sobre algo, de qué trató una ponencia o qué sesiones hubo un día. Cuando cito algo, te digo quién lo dijo y en qué minuto, para que lo escuches.`,
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

export async function responder(datos: DatosDelEvento, pregunta: string): Promise<Respuesta> {
  const normal = normalizar(pregunta).replace(/[¿?¡!.,]/g, '').trim()

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
      texto: `¡Mucho gusto, ${nombreDeLaPersona}! Soy Menti. Conozco las ponencias de ${datos.evento.nombre}: pregúntame quién habló de un tema, qué dijo alguien o qué sesiones hubo un día.`,
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

  /* La agenda: qué hubo, cuándo, a qué hora. */
  if (/(agenda|programa|cronograma|que sesiones|cuales sesiones|a que hora|cuando (fue|es|era|hablo|dio))/.test(normal)) {
    const sesiones = datos.ponencias
      .filter((ponencia) => ponencia.horaInicio !== null)
      .filter((ponencia) => diaPedido === undefined || new Date(`${ponencia.fecha}T12:00:00`).getDay() === diaPedido[1])
      .filter((ponencia) => nombrados.length === 0 || nombrados.some((nombre) => mismoPonente(ponencia.ponente, nombre)))
    if (sesiones.length === 0) {
      return { texto: 'No encuentro sesiones con esos datos en la agenda.', fragmentos: [], sesiones: [] }
    }
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
  const partesDeNombres = new Set(nombrados.flatMap((nombre) => normalizar(nombre).split(' ')))
  const tema = terminos(pregunta).filter((palabra) => !partesDeNombres.has(palabra))
  const pideTema = /\b(sobre|acerca|respecto)\b/.test(normal) && tema.length > 0
  if (/(resum|de que (trato|hablo|va)|sobre que (trato|hablo)|que dijo|conclusion)/.test(normal) && nombrados.length > 0 && !pideTema) {
    const ponencia = datos.ponencias.find((una) => nombrados.some((nombre) => mismoPonente(una.ponente, nombre)))
    const memoria = datos.memorias.find((una) => una.idConferencia === ponencia?.id && una.resumen !== '')
    if (ponencia !== undefined && memoria !== undefined) {
      return {
        texto: memoria.resumen,
        puntos: memoria.conclusiones,
        fragmentos: [],
        sesiones: [{ id: ponencia.id, titulo: ponencia.titulo, detalle: `${ponencia.ponente} · ${fecha(ponencia.fecha)}` }],
      }
    }
  }

  /* Quién habló de algo: los ponentes con más fragmentos sobre el tema. */
  if (/^(quien|quienes)\b|\bquien(es)? (hablo|hablaron|menciono|trato)/.test(normal)) {
    /*
      Primero quienes lo tratan en su memoria —es el tema de su charla, no una
      mención al paso— y después quienes solo lo nombran en la transcripción.
    */
    const raices = terminos(pregunta).map(raiz)
    const porMemoria = datos.ponencias
      .filter((ponencia) =>
        datos.memorias.some(
          (memoria) => memoria.idConferencia === ponencia.id && raices.some((termino) => normalizar(memoria.resumen).includes(termino)),
        ),
      )
      .map((ponencia) => ponencia.ponente)
    const sueltos = await buscar(datos, pregunta, [], 10)
    const deLaMemoria = porMemoria.length === 0 ? [] : await buscar(datos, pregunta, porMemoria, 4)
    const fragmentos = [...deLaMemoria, ...sueltos.filter((fragmento) => !deLaMemoria.some((otro) => otro.idConferencia === fragmento.idConferencia))]
    const quienes = [...new Set([...porMemoria, ...fragmentos.map((fragmento) => fragmento.ponente)])]
    if (quienes.length === 0) {
      return { texto: 'Nadie lo trató de forma directa en las ponencias transcritas.', fragmentos: [], sesiones: [] }
    }
    return {
      texto: `Lo trataron ${lista(quienes.slice(0, 4))}. Esto es lo que dijeron:`,
      fragmentos: fragmentos.slice(0, 4),
      sesiones: [],
    }
  }

  /* Cualquier otra cosa: buscar en lo que se dijo, en la ponencia de quien se nombró si se nombró a alguien. */
  if (tema.length === 0 && nombrados.length === 0) {
    return {
      texto: 'No estoy seguro de qué buscar. Pregúntame por un tema ("¿quién habló de ética?"), un ponente o un día del evento.',
      fragmentos: [],
      sesiones: [],
    }
  }
  const fragmentos = await buscar(datos, nombrados.length > 0 && tema.length > 0 ? tema.join(' ') : pregunta, nombrados, 4)
  if (fragmentos.length === 0) {
    return {
      texto: 'No encontré eso en las transcripciones. Prueba con otras palabras, o pregúntame por un ponente o un tema.',
      fragmentos: [],
      sesiones: [],
    }
  }
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
