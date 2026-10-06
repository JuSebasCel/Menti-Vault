import { supabase } from '@/shared/supabase/cliente'
import { hayBackend, pedirAlBackend } from '@/shared/api/backend'
import { resultadoDe, resultadoDeLista } from '@/shared/supabase/consultas'
import type { ResultadoDeConsulta } from '@/shared/supabase/consultas'
import type { ReferenciaDeConferencia } from '../data'
import type { Conferencia, EstadoDeValidacion, Ficha } from '../data'
import { filaParaInsertar, mapearConferencia, mapearFicha, mapearFilas } from './mapeo'
import type { ConferenciaParaInsertar, FilaDeConferencia, FilaDeFicha } from './mapeo'

/*
  Único punto del dominio de conferencias que habla con Supabase. Pantallas y
  hooks dependen de estas funciones y nunca de `supabase.from(...)`: así una
  prueba de componente sustituye este módulo entero en vez de aprenderse la
  forma de una cadena de PostgREST, y el día que cambie el nombre de una tabla
  cambia un solo archivo.

  Sobre el aislamiento: quién ve qué ya no lo decide el frontend. Las
  políticas de RLS de `20260814032437_esquema_propio.sql` filtran las filas
  antes de que salgan de Postgres, así que un listado nunca trae una
  conferencia ajena aunque el cliente pida `select('*')` sin condiciones. Las
  reglas puras de `query/acceso.ts` siguen vivas, pero cambiaron de papel:
  antes eran la única puerta, ahora derivan la procedencia (propia o
  compartida) y la privacidad efectiva sobre filas que Postgres ya autorizó.
  Se conservan además como segunda barrera — que la interfaz y la base de
  datos coincidan es justo lo que hace que un fallo en una de las dos se note.
*/

/*
  Las comparticiones viajan embebidas en la misma consulta y no en una segunda
  llamada: la interfaz necesita la privacidad para decidir qué fichas mostrar,
  así que pedirlas aparte abriría una ventana en la que el listado ya está
  dibujado sin saber todavía qué puede enseñar.
*/
const COLUMNAS_DE_CONFERENCIA =
  '*, comparticiones ( id_invitado, compartida_el, privacidad, estado, respondida_el, invitado_nombre, invitado_correo, respuesta_vista_por_dueno )'

const BUCKET_DE_AUDIO = 'audio-conferencias'

/** Lo que la sesión puede ver: lo propio y lo compartido, resuelto por RLS. */
export async function listarConferencias(): Promise<ResultadoDeConsulta<readonly Conferencia[]>> {
  const respuesta = await supabase
    .from('conferencias')
    .select(COLUMNAS_DE_CONFERENCIA)
    .order('fecha_del_evento', { ascending: false })

  const lista = resultadoDeLista(respuesta as { data: FilaDeConferencia[] | null; error: null })

  return lista.ok ? { ok: true, datos: mapearFilas(lista.datos, mapearConferencia) } : lista
}

/*
  Devuelve `CONF_NO_ENCONTRADA` tanto para una conferencia inexistente como
  para una que existe pero RLS no deja ver. La indistinguibilidad es la misma
  que ya describía `query/acceso.ts` y sigue importando: si los dos casos se
  diferenciaran, bastaría probar identificadores contra el detalle para
  averiguar qué ha subido otra persona.
*/
export async function obtenerConferencia(
  idConferencia: string,
): Promise<ResultadoDeConsulta<Conferencia>> {
  const respuesta = await supabase
    .from('conferencias')
    .select(COLUMNAS_DE_CONFERENCIA)
    .eq('id', idConferencia)
    .maybeSingle()

  const fila = resultadoDe(respuesta as { data: FilaDeConferencia | null; error: null }, () => ({
    ok: false,
    codigo: 'CONF_NO_ENCONTRADA',
  }))

  if (!fila.ok) {
    return fila
  }

  const conferencia = mapearConferencia(fila.datos)

  return conferencia === null
    ? { ok: false, codigo: 'CONF_NO_ENCONTRADA' }
    : { ok: true, datos: conferencia }
}

