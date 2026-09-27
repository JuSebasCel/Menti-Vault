import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { mensajeDeError } from '@/shared/errors'
import { useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { useSession } from '@/features/auth/session'
import { useConferenciasVisibles } from '@/features/conferencias/components'
import type { Conferencia } from '@/features/conferencias/data'
import { formatearFecha, formatearTimestamp } from '@/features/conferencias/data'
import { VistaPreviaDeDocx } from '@/features/plantillas/components/VistaPreviaDeDocx'
import { EstadoVacioIlustrado, Esqueleto } from '@/shared/ui'
import {
  EXTENSIONES_DE_APOYO,
  descargar,
  direccionDe,
  leerImagenConIa,
  listarArchivos,
  sePuedeLeerConIa,
  subirMaterialDeApoyo,
} from './repositorio'
import type { ArchivoDelAlmacen, TipoDeArchivo } from './repositorio'

/*
  Almacén: los archivos de cada conferencia, en carpetas.

  El archivo busca por ideas (eventos, temas, fichas); aquí se busca por lo
  que se subió. Hacía falta un sitio para volver a la fuente —escuchar el
  audio entero cuando el tramo de una ficha se queda corto, releer la
  transcripción de la que salió una cita— sin tener que pasar por las fichas.

  Dos columnas, como un explorador de archivos: a la izquierda las carpetas
  (una por conferencia, agrupadas por evento), a la derecha lo que hay dentro,
  y debajo el archivo abierto. Nada se descarga hasta abrirlo: el audio se
  reproduce desde una dirección firmada, que el navegador pide a trozos.
*/

const ICONO: Record<TipoDeArchivo, string> = {
  audio: 'graphic_eq',
  texto: 'description',
  docx: 'article',
  pdf: 'picture_as_pdf',
  pptx: 'slideshow',
  imagen: 'image',
  'transcripcion-automatica': 'subtitles',
  otro: 'draft',
}

const NOMBRE_DEL_TIPO: Record<TipoDeArchivo, string> = {
  audio: 'Audio',
  texto: 'Transcripción',
  docx: 'Documento de Word',
  pdf: 'PDF',
  pptx: 'Presentación',
  imagen: 'Imagen',
  'transcripcion-automatica': 'Transcripción del análisis',
  otro: 'Archivo',
}

function pesoLegible(bytes: number): string {
  if (bytes <= 0) return ''
  const mega = bytes / (1024 * 1024)
  return mega >= 1 ? `${mega.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/* La que genera el análisis se nombra por lo que es, no por su nombre técnico. */
function nombreVisible(archivo: ArchivoDelAlmacen): string {
  return archivo.tipo === 'transcripcion-automatica' ? 'Transcripción del análisis' : archivo.nombre
}

export function PantallaAlmacen(): ReactElement {
  const { usuario } = useSession()
  const { carga, visibles } = useConferenciasVisibles(usuario?.id ?? '')
  const [busqueda, setBusqueda] = useState('')
  const [idAbierta, setIdAbierta] = useState<string | null>(null)

  const buscada = busqueda.trim().toLowerCase()
  const carpetas = useMemo(
    () =>
      visibles
        .map((visible) => visible.conferencia)
        .filter(
          (conferencia) =>
            buscada === '' ||
            [conferencia.titulo, conferencia.evento, conferencia.ponente].some((campo) =>
              campo.toLowerCase().includes(buscada),
            ),
        ),
    [visibles, buscada],
  )

  /* Agrupadas por evento, en el orden en que aparecen (de la más reciente a la más antigua). */
  const porEvento = useMemo(() => {
    const grupos = new Map<string, Conferencia[]>()
    for (const conferencia of carpetas) {
      grupos.set(conferencia.evento, [...(grupos.get(conferencia.evento) ?? []), conferencia])
    }
    return [...grupos.entries()]
  }, [carpetas])

  const abierta = carpetas.find((conferencia) => conferencia.id === idAbierta) ?? null

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-titulo text-[32px] leading-none font-semibold text-texto">Almacén</h1>

        <div className="relative w-72">
          <span
            aria-hidden="true"
            className="material-symbols-rounded icono-contorno pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-lg text-texto-tenue"
          >
            search
          </span>
          <input
            type="search"
            value={busqueda}
            onChange={(cambio) => setBusqueda(cambio.target.value)}
            placeholder="Buscar carpetas"
            aria-label="Buscar carpetas por conferencia, evento o ponente"
            className="block h-10 w-full rounded-full bg-acento-tenue pr-4 pl-11 text-base text-texto placeholder:text-texto-tenue focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
        </div>
      </div>

      {carga === 'cargando' && visibles.length === 0 ? (
        <Esqueleto variante="columnas" />
      ) : visibles.length === 0 ? (
        <EstadoVacioIlustrado icono="folder_open" mensaje="Cuando cargues una conferencia, sus archivos aparecerán aquí." />
      ) : (
        <div className="flex min-h-0 flex-1 gap-2">
          <nav
            aria-label="Carpetas"
            className="sin-barra-de-scroll flex w-80 shrink-0 flex-col gap-4 overflow-y-auto rounded-[24px] bg-panel py-4"
          >
            {porEvento.length === 0 ? (
              <p className="px-6 text-sm text-texto-tenue">Ninguna carpeta coincide.</p>
            ) : (
              porEvento.map(([evento, conferencias]) => (
                <div key={evento} className="flex flex-col">
                  <p className="px-6 pb-1 text-xs font-medium tracking-wide text-texto-tenue uppercase">{evento}</p>
                  {conferencias.map((conferencia) => {
                    const activa = conferencia.id === idAbierta
                    return (
                      <button
                        key={conferencia.id}
                        type="button"
                        aria-pressed={activa}
                        onClick={() => setIdAbierta(conferencia.id)}
                        className={`mx-2 flex cursor-pointer items-center gap-3 rounded-2xl px-4 py-2.5 text-left transition-colors ${
                          activa ? 'bg-ilustracion text-ilustracion-texto' : 'text-texto hover:bg-acento-tenue'
                        }`}
                      >
                        <span aria-hidden="true" className="material-symbols-rounded icono-relleno shrink-0 text-xl">
                          {activa ? 'folder_open' : 'folder'}
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-sm font-medium">{conferencia.titulo}</span>
                          <span className={`truncate text-xs ${activa ? 'opacity-80' : 'text-texto-tenue'}`}>
                            {conferencia.ponente} · {formatearFecha(conferencia.fechaDelEvento)}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              ))
            )}
          </nav>

          <section
            aria-label="Contenido de la carpeta"
            className="sin-barra-de-scroll flex min-w-0 flex-1 flex-col overflow-y-auto rounded-[24px] bg-panel p-6"
          >
            {abierta === null ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-texto-tenue">
                <span aria-hidden="true" className="material-symbols-rounded icono-contorno text-5xl">
                  folder_open
                </span>
                <p className="text-base">Elige una carpeta para ver sus archivos.</p>
              </div>
            ) : (
              <ContenidoDeCarpeta key={abierta.id} conferencia={abierta} />
            )}
          </section>
        </div>
      )}
    </div>
  )
}

/* El archivo que se subió primero; después la transcripción del análisis y el material de apoyo. */
function ordenados(archivos: readonly ArchivoDelAlmacen[]): readonly ArchivoDelAlmacen[] {
  const peso = (archivo: ArchivoDelAlmacen): number =>
    archivo.esApoyo === true ? 2 : archivo.tipo === 'transcripcion-automatica' ? 1 : 0

  return [...archivos].sort((a, b) => peso(a) - peso(b))
}

function ContenidoDeCarpeta({ conferencia }: { conferencia: Conferencia }): ReactElement {
  const [archivos, setArchivos] = useState<readonly ArchivoDelAlmacen[] | null>(null)
  const [error, setError] = useState(false)
  const [rutaAbierta, setRutaAbierta] = useState<string | null>(null)
  const [subiendo, setSubiendo] = useState(false)

  async function adjuntar(elegidos: FileList | null): Promise<void> {
    const archivos = [...(elegidos ?? [])]

    if (archivos.length === 0 || subiendo) {
      return
    }

    setSubiendo(true)
    await Promise.all(archivos.map((archivo) => subirMaterialDeApoyo(conferencia.idDueno, conferencia.id, archivo)))
    const resultado = await listarArchivos(conferencia.idDueno, conferencia.id)
    setSubiendo(false)

    if (resultado.ok) {
      setArchivos(ordenados(resultado.datos))
    }
  }

  useEffect(() => {
    let vivo = true
    void listarArchivos(conferencia.idDueno, conferencia.id).then((resultado) => {
      if (!vivo) return
      if (resultado.ok) {
        const lista = ordenados(resultado.datos)
        setArchivos(lista)
        setRutaAbierta(lista[0]?.ruta ?? null)
      } else {
        setError(true)
      }
    })
    return () => {
      vivo = false
    }
  }, [conferencia.idDueno, conferencia.id])

  const abierto = archivos?.find((archivo) => archivo.ruta === rutaAbierta) ?? null

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-titulo text-2xl leading-tight font-semibold text-texto">{conferencia.titulo}</h2>
        <p className="text-sm text-texto-tenue">
          {conferencia.ponente} · {conferencia.evento} · {formatearFecha(conferencia.fechaDelEvento)}
        </p>
      </div>

      {/*
        El material de apoyo: diapositivas y documentos de la charla. La
        memoria los lee igual que la transcripción, y de ahí salen los datos
        que se mostraron en pantalla y nadie dijo en voz alta (un correo, una
        cifra, el nombre de una institución).
      */}
      <div className="flex flex-wrap items-center gap-3 rounded-[20px] bg-fondo px-5 py-4">
        <span aria-hidden="true" className="material-symbols-rounded icono-contorno text-xl text-texto-tenue">
          slideshow
        </span>
        <p className="min-w-0 flex-1 text-sm leading-relaxed text-texto-tenue">
          Adjunta las diapositivas o documentos de la charla y la IA los usará al escribir sus memorias. De
          un PDF o un PowerPoint se lee su texto; de una foto o una captura, lo lee un modelo con visión.
        </p>

        <label className="shrink-0 cursor-pointer rounded-full bg-acento-tenue px-4 py-2 text-sm text-texto transition-colors hover:bg-ilustracion">
          {subiendo ? 'Subiendo…' : 'Adjuntar material'}
          <input
            type="file"
            multiple
            accept={EXTENSIONES_DE_APOYO.join(',')}
            className="sr-only"
            onChange={(cambio) => void adjuntar(cambio.target.files)}
          />
        </label>
      </div>

      {error ? (
        <p className="text-sm text-texto-tenue">No se pudo abrir esta carpeta.</p>
      ) : archivos === null ? (
        <Esqueleto variante="lista" filas={2} />
      ) : archivos.length === 0 ? (
        <p className="text-sm text-texto-tenue">Esta carpeta está vacía: el archivo no llegó a subirse.</p>
      ) : (
        <>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-2">
            {archivos.map((archivo) => {
              const activo = archivo.ruta === rutaAbierta
              return (
                <li key={archivo.ruta}>
                  <button
                    type="button"
                    aria-pressed={activo}
                    onClick={() => setRutaAbierta(archivo.ruta)}
                    className={`flex w-full cursor-pointer items-center gap-3 rounded-[20px] px-4 py-3 text-left transition-colors ${
                      activo ? 'bg-acento text-acento-contraste' : 'bg-fondo text-texto hover:bg-acento-tenue'
                    }`}
                  >
                    <span aria-hidden="true" className="material-symbols-rounded icono-relleno shrink-0 text-2xl">
                      {ICONO[archivo.tipo]}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">{nombreVisible(archivo)}</span>
                      <span className={`truncate text-xs ${activo ? 'opacity-80' : 'text-texto-tenue'}`}>
                        {[NOMBRE_DEL_TIPO[archivo.tipo], pesoLegible(archivo.bytes)].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          <AnimatePresence mode="wait" initial={false}>
            {abierto === null ? null : (
              <VisorDeArchivo
                key={abierto.ruta}
                archivo={abierto}
                idConferencia={conferencia.id}
                tiemposEstimados={conferencia.tiemposEstimados === true}
              />
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  )
}

type Segmento = { readonly inicio: number; readonly texto: string; readonly hablante?: string | null }

function VisorDeArchivo({
  archivo,
  tiemposEstimados,
  idConferencia,
}: {
  archivo: ArchivoDelAlmacen
  tiemposEstimados: boolean
  idConferencia: string
}): ReactElement {
  const reducirMovimiento = useReducedMotion()
  const [direccion, setDireccion] = useState<string | null>(null)
  const [texto, setTexto] = useState<string | null>(null)
  const [segmentos, setSegmentos] = useState<readonly Segmento[] | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [fallo, setFallo] = useState(false)
  const [leyendo, setLeyendo] = useState(false)
  /* Si la imagen ya bajó entera: hasta entonces se enseña un esqueleto en su lugar. */
  const [cargada, setCargada] = useState(false)
  const [textoLeido, setTextoLeido] = useState<string | null>(null)

  async function leerTexto(): Promise<void> {
    if (leyendo) {
      return
    }

    setLeyendo(true)
    const resultado = await leerImagenConIa(idConferencia, archivo.nombre)
    setLeyendo(false)
    setTextoLeido(resultado.ok ? resultado.datos : mensajeDeError(resultado.codigo))
  }

  useEffect(() => {
    let vivo = true

    async function cargar(): Promise<void> {
      if (['audio', 'pdf', 'pptx', 'imagen'].includes(archivo.tipo)) {
        const url = await direccionDe(archivo.ruta)
        if (vivo) (url === null ? setFallo(true) : setDireccion(url))
        return
      }

      const contenido = await descargar(archivo.ruta)
      if (!vivo) return
      if (contenido === null) {
        setFallo(true)
        return
      }

      if (archivo.tipo === 'docx') {
        setBlob(contenido)
      } else if (archivo.tipo === 'transcripcion-automatica') {
        try {
          setSegmentos(JSON.parse(await contenido.text()) as Segmento[])
        } catch {
          setFallo(true)
        }
      } else {
        setTexto(await contenido.text())
      }
    }

    void cargar()
    return () => {
      vivo = false
    }
  }, [archivo.ruta, archivo.tipo])

  return (
    <motion.div
      initial={reducirMovimiento ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reducirMovimiento ? { opacity: 0 } : { opacity: 0, y: 8 }}
      transition={{ duration: 0.2, ease: [0.37, 0.35, 0, 1] }}
      className="flex flex-col gap-3"
    >
      {fallo ? (
        <p className="text-sm text-texto-tenue">No se pudo abrir este archivo.</p>
      ) : archivo.tipo === 'audio' ? (
        direccion === null ? (
          <Esqueleto variante="lista" filas={1} />
        ) : (
          /*
            El reproductor del navegador: avanzar, retroceder, velocidad y
            volumen ya vienen resueltos, y la dirección firmada deja que pida
            el audio a trozos en vez de bajarlo entero antes de sonar.
          */
          <div className="rounded-[24px] bg-fondo p-5">
            <audio controls preload="metadata" src={direccion} className="w-full" />
          </div>
        )
      ) : archivo.tipo === 'pptx' ? (
        direccion === null ? null : (
          <a
            href={direccion}
            download={archivo.nombre}
            className="w-fit rounded-full bg-acento-tenue px-4 py-2 text-sm text-texto transition-colors hover:bg-ilustracion"
          >
            Descargar {archivo.nombre}
          </a>
        )
      ) : archivo.tipo === 'imagen' ? (
        direccion === null ? null : (
          <div className="flex flex-col gap-3">
            {/*
              La imagen no se enseña hasta que está entera. Una foto de varios
              megas se pintaba por franjas mientras bajaba, y eso se lee como
              que la app va trabada. El hueco lo ocupa un esqueleto del mismo
              alto, así que nada salta cuando aparece.
            */}
            {cargada ? null : <Esqueleto variante="lista" filas={3} etiqueta="Cargando la imagen" />}

            <img
              src={direccion}
              alt={archivo.nombre}
              decoding="async"
              onLoad={() => setCargada(true)}
              /* Oculta, no transparente: transparente seguía ocupando su sitio a medio pintar. */
              className={`max-h-[60vh] w-fit rounded-[24px] bg-fondo ${cargada ? '' : 'hidden'}`}
            />

            {/*
              Leer la imagen a mano. Es lo mismo que hace la memoria por
              dentro, pero a la vista: si el modelo con visión no está bien
              configurado, aquí se dice, en vez de aparecer como una memoria
              con huecos y ninguna explicación.
            */}
            {sePuedeLeerConIa() ? (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  disabled={leyendo}
                  onClick={() => void leerTexto()}
                  className="flex h-10 w-fit cursor-pointer items-center gap-2 rounded-full bg-acento-tenue px-4 text-sm text-texto transition-colors hover:bg-ilustracion disabled:cursor-default disabled:opacity-60"
                >
                  <span aria-hidden="true" className="material-symbols-rounded icono-contorno text-lg">
                    document_scanner
                  </span>
                  {leyendo ? 'Leyendo la imagen…' : 'Leer su texto con IA'}
                </button>

                {textoLeido === null ? null : (
                  <p className="max-h-72 overflow-y-auto rounded-[20px] bg-fondo p-5 text-sm leading-relaxed whitespace-pre-wrap text-texto">
                    {textoLeido}
                  </p>
                )}
              </div>
            ) : null}
          </div>
        )
      ) : archivo.tipo === 'pdf' ? (
        direccion === null ? null : (
          <iframe title={archivo.nombre} src={direccion} className="h-[70vh] w-full rounded-[24px] bg-fondo" />
        )
      ) : archivo.tipo === 'docx' ? (
        <div className="h-[70vh] overflow-hidden rounded-[24px] bg-fondo">
          <VistaPreviaDeDocx blob={blob} conZoom />
        </div>
      ) : archivo.tipo === 'transcripcion-automatica' ? (
        segmentos === null ? (
          <Esqueleto variante="lista" filas={4} />
        ) : (
          <ol className="flex flex-col gap-3 rounded-[24px] bg-fondo p-6">
            {segmentos.map((segmento, indice) => (
              <li key={indice} className="grid grid-cols-[4.5rem_1fr] gap-4 text-base leading-relaxed">
                {/* Un minuto estimado no se enseña: sin marcas en el texto, no es un dato. */}
                <span className="coordenada pt-0.5 text-xs text-texto-tenue">
                  {tiemposEstimados ? '' : formatearTimestamp(segmento.inicio)}
                </span>
                <span className="text-texto">
                  {segmento.hablante ? <span className="font-medium">{segmento.hablante}: </span> : null}
                  {segmento.texto}
                </span>
              </li>
            ))}
          </ol>
        )
      ) : texto === null ? (
        <Esqueleto variante="lista" filas={4} />
      ) : (
        <div className="max-h-[70vh] overflow-y-auto rounded-[24px] bg-fondo p-6">
          <p className="max-w-[72ch] text-base leading-relaxed whitespace-pre-wrap text-texto">{texto}</p>
        </div>
      )}
    </motion.div>
  )
}
