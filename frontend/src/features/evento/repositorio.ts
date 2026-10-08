import { supabase } from '@/shared/supabase/cliente'
import { codigoDeErrorDeSupabase } from '@/shared/supabase/consultas'
import type { ResultadoDeConsulta } from '@/shared/supabase/consultas'
import type {
  DatosDelEvento,
  EstadoDeAprobacion,
  EstadoDeConsentimiento,
  Evento,
  Memoria,
  Ponencia,
  Ponente,
  Produccion,
  Publicacion,
  Segmento,
  UsoDelConsentimiento,
} from './tipos'

/*
  El único sitio de este dominio que toca `supabase.from(...)`.

  El evento se lee entero de una vez —ponentes, ponencias, memorias,
  producciones y publicaciones— porque cada pantalla del shell cruza unos con
  otros: el panel de inicio cuenta consentimientos y aprobaciones, la ficha
  de un ponente enseña sus ponencias, una publicación dice de qué charla sale.
  Seis consultas en paralelo cuestan lo mismo que una y evitan que cada
  pantalla vuelva a pedir lo que la anterior ya tenía.
*/

const BUCKET = 'audio-conferencias'
const VIGENCIA_DE_LA_FIRMA_S = 60 * 60

type Fila = Record<string, unknown>

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor : ''
}

function textoONulo(valor: unknown): string | null {
  return typeof valor === 'string' && valor !== '' ? valor : null
}

function mapearEvento(fila: Fila): Evento {
  return {
    id: texto(fila['id']),
    nombre: texto(fila['nombre']),
    descripcion: texto(fila['descripcion']),
    lugar: texto(fila['lugar']),
    fechaInicio: textoONulo(fila['fecha_inicio']),
    fechaFin: textoONulo(fila['fecha_fin']),
  }
}

function mapearPonente(fila: Fila): Ponente {
  const usos = fila['consentimiento_usos']
  return {
    id: texto(fila['id']),
    nombre: texto(fila['nombre']),
    correo: textoONulo(fila['correo']),
    institucion: texto(fila['institucion']),
    consentimiento: (texto(fila['consentimiento']) || 'sin-enviar') as EstadoDeConsentimiento,
    usos: typeof usos === 'object' && usos !== null ? (usos as Ponente['usos']) : {},
    versionDelConsentimiento: textoONulo(fila['consentimiento_version']),
    enviadoEl: textoONulo(fila['consentimiento_enviado_el']),
    respondidoEl: textoONulo(fila['consentimiento_respondido_el']),
  }
}

function mapearPonencia(fila: Fila): Ponencia {
  return {
    id: texto(fila['id']),
    titulo: texto(fila['titulo']),
    ponente: texto(fila['ponente']),
    fecha: texto(fila['fecha_del_evento']),
    duracionEnSegundos: Number(fila['duracion_en_segundos'] ?? 0),
    agrupacion: texto(fila['agrupacion']),
    orden: Number(fila['orden_en_el_evento'] ?? 0),
    aprobacion: (texto(fila['aprobacion']) || 'sin-enviar') as EstadoDeAprobacion,
    aprobadaEl: textoONulo(fila['aprobacion_respondida_el']),
    comentarioDelPonente: texto(fila['comentario_del_ponente']),
    idDueno: texto(fila['id_dueno']),
  }
}

function mapearMemoria(fila: Fila): Memoria {
  return {
    id: texto(fila['id']),
    nombre: texto(fila['nombre']),
    alcance: (texto(fila['alcance']) || 'ponencia') as Memoria['alcance'],
    idConferencia: textoONulo(fila['id_conferencia']),
    archivoPdf: textoONulo(fila['archivo_pdf']),
    archivoDocx: textoONulo(fila['archivo_docx']),
    generadaEl: texto(fila['generada_el']),
  }
}

function mapearProduccion(fila: Fila): Produccion {
  return {
    id: texto(fila['id']),
    titulo: texto(fila['titulo']),
    tipo: texto(fila['tipo']),
    idea: texto(fila['idea']),
    enfoques: (fila['enfoques'] ?? []) as Produccion['enfoques'],
    esquema: (fila['esquema'] ?? []) as Produccion['esquema'],
    secciones: (fila['secciones'] ?? []) as Produccion['secciones'],
    evidencias: ((fila['evidencias'] ?? []) as Fila[]).map((evidencia) => ({
      clave: texto(evidencia['clave']),
      idConferencia: texto(evidencia['id_conferencia']),
      ponente: texto(evidencia['ponente']),
      segundo: Number(evidencia['segundo'] ?? 0),
      texto: texto(evidencia['texto']),
      verificada: evidencia['verificada'] === true,
    })),
    creadaEl: texto(fila['creada_el']),
  }
}

function mapearPublicacion(fila: Fila): Publicacion {
  return {
    id: texto(fila['id']),
    idConferencia: textoONulo(fila['id_conferencia']),
    red: texto(fila['red']) as Publicacion['red'],
    formato: texto(fila['formato']) as Publicacion['formato'],
    texto: texto(fila['texto']),
    cita: texto(fila['cita']),
    ponente: texto(fila['ponente']),
    programadaPara: textoONulo(fila['programada_para']),
    estado: texto(fila['estado']) as Publicacion['estado'],
  }
}