/** Las fichas de una conferencia. RLS ya excluye las pendientes si la compartición no las incluye. */
export async function listarFichasDe(
  idConferencia: string,
): Promise<ResultadoDeConsulta<readonly Ficha[]>> {
  const respuesta = await supabase
    .from('fichas')
    .select('*')
    .eq('id_conferencia', idConferencia)
    .order('segundo_inicio', { ascending: true })

  const lista = resultadoDeLista(respuesta as { data: FilaDeFicha[] | null; error: null })

  return lista.ok ? { ok: true, datos: mapearFilas(lista.datos, mapearFicha) } : lista
}

/*
  Todas las fichas visibles, para el catálogo y el chat. Es una sola consulta y
  no una por conferencia: el catálogo cruza fichas de varias charlas a la vez,
  y pedirlas en bucle multiplicaría los viajes por el tamaño del listado.
*/
export async function listarFichasVisibles(): Promise<ResultadoDeConsulta<readonly Ficha[]>> {
  const respuesta = await supabase.from('fichas').select('*')

  const lista = resultadoDeLista(respuesta as { data: FilaDeFicha[] | null; error: null })

  return lista.ok ? { ok: true, datos: mapearFilas(lista.datos, mapearFicha) } : lista
}

/*
  Cambiar el estado de validación de una ficha. No se restringe aquí quién
  puede hacerlo: la política «un invitado con permiso valida fichas de una
  conferencia compartida» ya lo decide en Postgres, y una comprobación extra
  en el cliente daría la falsa impresión de ser la que protege.
*/
export async function actualizarEstadoDeValidacion(
  idFicha: string,
  estado: EstadoDeValidacion,
): Promise<ResultadoDeConsulta<null>> {
  const { error } = await supabase
    .from('fichas')
    .update({ estado_de_validacion: estado })
    .eq('id', idFicha)

  return error === null
    ? { ok: true, datos: null }
    : resultadoDe({ data: null, error }, () => ({ ok: false, codigo: 'DATOS_FALLO_INESPERADO' }))
}

/*
  Guarda la versión escrita a mano de una ficha, o la quita con un texto
  vacío. Nunca toca `fragmento` ni `condensado`: las tres versiones conviven
  (ver la migración 20260922120000). RLS solo deja escribir al dueño de la
  conferencia.
*/
export async function editarFicha(
  idFicha: string,
  texto: string,
): Promise<ResultadoDeConsulta<null>> {
  const limpio = texto.trim()
  const { error } = await supabase
    .from('fichas')
    .update({ editado: limpio, editada_el: limpio === '' ? null : new Date().toISOString() })
    .eq('id', idFicha)

  return error === null
    ? { ok: true, datos: null }
    : resultadoDe({ data: null, error }, () => ({ ok: false, codigo: 'DATOS_FALLO_INESPERADO' }))
}

/*
  Borra una ficha. No hay papelera: el análisis es reproducible —volver a
  analizar la conferencia las devuelve todas—, así que guardar una ficha
  borrada solo sería un cajón que nadie abre.

  Quien no sea el dueño no llega aquí: la RLS de `fichas` deja borrar solo
  las de las conferencias propias, y la interfaz solo ofrece el gesto sobre
  ellas.
*/
export async function eliminarFicha(idFicha: string): Promise<ResultadoDeConsulta<null>> {
  const { error } = await supabase.from('fichas').delete().eq('id', idFicha)

  return error === null
    ? { ok: true, datos: null }
    : resultadoDe({ data: null, error }, () => ({ ok: false, codigo: 'DATOS_SIN_PERMISO' }))
}

/*
  Una dirección temporal para escuchar el audio de una conferencia.

  El nombre del archivo no se guarda en ninguna parte (ver
  `nombreParaAlmacenamiento`), así que se lista la carpeta y se toma lo que
  haya. Firmada y de una hora: el bucket es privado, y una dirección pública
  dejaría el audio de una charla al alcance de cualquiera que la tuviera.
  Solo el dueño puede listar su carpeta; para una conferencia compartida no
  hay audio que ofrecer, y se devuelve `null` en vez de un error.

  Se recuerda por conferencia mientras dure la sesión: escuchar tres fichas
  de la misma charla no tiene por qué firmar tres veces.
*/
const direccionesDeAudio = new Map<string, { url: string; vence: number }>()
const VIGENCIA_DE_LA_FIRMA_S = 3600

