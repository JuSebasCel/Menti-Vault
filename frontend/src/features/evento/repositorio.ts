import { supabase } from '@/shared/supabase/cliente'
import { enDemostracion, esperaDeDemostracion } from './demostracion'
import { analizarEnSegundoPlano } from '@/features/conferencias/carga/segundoPlano'
import { subirArchivoDeConferencia } from '@/features/conferencias/repositorio/repositorio'
import { codigoDeErrorDeSupabase } from '@/shared/supabase/consultas'
import type { ResultadoDeConsulta } from '@/shared/supabase/consultas'
import type {
  DatosDelEvento,
  ResumenDeEvento,
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
    ejes: Array.isArray(fila['ejes']) ? (fila['ejes'] as unknown[]).filter((eje): eje is string => typeof eje === 'string') : [],
    formatoDeMemoria: textoONulo(fila['formato_de_memoria']),
    indicacionesDeMemoria: texto(fila['indicaciones_de_memoria']),
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
    horaInicio: textoONulo(fila['hora_inicio'])?.slice(0, 5) ?? null,
    horaFin: textoONulo(fila['hora_fin'])?.slice(0, 5) ?? null,
    sala: texto(fila['sala']),
    tipo: (texto(fila['tipo_de_sesion']) || 'conferencia') as Ponencia['tipo'],
    eje: texto(fila['eje']),
    tieneTranscripcion: texto(fila['estado']) === 'procesada',
  }
}

