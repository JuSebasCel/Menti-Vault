import { hayBackend, pedirAlBackend } from '@/shared/api/backend'
import { mensajeDeError } from '@/shared/errors'
import { fecha, minuto } from '../formato'
import type { DatosDelEvento } from '../tipos'
import type { Mensaje } from './conversacion'
import { buscarParaElAgente } from './motor'
import type { Fragmento, Respuesta } from './motor'

/*
  Menti con un modelo delante: conversa de lo que sea y busca en las
  ponencias solo cuando la pregunta lo necesita.

  El modelo vive en el backend (`/menti/turno`), que tiene la clave; la
  búsqueda vive aquí, donde ya están las transcripciones. Cuando el modelo
  pide `buscar_en_ponencias`, se busca con el motor de siempre y se le
  devuelven los fragmentos numerados (F1, F2…); él los cita con esas marcas,
  y la interfaz enseña debajo justo los que citó, para escucharlos.

  Si el backend no está o falla, devuelve el motivo y el chat responde con
  el motor sin modelo, diciendo por qué: Menti responde peor, pero no se
  queda callado ni esconde que algo falló.
*/

type MensajeDelModelo = {
  role: 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[]
  tool_call_id?: string
}

type TurnoDelModelo = {
  contenido: string
  llamadas: { id: string; nombre: string; argumentos: Record<string, unknown> }[]
}

/* Como mucho tres búsquedas por pregunta: si en tres no encontró, una cuarta no lo va a arreglar. */
const RONDAS = 4

/* Lo que el modelo sabe del evento sin buscar: la agenda y el resumen de cada ponencia. */
function contextoDelEvento(datos: DatosDelEvento): string {
  return datos.ponencias
    .map((ponencia) => {
      const memoria = datos.memorias.find((una) => una.idConferencia === ponencia.id && una.resumen !== '')
      const cuando = `${fecha(ponencia.fecha)}${ponencia.horaInicio === null ? '' : `, ${ponencia.horaInicio}–${ponencia.horaFin ?? ''}`}`
      const resumen = memoria === undefined ? '' : `\n  Resumen: ${memoria.resumen.slice(0, 500)}`
      return `- «${ponencia.titulo}» — ${ponencia.ponente} · ${cuando}${ponencia.eje === '' ? '' : ` · eje ${ponencia.eje}`}${ponencia.tieneTranscripcion ? '' : ' · sin grabación todavía'}${resumen}`
    })
    .join('\n')
}

function historialParaElModelo(historial: readonly Mensaje[]): MensajeDelModelo[] {
  return historial.flatMap((mensaje): MensajeDelModelo[] => {
    if (mensaje.rol === 'persona') {
      return [{ role: 'user', content: mensaje.texto }]
    }
    return mensaje.estado === 'listo' ? [{ role: 'assistant', content: mensaje.respuesta.texto }] : []
  })
}

export async function responderConAgente(
  datos: DatosDelEvento,
  historial: readonly Mensaje[],
  pregunta: string,
): Promise<Respuesta | { fallo: string }> {
  if (!hayBackend()) {
    return { fallo: 'No hay un servidor configurado para el modelo de IA.' }
  }
  const mensajes: MensajeDelModelo[] = [...historialParaElModelo(historial), { role: 'user', content: pregunta }]
  const encontrados = new Map<string, Fragmento>()
  const contexto = contextoDelEvento(datos)

  for (let ronda = 0; ronda < RONDAS; ronda += 1) {
    const resultado = await pedirAlBackend<TurnoDelModelo>('/menti/turno', {
      evento: datos.evento.nombre,
      contexto_del_evento: contexto,
      mensajes,
    })
    if (!resultado.ok) {
      return { fallo: mensajeDeError(resultado.codigo) }
    }
    const { contenido, llamadas } = resultado.datos
    if (llamadas.length === 0 || ronda === RONDAS - 1) {
      return armarRespuesta(contenido, encontrados)
    }

    mensajes.push({
      role: 'assistant',
      content: contenido,
      tool_calls: llamadas.map((llamada) => ({
        id: llamada.id,
        type: 'function',
        function: { name: llamada.nombre, arguments: JSON.stringify(llamada.argumentos) },
      })),
    })
    for (const llamada of llamadas) {
      const consulta = typeof llamada.argumentos['consulta'] === 'string' ? llamada.argumentos['consulta'] : ''
      const ponente = typeof llamada.argumentos['ponente'] === 'string' ? llamada.argumentos['ponente'] : ''
      const fragmentos = llamada.nombre === 'buscar_en_ponencias' ? await buscarParaElAgente(datos, consulta, ponente) : []
      const numerados = fragmentos.map((fragmento) => {
        const id = `F${encontrados.size + 1}`
        encontrados.set(id, fragmento)
        return { id, ponente: fragmento.ponente, ponencia: fragmento.ponencia, minuto: minuto(fragmento.segundo), texto: fragmento.texto }
      })
      mensajes.push({
        role: 'tool',
        tool_call_id: llamada.id,
        content: numerados.length === 0 ? 'Sin resultados para esa consulta.' : JSON.stringify(numerados),
      })
    }
  }
  return { fallo: 'El modelo no terminó de responder.' }
}

/* Debajo van los fragmentos que el modelo citó, en el orden en que los citó; las marcas salen del texto. */
function armarRespuesta(contenido: string, encontrados: ReadonlyMap<string, Fragmento>): Respuesta {
  const citados = [...new Set([...contenido.matchAll(/\[(F\d+)\]/g)].map((coincidencia) => coincidencia[1] ?? ''))]
    .map((id) => encontrados.get(id))
    .filter((fragmento): fragmento is Fragmento => fragmento !== undefined)
  const texto = contenido.replace(/\s*\[F\d+\](\s*,?\s*\[F\d+\])*/g, '').trim()
  return {
    texto: texto === '' ? 'No encontré nada sobre eso en las ponencias.' : texto,
    fragmentos: citados,
    sesiones: [],
  }
}