export async function urlDelAudio(idDueno: string, idConferencia: string): Promise<string | null> {
  const recordada = direccionesDeAudio.get(idConferencia)
  if (recordada !== undefined && recordada.vence > Date.now()) {
    return recordada.url
  }

  const carpeta = `${idDueno}/${idConferencia}`
  const almacen = supabase.storage.from(BUCKET_DE_AUDIO)
  const { data: objetos } = await almacen.list(carpeta)

  /*
    Las carpetas vienen en el mismo listado que los archivos, con `metadata`
    en nulo, y `apoyo` ordena antes que el nombre de cualquier audio. Sin
    descartarlas se firmaba la carpeta de material de apoyo como si fuera la
    grabación: el reproductor decía "No hay audio disponible" en una charla
    que tenía su audio ahí al lado, y la contradicción era peor que el fallo
    porque el Almacén —que sí filtra— lo seguía enseñando.

    El criterio es el mismo que usa `descargar_fuente` en el backend, y se
    ordena por nombre como allí: lo que se escucha tiene que ser el mismo
    archivo que se transcribió.
  */
  const archivo = (objetos ?? [])
    .filter(
      (objeto) =>
        objeto.metadata !== null &&
        objeto.name !== '.emptyFolderPlaceholder' &&
        objeto.name !== 'transcripcion-guardada.json',
    )
    /* Por punto de código y no con `localeCompare`, que es lo que hace `sorted()` en Python. */
    .sort((uno, otro) => (uno.name < otro.name ? -1 : uno.name > otro.name ? 1 : 0))[0]

  if (archivo === undefined) {
    return null
  }

  const { data } = await almacen.createSignedUrl(
    `${carpeta}/${archivo.name}`,
    VIGENCIA_DE_LA_FIRMA_S,
  )
  if (data?.signedUrl === undefined) {
    return null
  }

  /* Un minuto antes de que venza, para no entregar una firma que caduca a mitad de escuchar. */
  direccionesDeAudio.set(idConferencia, {
    url: data.signedUrl,
    vence: Date.now() + (VIGENCIA_DE_LA_FIRMA_S - 60) * 1000,
  })
  return data.signedUrl
}

/** Ruta del audio dentro del bucket. El primer segmento es el dueño porque la política de Storage lo exige. */
/*
  Supabase Storage no acepta cualquier nombre como clave de objeto: su
  validación es ASCII, así que una tilde o una eñe la rechazan con un 400
  («Invalid key»). En español eso no es un caso raro, es el caso normal —
  "04 Sesgos algorítmicos.mp3" no se puede subir tal cual.

  Se saca el acento de la letra en vez de borrarla, para que el nombre siga
  siendo legible para un humano que mire el bucket. Lo que no sea letra,
  número, punto, guion o subrayado pasa a guion, y los guiones seguidos se
  juntan en uno.

  Que el nombre cambie no rompe nada aguas abajo: el backend **lista la
  carpeta** y toma el objeto que encuentre (`descargar_fuente`), no
  reconstruye la ruta a partir del nombre original, que además no se guarda en
  ninguna parte.
*/
export function nombreParaAlmacenamiento(nombreDeArchivo: string): string {
  const sinAcentos = nombreDeArchivo.normalize('NFD').replace(/\p{Diacritic}/gu, '')

  const limpio = sinAcentos
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+/, '')

  /* Un nombre que era todo símbolos se queda sin nada: mejor un marcador que una clave vacía. */
  return limpio.length > 0 ? limpio : 'archivo'
}

export function rutaDeAudio(
  idDueno: string,
  idConferencia: string,
  nombreDeArchivo: string,
): string {
  return `${idDueno}/${idConferencia}/${nombreParaAlmacenamiento(nombreDeArchivo)}`
}

