import { hayBackend, pedirAlBackend } from '@/shared/api/backend'
import { supabase } from '@/shared/supabase/cliente'
import type { ResultadoDeConsulta } from '@/shared/supabase/consultas'

/*
  Los archivos de cada conferencia, tal como están en el almacenamiento.

  No hay una tabla de archivos: el bucket `audio-conferencias` ya guarda todo
  lo de una charla en su carpeta (`<id_dueno>/<id_conferencia>/`), y listarla
  es la fuente de verdad. Ahí viven el archivo que se subió (audio o texto) y
  la transcripción que guarda el análisis (`transcripcion-guardada.json`).
  La RLS del almacenamiento decide qué carpetas se pueden leer: las propias y
  las de las conferencias compartidas y aceptadas.
*/

const BUCKET = 'audio-conferencias'
const TRANSCRIPCION_GUARDADA = 'transcripcion-guardada.json'
const VIGENCIA_DE_LA_FIRMA_S = 60 * 60

/*
  Subcarpeta de las diapositivas y documentos que acompañan a la charla. Va
  aparte del audio porque el backend elige el archivo que va a transcribir
  listando la carpeta: un PDF suelto ahí se intentaría transcribir.
*/
export const CARPETA_DE_APOYO = 'apoyo'

/*
  Lo que se sabe leer como apoyo. Los documentos traen su texto dentro
  (`backend/bitacora/memorias/material.py`); las imágenes las lee un modelo
  con visión, que transcribe lo que se ve (`memorias/vision.py`).
*/
export const EXTENSIONES_DE_APOYO = [
  '.pdf',
  '.pptx',
  '.docx',
  '.txt',
  '.md',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
] as const

export type TipoDeArchivo =
  | 'audio'
  | 'texto'
  | 'docx'
  | 'pdf'
  | 'pptx'
  | 'imagen'
  | 'transcripcion-automatica'
  | 'otro'

export type ArchivoDelAlmacen = {
  readonly nombre: string
  readonly ruta: string
  readonly tipo: TipoDeArchivo
  readonly bytes: number
  /** Diapositivas o documentos que acompañan a la charla, no su fuente. */
  readonly esApoyo?: boolean
}

function tipoDe(nombre: string): TipoDeArchivo {
  const minusculas = nombre.toLowerCase()

  if (minusculas === TRANSCRIPCION_GUARDADA) return 'transcripcion-automatica'
  if (/\.(mp3|wav|m4a|aac|ogg|webm)$/.test(minusculas)) return 'audio'
  if (/\.(txt|md|vtt|srt)$/.test(minusculas)) return 'texto'
  if (minusculas.endsWith('.docx')) return 'docx'
  if (minusculas.endsWith('.pdf')) return 'pdf'
  if (minusculas.endsWith('.pptx')) return 'pptx'
  if (/\.(png|jpe?g|webp|gif)$/.test(minusculas)) return 'imagen'
  return 'otro'
}

async function listarCarpeta(carpeta: string, esApoyo: boolean): Promise<readonly ArchivoDelAlmacen[]> {
  const { data, error } = await supabase.storage.from(BUCKET).list(carpeta)

  if (error !== null || data === null) {
    return []
  }

  return (
    data
      /* Las carpetas vienen en el listado sin `metadata`: no son archivos. */
      .filter((objeto) => objeto.name !== '.emptyFolderPlaceholder' && objeto.metadata !== null)
      .map((objeto) => ({
        nombre: objeto.name,
        ruta: `${carpeta}/${objeto.name}`,
        tipo: tipoDe(objeto.name),
        bytes: Number((objeto.metadata as { size?: number } | null)?.size ?? 0),
        esApoyo,
      }))
  )
}

export async function listarArchivos(
  idDueno: string,
  idConferencia: string,
): Promise<ResultadoDeConsulta<readonly ArchivoDelAlmacen[]>> {
  const carpeta = `${idDueno}/${idConferencia}`

  const [propios, apoyo] = await Promise.all([
    listarCarpeta(carpeta, false),
    listarCarpeta(`${carpeta}/${CARPETA_DE_APOYO}`, true),
  ])

  return { ok: true, datos: [...propios, ...apoyo] }
}

/** Sube una diapositiva o documento de apoyo a la carpeta de la conferencia. */
export async function subirMaterialDeApoyo(
  idDueno: string,
  idConferencia: string,
  archivo: File,
): Promise<ResultadoDeConsulta<null>> {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(`${idDueno}/${idConferencia}/${CARPETA_DE_APOYO}/${archivo.name}`, archivo, { upsert: true })

  if (error !== null) {
    console.error('[almacen] no se pudo subir el material de apoyo:', error.message)
    return { ok: false, codigo: 'CARGA_ARCHIVO_RECHAZADO' }
  }

  return { ok: true, datos: null }
}

/*
  Quita un archivo de apoyo. Solo de apoyo: el audio y la transcripción son la
  fuente de la conferencia, y borrarlos dejaría fichas que ya no se pueden
  comprobar —para eso está borrar la conferencia entera—.
*/
export async function eliminarMaterialDeApoyo(ruta: string): Promise<ResultadoDeConsulta<null>> {
  const { error } = await supabase.storage.from(BUCKET).remove([ruta])

  if (error !== null) {
    console.error('[almacen] no se pudo borrar el material de apoyo:', error.message)
    return { ok: false, codigo: 'DATOS_SIN_PERMISO' }
  }

  return { ok: true, datos: null }
}

/** Una dirección temporal para reproducir o abrir el archivo sin descargarlo entero antes. */
export async function direccionDe(ruta: string): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(ruta, VIGENCIA_DE_LA_FIRMA_S)
  return data?.signedUrl ?? null
}

export async function descargar(ruta: string): Promise<Blob | null> {
  const { data } = await supabase.storage.from(BUCKET).download(ruta)
  return data ?? null
}

export function sePuedeLeerConIa(): boolean {
  return hayBackend()
}

/*
  Lo que un modelo con visión lee en una imagen de apoyo.

  Existe para poder COMPROBAR la lectura: la automática ocurre al escribir una
  memoria y, si falla, lo único que se ve es una memoria con huecos. Aquí se
  pide una imagen concreta y vuelve su texto, o el motivo por el que no.
*/
export async function leerImagenConIa(
  idConferencia: string,
  nombre: string,
): Promise<ResultadoDeConsulta<string>> {
  const resultado = await pedirAlBackend<{ texto: string }>('/material/leer-imagen', {
    id_conferencia: idConferencia,
    nombre,
  })

  return resultado.ok ? { ok: true, datos: resultado.datos.texto } : resultado
}