/*
  El evento que se abre por defecto: el que más ponencias tiene entre las que
  la persona ve. Mientras no haya un selector de eventos, es la elección que
  menos sorprende —el congreso con el que se está trabajando— y no obliga a
  fijar un nombre en el código.
*/
export async function nombreDelEventoPrincipal(): Promise<ResultadoDeConsulta<string | null>> {
  const { data, error } = await supabase.from('conferencias').select('evento').neq('evento', 'Pruebas')
  if (error !== null) {
    return { ok: false, codigo: codigoDeErrorDeSupabase(error) }
  }

  const cuentas = new Map<string, number>()
  for (const fila of data ?? []) {
    const nombre = texto((fila as Fila)['evento'])
    cuentas.set(nombre, (cuentas.get(nombre) ?? 0) + 1)
  }
  const [primero] = [...cuentas.entries()].sort((uno, otro) => otro[1] - uno[1])
  return { ok: true, datos: primero?.[0] ?? null }
}

export async function cargarEvento(nombre: string): Promise<ResultadoDeConsulta<DatosDelEvento | null>> {
  const respuestaEvento = await supabase.from('eventos').select('*').eq('nombre', nombre).limit(1)
  if (respuestaEvento.error !== null) {
    return { ok: false, codigo: codigoDeErrorDeSupabase(respuestaEvento.error) }
  }
  const filaEvento = respuestaEvento.data?.[0] as Fila | undefined
  if (filaEvento === undefined) {
    return { ok: true, datos: null }
  }
  const evento = mapearEvento(filaEvento)

  const [ponentes, ponencias, memorias, producciones, publicaciones] = await Promise.all([
    supabase.from('ponentes').select('*').eq('id_evento', evento.id).order('nombre'),
    supabase.from('conferencias').select('*').eq('evento', nombre).order('orden_en_el_evento'),
    supabase.from('memorias').select('*').eq('evento', nombre).order('generada_el'),
    supabase.from('producciones').select('*').eq('evento', nombre).order('creada_el', { ascending: false }),
    supabase.from('publicaciones').select('*').eq('evento', nombre).order('programada_para'),
  ])

  for (const respuesta of [ponentes, ponencias, memorias, producciones, publicaciones]) {
    if (respuesta.error !== null) {
      return { ok: false, codigo: codigoDeErrorDeSupabase(respuesta.error) }
    }
  }

  return {
    ok: true,
    datos: {
      evento,
      ponentes: (ponentes.data ?? []).map((fila) => mapearPonente(fila as Fila)),
      ponencias: (ponencias.data ?? []).map((fila) => mapearPonencia(fila as Fila)),
      memorias: (memorias.data ?? []).map((fila) => mapearMemoria(fila as Fila)),
      producciones: (producciones.data ?? []).map((fila) => mapearProduccion(fila as Fila)),
      publicaciones: (publicaciones.data ?? []).map((fila) => mapearPublicacion(fila as Fila)),
    },
  }
}

/* Dirección firmada de un archivo del evento (memoria en PDF, documento, audio). */
export async function direccionDeArchivo(ruta: string): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(ruta, VIGENCIA_DE_LA_FIRMA_S)
  return data?.signedUrl ?? null
}

const transcripciones = new Map<string, readonly Segmento[]>()

/*
  La transcripción guardada de una ponencia, con sus minutos. Se recuerda
  entre aperturas: son cientos de kilobytes que no cambian, y volver a la
  misma ponencia no debería volver a descargarlos.
*/
export async function leerTranscripcion(idDueno: string, idConferencia: string): Promise<readonly Segmento[] | null> {
  const recordada = transcripciones.get(idConferencia)
  if (recordada !== undefined) {
    return recordada
  }

  const { data } = await supabase.storage
    .from(BUCKET)
    .download(`${idDueno}/${idConferencia}/transcripcion-guardada.json`)
  if (data === null) {
    return null
  }

  try {
    const crudos = JSON.parse(await data.text()) as { inicio: number; fin: number; texto: string }[]
    const segmentos = crudos.map(({ inicio, fin, texto: dicho }) => ({ inicio, fin, texto: dicho }))
    transcripciones.set(idConferencia, segmentos)
    return segmentos
  } catch {
    return null
  }
}

/*
  Registrar que se envió la invitación a consentir. El correo de verdad lo
  mandará el backend; mientras tanto la invitación queda registrada con su
  fecha, que es lo que el tablero necesita para saber a quién le falta.
*/
export async function registrarInvitacion(
  idPonente: string,
  correo: string,
  usos: readonly UsoDelConsentimiento[],
): Promise<ResultadoDeConsulta<null>> {
  const { error } = await supabase
    .from('ponentes')
    .update({
      correo,
      consentimiento: 'enviado',
      consentimiento_version: 'reducate-2026-v1',
      consentimiento_enviado_el: new Date().toISOString(),
      consentimiento_usos: Object.fromEntries(usos.map((uso) => [uso, false])),
    })
    .eq('id', idPonente)

  return error === null ? { ok: true, datos: null } : { ok: false, codigo: codigoDeErrorDeSupabase(error) }
}

/* Un ponente que no estaba en el directorio del evento entra ya invitado. */
export async function crearPonenteInvitado(
  idEvento: string,
  nombre: string,
  correo: string,
  usos: readonly UsoDelConsentimiento[],
): Promise<ResultadoDeConsulta<null>> {
  const { error } = await supabase.from('ponentes').insert({
    id_evento: idEvento,
    nombre,
    correo,
    consentimiento: 'enviado',
    consentimiento_version: 'reducate-2026-v1',
    consentimiento_enviado_el: new Date().toISOString(),
    consentimiento_usos: Object.fromEntries(usos.map((uso) => [uso, false])),
  })

  return error === null ? { ok: true, datos: null } : { ok: false, codigo: codigoDeErrorDeSupabase(error) }
}

export async function pedirAprobacion(idConferencia: string): Promise<ResultadoDeConsulta<null>> {
  const { error } = await supabase.from('conferencias').update({ aprobacion: 'enviada' }).eq('id', idConferencia)
  return error === null ? { ok: true, datos: null } : { ok: false, codigo: codigoDeErrorDeSupabase(error) }
}