/*
  Crear una conferencia son dos escrituras que no comparten transacción: la
  fila primero (para tener el id que da nombre a la carpeta del audio) y el
  archivo después.

  Si la subida falla se borra la fila recién creada. Sin esa compensación
  quedaría una conferencia `en-cola` cuyo audio no existe: el análisis nunca
  la podría procesar y se quedaría para siempre en ese estado, sin que nadie
  pudiera explicar por qué. Es preferible que la carga falle entera y la
  persona la repita.
*/
export async function crearConferencia(
  datos: ConferenciaParaInsertar,
  archivo: File | null,
): Promise<ResultadoDeConsulta<Conferencia>> {
  const respuesta = await supabase
    .from('conferencias')
    .insert(filaParaInsertar(datos))
    .select(COLUMNAS_DE_CONFERENCIA)
    .single()

  const fila = resultadoDe(respuesta as { data: FilaDeConferencia | null; error: null }, () => ({
    ok: false,
    codigo: 'CARGA_FALLO_INESPERADO',
  }))

  if (!fila.ok) {
    /* Lo mismo que abajo: sin el motivo de Postgres no hay forma de saber si es RLS, una columna o un valor. */
    console.error('[carga] no se pudo crear la fila de la conferencia:', respuesta.error)
    return fila
  }

  const conferencia = mapearConferencia(fila.datos)

  if (conferencia === null) {
    return { ok: false, codigo: 'CARGA_FALLO_INESPERADO' }
  }

  if (archivo === null) {
    return { ok: true, datos: conferencia }
  }

  const subida = await subirArchivoDeConferencia(datos.idDueno, conferencia.id, archivo)

  if (!subida.ok) {
    await supabase.from('conferencias').delete().eq('id', conferencia.id)
    return subida
  }

  return { ok: true, datos: conferencia }
}

/*
  El archivo de una conferencia que ya existe. Va aparte de `crearConferencia`
  para que la interfaz pueda enseñar la tarjeta en cuanto la fila está creada
  y subir el archivo después, sin nadie esperando con el modal abierto.
*/
export async function subirArchivoDeConferencia(
  idDueno: string,
  idConferencia: string,
  archivo: File,
): Promise<ResultadoDeConsulta<null>> {
  const ruta = rutaDeAudio(idDueno, idConferencia, archivo.name)
  const { error } = await supabase.storage.from(BUCKET_DE_AUDIO).upload(ruta, archivo)

  if (error !== null) {
    /*
      El motivo real se escribe en consola. Supabase distingue entre archivo
      demasiado grande, tipo no admitido y política del bucket, y los tres
      llegaban aquí convertidos en el mismo "vuelve a intentarlo" — que además
      es el peor consejo posible para los tres, porque reintentar no cambia
      ninguno. No es información sensible: es el mensaje del almacenamiento
      sobre un archivo que acaba de elegir quien lo está leyendo.
    */
    console.error('[carga] el almacenamiento rechazó el archivo:', error.message, {
      archivo: archivo.name,
      bytes: archivo.size,
      ruta,
    })
    return { ok: false, codigo: 'CARGA_ARCHIVO_RECHAZADO' }
  }

  return { ok: true, datos: null }
}

/*
  Pide al backend que transcriba y despiece la conferencia. Se llama justo
  después de crearla: la fila ya está `en-cola`, y esto solo la pone en marcha.

  Sin `VITE_API_URL` configurada no hay a quién pedírselo — la conferencia se
  queda `en-cola` y alguien la procesará cuando el backend esté en pie. Por eso
  un backend ausente no es un fallo de la carga: se devuelve ok. Un backend
  presente que rechaza sí se propaga, para que la interfaz lo pueda decir.
*/
export async function solicitarProcesamiento(
  idConferencia: string,
): Promise<ResultadoDeConsulta<null>> {
  if (!hayBackend()) {
    return { ok: true, datos: null }
  }

  const respuesta = await pedirAlBackend<{ estado: string }>(
    `/conferencias/${idConferencia}/procesar`,
    {},
  )

  return respuesta.ok ? { ok: true, datos: null } : respuesta
}

/** Campos que se pueden corregir de una conferencia ya cargada. */
export type CambioDeConferencia = {
  readonly titulo?: string
  readonly ponente?: string
  readonly fechaDelEvento?: string
  readonly descripcion?: string
}

