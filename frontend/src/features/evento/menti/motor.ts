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
      return { ventana, puntos: puntos * (1 + distintos * 0.6) }
    })
    .filter((resultado) => resultado.puntos > 0)
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

export async function responder(datos: DatosDelEvento, pregunta: string): Promise<Respuesta> {
  const normal = normalizar(pregunta)
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
  if (/(resum|de que (trato|hablo|va)|sobre que (trato|hablo)|que dijo|conclusion)/.test(normal) && nombrados.length > 0) {
    const ponencia = datos.ponencias.find((una) => nombrados.some((nombre) => mismoPonente(una.ponente, nombre)))
    const memoria = datos.memorias.find((una) => una.idConferencia === ponencia?.id && una.resumen !== '')
    if (ponencia !== undefined && memoria !== undefined && !/(dijo sobre|hablo de|hablo sobre)/.test(normal)) {
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
    const fragmentos = await buscar(datos, pregunta, [], 8)
    const quienes = [...new Set(fragmentos.map((fragmento) => fragmento.ponente))]
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
  const fragmentos = await buscar(datos, pregunta, nombrados, 4)
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