function mapearMemoria(fila: Fila): Memoria {
  return {
    id: texto(fila['id']),
    nombre: texto(fila['nombre']),
    alcance: (texto(fila['alcance']) || 'ponencia') as Memoria['alcance'],
    idConferencia: textoONulo(fila['id_conferencia']),
    agrupacion: textoONulo(fila['agrupacion']),
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
    supabase
      .from('conferencias')
      .select('*')
      .eq('evento', nombre)
      .order('fecha_del_evento')
      .order('hora_inicio', { nullsFirst: false }),
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
  if (enDemostracion()) {
    await esperaDeDemostracion()
    return { ok: true, datos: null }
  }
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
  if (enDemostracion()) {
    await esperaDeDemostracion()
    return { ok: true, datos: null }
  }
  const sinCorreo = correo.trim() === ''
  const { error } = await supabase.from('ponentes').insert({
    id_evento: idEvento,
    nombre,
    correo: sinCorreo ? null : correo,
    consentimiento: sinCorreo ? 'sin-enviar' : 'enviado',
    consentimiento_version: 'reducate-2026-v1',
    consentimiento_enviado_el: sinCorreo ? null : new Date().toISOString(),
    consentimiento_usos: Object.fromEntries(usos.map((uso) => [uso, false])),
  })

  return error === null ? { ok: true, datos: null } : { ok: false, codigo: codigoDeErrorDeSupabase(error) }
}

/*
  Editar un ponente. Renombrarlo cambia también el nombre en sus ponencias
  del evento: la ponencia lo guarda como texto, y dejar el viejo la separaría
  de su ficha (y de su autorización) sin aviso.
*/
export async function actualizarPonente(
  ponente: { id: string; nombre: string },
  evento: string,
  cambios: { nombre: string; correo: string; institucion: string },
): Promise<ResultadoDeConsulta<null>> {
  const { error } = await supabase
    .from('ponentes')
    .update({ nombre: cambios.nombre, correo: cambios.correo || null, institucion: cambios.institucion })
    .eq('id', ponente.id)
  if (error !== null) {
    return { ok: false, codigo: codigoDeErrorDeSupabase(error) }
  }
  if (cambios.nombre !== ponente.nombre) {
    const renombrado = await supabase.from('conferencias').update({ ponente: cambios.nombre }).eq('evento', evento).eq('ponente', ponente.nombre)
    if (renombrado.error !== null) {
      return { ok: false, codigo: codigoDeErrorDeSupabase(renombrado.error) }
    }
  }
  return { ok: true, datos: null }
}

/* Quitar a un ponente del evento. Sus ponencias se quedan: son grabaciones del evento, no de su ficha. */
export async function eliminarPonente(idPonente: string): Promise<ResultadoDeConsulta<null>> {
  const { error } = await supabase.from('ponentes').delete().eq('id', idPonente)
  return error === null ? { ok: true, datos: null } : { ok: false, codigo: codigoDeErrorDeSupabase(error) }
}

export async function asignarPonente(idConferencia: string, ponente: string): Promise<ResultadoDeConsulta<null>> {
  if (enDemostracion()) {
    await esperaDeDemostracion()
    return { ok: true, datos: null }
  }
  const { error } = await supabase.from('conferencias').update({ ponente }).eq('id', idConferencia)
  return error === null ? { ok: true, datos: null } : { ok: false, codigo: codigoDeErrorDeSupabase(error) }
}

export async function pedirAprobacion(idConferencia: string): Promise<ResultadoDeConsulta<null>> {
  const { error } = await supabase.from('conferencias').update({ aprobacion: 'enviada' }).eq('id', idConferencia)
  return error === null ? { ok: true, datos: null } : { ok: false, codigo: codigoDeErrorDeSupabase(error) }
}

export type CambiosDeEvento = {
  readonly descripcion: string
  readonly lugar: string
  readonly fechaInicio: string
  readonly fechaFin: string
  readonly ejes: readonly string[]
  readonly indicacionesDeMemoria: string
}

export async function actualizarEvento(idEvento: string, cambios: Partial<CambiosDeEvento>): Promise<ResultadoDeConsulta<null>> {
  const fila: Record<string, unknown> = {}
  if (cambios.descripcion !== undefined) fila['descripcion'] = cambios.descripcion
  if (cambios.lugar !== undefined) fila['lugar'] = cambios.lugar
  if (cambios.fechaInicio !== undefined) fila['fecha_inicio'] = cambios.fechaInicio || null
  if (cambios.fechaFin !== undefined) fila['fecha_fin'] = cambios.fechaFin || null
  if (cambios.ejes !== undefined) fila['ejes'] = cambios.ejes
  if (cambios.indicacionesDeMemoria !== undefined) fila['indicaciones_de_memoria'] = cambios.indicacionesDeMemoria

  const { error } = await supabase.from('eventos').update(fila).eq('id', idEvento)
  return error === null ? { ok: true, datos: null } : { ok: false, codigo: codigoDeErrorDeSupabase(error) }
}

/* Los eventos con su número de ponencias, para el selector del dock. */
export async function listarEventos(): Promise<ResultadoDeConsulta<readonly ResumenDeEvento[]>> {
  const [eventos, conferencias] = await Promise.all([
    supabase.from('eventos').select('id, nombre').order('nombre'),
    supabase.from('conferencias').select('evento'),
  ])
  if (eventos.error !== null) {
    return { ok: false, codigo: codigoDeErrorDeSupabase(eventos.error) }
  }
  const cuentas = new Map<string, number>()
  for (const fila of conferencias.data ?? []) {
    const nombre = texto((fila as Fila)['evento'])
    cuentas.set(nombre, (cuentas.get(nombre) ?? 0) + 1)
  }
  return {
    ok: true,
    datos: (eventos.data ?? [])
      .map((fila) => ({ id: texto((fila as Fila)['id']), nombre: texto((fila as Fila)['nombre']), ponencias: cuentas.get(texto((fila as Fila)['nombre'])) ?? 0 }))
      .filter((evento) => evento.nombre !== 'Pruebas'),
  }
}

/*
  Renombrar o quitar un eje lo cambia también en sus sesiones: el eje vive
  como texto en cada una, y dejarlas con el nombre viejo las sacaría del
  filtro sin que nadie lo notara. Quitarlo es renombrarlo a "sin eje".
*/
export async function cambiarEje(
  evento: Evento,
  anterior: string,
  nuevo: string | null,
): Promise<ResultadoDeConsulta<null>> {
  const ejes = nuevo === null ? evento.ejes.filter((eje) => eje !== anterior) : evento.ejes.map((eje) => (eje === anterior ? nuevo : eje))
  const [enEvento, enSesiones] = await Promise.all([
    supabase.from('eventos').update({ ejes }).eq('id', evento.id),
    supabase.from('conferencias').update({ eje: nuevo ?? '' }).eq('evento', evento.nombre).eq('eje', anterior),
  ])
  const error = enEvento.error ?? enSesiones.error
  return error === null ? { ok: true, datos: null } : { ok: false, codigo: codigoDeErrorDeSupabase(error) }
}

export async function crearEvento(nombre: string): Promise<ResultadoDeConsulta<null>> {
  if (enDemostracion()) {
    await esperaDeDemostracion()
    return { ok: true, datos: null }
  }
  const { error } = await supabase.from('eventos').insert({ nombre })
  return error === null ? { ok: true, datos: null } : { ok: false, codigo: codigoDeErrorDeSupabase(error) }
}

/*
  Reemplazar el formato de las memorias del evento. Se sube con un nombre
  nuevo y no encima del anterior: Storage no sobrescribe, y una memoria ya
  generada sigue apuntando al formato con el que se hizo.
*/
export async function subirFormato(idDueno: string, evento: Evento, archivo: File): Promise<ResultadoDeConsulta<null>> {
  const carpeta = evento.nombre.normalize('NFD').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()
  const ruta = `${idDueno}/eventos/${carpeta}/formato-${Date.now()}.docx`
  const subida = await supabase.storage.from(BUCKET).upload(ruta, archivo, {
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
  if (subida.error !== null) {
    return { ok: false, codigo: 'DATOS_FALLO_INESPERADO' }
  }
  const { error } = await supabase.from('eventos').update({ formato_de_memoria: ruta }).eq('id', evento.id)
  return error === null ? { ok: true, datos: null } : { ok: false, codigo: codigoDeErrorDeSupabase(error) }
}

export type CambiosDeSesion = {
  readonly titulo: string
  readonly ponente: string
  readonly fecha: string
  readonly horaInicio: string
  readonly horaFin: string
  readonly sala: string
  readonly tipo: Ponencia['tipo']
  readonly eje: string
}

function filaDeSesion(cambios: CambiosDeSesion): Record<string, unknown> {
  return {
    titulo: cambios.titulo,
    ponente: cambios.ponente,
    fecha_del_evento: cambios.fecha,
    hora_inicio: cambios.horaInicio || null,
    hora_fin: cambios.horaFin || null,
    sala: cambios.sala,
    tipo_de_sesion: cambios.tipo,
    eje: cambios.eje,
  }
}

export async function actualizarSesion(idConferencia: string, cambios: CambiosDeSesion): Promise<ResultadoDeConsulta<null>> {
  const { error } = await supabase.from('conferencias').update(filaDeSesion(cambios)).eq('id', idConferencia)
  return error === null ? { ok: true, datos: null } : { ok: false, codigo: codigoDeErrorDeSupabase(error) }
}

/*
  Una sesión nueva entra en la agenda antes de tener grabación: queda en
  cola, sin duración, y la ponencia se completa cuando se suba el audio.
*/
export async function crearSesion(
  idDueno: string,
  evento: string,
  cambios: CambiosDeSesion,
): Promise<ResultadoDeConsulta<string>> {
  if (enDemostracion()) {
    await esperaDeDemostracion()
    return { ok: true, datos: `demostracion-${Date.now()}` }
  }
  const { data, error } = await supabase
    .from('conferencias')
    .insert({
      ...filaDeSesion(cambios),
      evento,
      codigo_de_evento: evento.toUpperCase().replace(/[^A-Z0-9]+/g, '-'),
      id_dueno: idDueno,
      estado: 'en-cola',
      fuente: 'audio',
      duracion_en_segundos: 0,
    })
    .select('id')
    .single()
  return error === null ? { ok: true, datos: texto((data as Fila)['id']) } : { ok: false, codigo: codigoDeErrorDeSupabase(error) }
}

/*
  La grabación de una sesión: se sube a su carpeta, la sesión anota de qué
  tipo es y cuánto dura, y se pide la transcripción en segundo plano. La
  sesión ya existía en la agenda, así que si la subida falla no se borra
  nada: queda como estaba, sin grabación.
*/
export async function subirGrabacion(
  idDueno: string,
  idConferencia: string,
  archivo: File,
  fuente: 'audio' | 'transcripcion',
  duracionEnSegundos: number,
): Promise<ResultadoDeConsulta<null>> {
  if (enDemostracion()) {
    await esperaDeDemostracion()
    return { ok: true, datos: null }
  }
  const subida = await subirArchivoDeConferencia(idDueno, idConferencia, archivo)
  if (!subida.ok) {
    return subida
  }
  const { error } = await supabase
    .from('conferencias')
    .update({ fuente, duracion_en_segundos: Math.round(duracionEnSegundos), estado: 'en-cola', cargada_el: new Date().toISOString() })
    .eq('id', idConferencia)
  if (error !== null) {
    return { ok: false, codigo: codigoDeErrorDeSupabase(error) }
  }
  void analizarEnSegundoPlano(idConferencia)
  return { ok: true, datos: null }
}

export type Foto = { readonly ruta: string; readonly nombre: string }

/*
  Fotos del evento y de cada sesión, en su propia carpeta (`fotos/`) y no en
  el material de apoyo: una foto de grupo sirve para agradecer en redes, una
  diapositiva no, y mezclarlas haría que las sugerencias propusieran publicar
  una lámina de PowerPoint.
*/
export function carpetaDeFotosDelEvento(idDueno: string, evento: string): string {
  return `${idDueno}/eventos/${evento.normalize('NFD').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}/fotos`
}

export function carpetaDeFotosDeSesion(idDueno: string, idConferencia: string): string {
  return `${idDueno}/${idConferencia}/fotos`
}

export async function listarFotos(carpeta: string): Promise<readonly Foto[]> {
  const { data } = await supabase.storage.from(BUCKET).list(carpeta, { sortBy: { column: 'created_at', order: 'desc' } })
  return (data ?? [])
    .filter((objeto) => objeto.metadata !== null && /\.(png|jpe?g|webp)$/i.test(objeto.name))
    .map((objeto) => ({ ruta: `${carpeta}/${objeto.name}`, nombre: objeto.name }))
}

export async function subirFoto(carpeta: string, archivo: File): Promise<ResultadoDeConsulta<null>> {
  const extension = archivo.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(`${carpeta}/foto-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${extension}`, archivo, { contentType: archivo.type })
  return error === null ? { ok: true, datos: null } : { ok: false, codigo: 'CARGA_ARCHIVO_RECHAZADO' }
}

export async function eliminarFoto(ruta: string): Promise<ResultadoDeConsulta<null>> {
  const { error } = await supabase.storage.from(BUCKET).remove([ruta])
  return error === null ? { ok: true, datos: null } : { ok: false, codigo: 'DATOS_FALLO_INESPERADO' }
}

export async function crearPublicacion(
  idDueno: string,
  evento: string,
  pieza: { red: Publicacion['red']; formato: Publicacion['formato']; texto: string; cita: string; ponente: string; idConferencia: string | null },
): Promise<ResultadoDeConsulta<null>> {
  if (enDemostracion()) {
    await esperaDeDemostracion()
    return { ok: true, datos: null }
  }
  const { error } = await supabase.from('publicaciones').insert({
    id_dueno: idDueno,
    evento,
    id_conferencia: pieza.idConferencia,
    red: pieza.red,
    formato: pieza.formato,
    texto: pieza.texto,
    cita: pieza.cita,
    ponente: pieza.ponente,
    estado: 'propuesta',
  })
  return error === null ? { ok: true, datos: null } : { ok: false, codigo: codigoDeErrorDeSupabase(error) }
}

/* Quitar una sesión de la agenda, con todo lo que cuelga de ella. Es de verdad incluso en demostración: borrar es una decisión explícita. */
export async function eliminarSesion(idConferencia: string): Promise<ResultadoDeConsulta<null>> {
  const { error } = await supabase.from('conferencias').delete().eq('id', idConferencia)
  return error === null ? { ok: true, datos: null } : { ok: false, codigo: codigoDeErrorDeSupabase(error) }
}