export async function actualizarConferencia(
  idConferencia: string,
  cambio: CambioDeConferencia,
): Promise<ResultadoDeConsulta<null>> {
  const fila: Record<string, unknown> = {}

  if (cambio.titulo !== undefined) fila.titulo = cambio.titulo.trim()
  if (cambio.ponente !== undefined) fila.ponente = cambio.ponente.trim()
  if (cambio.fechaDelEvento !== undefined) fila.fecha_del_evento = cambio.fechaDelEvento
  /*
    La descripcion se manda tal cual, sin `trim` que la borre por accidente ni
    comprobacion de vacio: vaciarla a proposito es una edicion legitima, y
    `undefined` (no se toca) ya es distinto de `''` (se quiso dejar vacia).
  */
  if (cambio.descripcion !== undefined) fila.descripcion = cambio.descripcion.trim()

  if (Object.keys(fila).length === 0) {
    return { ok: true, datos: null }
  }

  const { error } = await supabase.from('conferencias').update(fila).eq('id', idConferencia)

  return error === null
    ? { ok: true, datos: null }
    : resultadoDe({ data: null, error }, () => ({ ok: false, codigo: 'DATOS_SIN_PERMISO' }))
}

/*
  Borra la conferencia entera: fichas, comparticiones, etiquetas y audio.

  Las tres tablas caen solas por `on delete cascade`, así que basta con borrar
  la fila. Lo que no cae es el audio: Storage no sabe nada de claves foráneas,
  y sin este paso el archivo se quedaría ocupando espacio para siempre sin
  nadie que supiera a qué pertenecía.

  El audio se borra ANTES que la fila. Al revés, si el borrado de la fila
  funciona y el del archivo falla, se pierde el único dato —el id— con el que
  encontrar la carpeta huérfana. En este orden, un fallo a mitad deja la
  conferencia intacta y se puede reintentar.

  Se borra la carpeta entera y no un nombre concreto porque el nombre del
  archivo no se guarda en ninguna parte: se listan los objetos y se quitan.
*/
export async function eliminarConferencia(
  idConferencia: string,
  idDueno: string,
): Promise<ResultadoDeConsulta<null>> {
  const carpeta = `${idDueno}/${idConferencia}`
  const almacen = supabase.storage.from(BUCKET_DE_AUDIO)
  const { data: objetos } = await almacen.list(carpeta)

  if (objetos !== null && objetos.length > 0) {
    await almacen.remove(objetos.map((objeto) => `${carpeta}/${objeto.name}`))
  }

  const { error } = await supabase.from('conferencias').delete().eq('id', idConferencia)

  return error === null
    ? { ok: true, datos: null }
    : resultadoDe({ data: null, error }, () => ({ ok: false, codigo: 'DATOS_SIN_PERMISO' }))
}

export type EstadoDeAnalisis = {
  readonly id: string
  readonly titulo: string
  readonly estado: string
}

/*
  Solo lo necesario para saber si un análisis terminó: id, título y estado de
  las conferencias propias. Es una consulta pequeña a propósito, porque se
  repite cada pocos segundos mientras haya algo en marcha.
*/
export async function listarEstadosDeAnalisis(
  idDueno: string,
): Promise<ResultadoDeConsulta<readonly EstadoDeAnalisis[]>> {
  try {
    const respuesta = await supabase
      .from('conferencias')
      .select('id, titulo, estado')
      .eq('id_dueno', idDueno)

    if (respuesta.error !== null || respuesta.data === null) {
      return { ok: false, codigo: 'DATOS_FALLO_INESPERADO' }
    }

    return { ok: true, datos: respuesta.data as EstadoDeAnalisis[] }
  } catch {
    /* Una pasada perdida no importa: la siguiente vuelve a preguntar. */
    return { ok: false, codigo: 'DATOS_SIN_CONEXION' }
  }
}

/*
  Busca las fuentes que la charla cita, en su transcripción y en sus
  diapositivas, y las guarda en la conferencia. Tarda: son varias llamadas al
  modelo, una por tramo.

  `permitirInferencia` deja que la IA proponga la fuente probable de una
  mención incompleta ("el informe del IPCC del año pasado"). Va apagado salvo
  que la persona lo encienda en sus preferencias: una referencia inventada en
  un documento académico es de los errores más caros de esta app.
*/
export async function buscarReferencias(
  idConferencia: string,
  permitirInferencia: boolean,
): Promise<ResultadoDeConsulta<readonly ReferenciaDeConferencia[]>> {
  const respuesta = await pedirAlBackend<{ referencias: readonly ReferenciaDeConferencia[] }>(
    `/conferencias/${idConferencia}/referencias`,
    { permitir_inferencia: permitirInferencia },
  )

  return respuesta.ok ? { ok: true, datos: respuesta.datos.referencias } : respuesta
}
