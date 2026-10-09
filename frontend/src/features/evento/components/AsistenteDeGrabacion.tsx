import type { ReactElement, ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from '@/features/auth/session'
import { duracionDeArchivo } from '@/features/conferencias/carga/archivo'
import { mensajeDeError } from '@/shared/errors'
import { enDemostracion } from '../demostracion'
import { esVideo, extraerAudio } from '../extraerAudio'
import { fecha, sumarMinutos } from '../formato'
import { carpetaDeFotosDeSesion, crearPonenteInvitado, crearSesion, subirFoto, subirGrabacion } from '../repositorio'
import { SelectorDePonente, ponentesNuevos } from './SelectorDePonente'
import { useEvento } from '../useEvento'
import type { DatosDelEvento } from '../tipos'
import { BotonMind, Chip, Icono } from './piezas'
import { SelectorDeHora } from './SelectorDeHora'

/*
  Subir la grabación de una sesión, por pasos: de qué sesión es, el archivo,
  las fotos y un resumen antes de subir.

  Una grabación siempre es de una sesión de la agenda: no existe "crear una
  ponencia" aparte. Si la sesión no estaba en la agenda se crea aquí mismo,
  con su día y su hora, y la grabación se le adjunta.

  Se admite audio, video o transcripción, y nada más. Del video se queda
  solo el audio (`extraerAudio`): es lo único que necesita la transcripción
  y así no se sube un archivo de gigas.
*/
type Paso = 'sesion' | 'archivo' | 'fotos' | 'resumen' | 'subiendo' | 'hecho'

const EXTENSIONES = {
  audio: ['.mp3', '.wav', '.m4a', '.aac', '.ogg'],
  video: ['.mp4', '.mov', '.mkv', '.webm', '.avi'],
  transcripcion: ['.txt', '.docx', '.pdf', '.md'],
} as const

type Tipo = keyof typeof EXTENSIONES

function tipoDe(archivo: File): Tipo | null {
  const nombre = archivo.name.toLowerCase()
  if (esVideo(archivo)) return 'video'
  if (EXTENSIONES.audio.some((extension) => nombre.endsWith(extension))) return 'audio'
  if (EXTENSIONES.transcripcion.some((extension) => nombre.endsWith(extension))) return 'transcripcion'
  return null
}

const ETIQUETA_DE_TIPO: Record<Tipo, { etiqueta: string; icono: string }> = {
  audio: { etiqueta: 'Audio', icono: 'graphic_eq' },
  video: { etiqueta: 'Video · se usa solo su audio', icono: 'movie' },
  transcripcion: { etiqueta: 'Transcripción', icono: 'subtitles' },
}

const DIA = new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric' })

export function AsistenteDeGrabacion({
  datos,
  idInicial = null,
  alTerminar,
}: {
  datos: DatosDelEvento
  idInicial?: string | null
  alTerminar: () => void
}): ReactElement {
  const { usuario } = useSession()
  const { invalidar } = useEvento()
  const [paso, setPaso] = useState<Paso>(idInicial === null ? 'sesion' : 'archivo')
  const [idSesion, setIdSesion] = useState<string | null>(idInicial)
  const [nueva, setNueva] = useState(false)
  const [sesionNueva, setSesionNueva] = useState({ titulo: '', ponente: '', fecha: '', hora: '', minutos: 60 })
  const [archivo, setArchivo] = useState<File | null>(null)
  const [fotos, setFotos] = useState<File[]>([])
  const [fase, setFase] = useState('')
  const [avance, setAvance] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const entradaArchivo = useRef<HTMLInputElement>(null)
  const entradaFotos = useRef<HTMLInputElement>(null)

  const dias = useMemo(() => {
    const unicos = new Set(datos.ponencias.map((ponencia) => ponencia.fecha))
    if (datos.evento.fechaInicio !== null) unicos.add(datos.evento.fechaInicio)
    if (datos.evento.fechaFin !== null) unicos.add(datos.evento.fechaFin)
    return [...unicos].filter((dia) => dia !== '').sort()
  }, [datos])

  const sesiones = useMemo(
    () => [...datos.ponencias].sort((una, otra) => Number(una.tieneTranscripcion) - Number(otra.tieneTranscripcion)),
    [datos.ponencias],
  )
  const elegida = datos.ponencias.find((ponencia) => ponencia.id === idSesion) ?? null
  const tipo = archivo === null ? null : tipoDe(archivo)
  const sesionLista = nueva
    ? sesionNueva.titulo.trim() !== '' && sesionNueva.fecha !== '' && sesionNueva.hora !== ''
    : idSesion !== null

  const urlsDeFotos = useMemo(() => fotos.map((foto) => URL.createObjectURL(foto)), [fotos])
  useEffect(() => () => urlsDeFotos.forEach((url) => URL.revokeObjectURL(url)), [urlsDeFotos])

  const subir = async (): Promise<void> => {
    if (archivo === null || tipo === null || usuario === null) {
      return
    }
    setPaso('subiendo')
    setError(null)
    try {
      let id = idSesion
      if (nueva) {
        for (const nombre of ponentesNuevos(datos.ponentes, sesionNueva.ponente)) {
          setFase(`Agregando a ${nombre}…`)
          const creado = await crearPonenteInvitado(datos.evento.id, nombre, '', [])
          if (!creado.ok) {
            throw new Error(mensajeDeError(creado.codigo))
          }
        }
        setFase('Creando la sesión en la agenda…')
        const creada = await crearSesion(usuario.id, datos.evento.nombre, {
          titulo: sesionNueva.titulo.trim(),
          ponente: sesionNueva.ponente,
          fecha: sesionNueva.fecha,
          horaInicio: sesionNueva.hora,
          horaFin: sumarMinutos(sesionNueva.hora, sesionNueva.minutos),
          sala: 'Sala virtual',
          tipo: 'conferencia',
          eje: '',
        })
        if (!creada.ok) {
          throw new Error(mensajeDeError(creada.codigo))
        }
        id = creada.datos
      }
      if (id === null) {
        return
      }

      let paraSubir = archivo
      if (tipo === 'video') {
        setFase('Sacando el audio del video…')
        setAvance(0)
        paraSubir = await extraerAudio(archivo, setAvance)
        setAvance(null)
      }

      setFase('Subiendo la grabación…')
      const duracion = tipo === 'transcripcion' ? 0 : await duracionDeArchivo(paraSubir)
      const subida = await subirGrabacion(usuario.id, id, paraSubir, tipo === 'transcripcion' ? 'transcripcion' : 'audio', duracion)
      if (!subida.ok) {
        throw new Error(mensajeDeError(subida.codigo))
      }

      for (const [indice, foto] of fotos.entries()) {
        setFase(`Subiendo fotos (${indice + 1} de ${fotos.length})…`)
        if (!enDemostracion()) {
          await subirFoto(carpetaDeFotosDeSesion(usuario.id, id), foto)
        }
      }

      invalidar()
      setPaso('hecho')
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo subir la grabación.')
      setPaso('resumen')
    }
  }

  return (
    <div key={paso} className="entrar-escalonado flex flex-col items-center gap-6 px-6 pt-2 pb-4 text-center">
      {paso === 'sesion' ? (
        <>
          <Cabecera icono="event" titulo="¿De qué sesión es?" texto="Elige la sesión de la agenda o créala si no estaba." />
          <div className="flex w-full max-w-md flex-col gap-2 text-left">
            {!nueva ? (
              <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
                {sesiones.map((sesion) => (
                  <button
                    key={sesion.id}
                    type="button"
                    disabled={sesion.estado === 'procesando'}
                    onClick={() => setIdSesion(sesion.id)}
                    className={`flex cursor-pointer flex-col rounded-2xl px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${idSesion === sesion.id ? 'bg-acento text-acento-contraste' : 'bg-panel hover:bg-[var(--mind-variante)]'}`}
                  >
                    <span className="truncate font-medium">{sesion.titulo}</span>
                    <span className={`text-sm ${idSesion === sesion.id ? 'opacity-70' : 'text-texto-tenue'}`}>
                      {sesion.ponente || 'Sin ponente'} · {sesion.horaInicio === null ? 'sin hora' : `${fecha(sesion.fecha)}, ${sesion.horaInicio}`}
                      {sesion.estado === 'procesando' ? ' · transcribiéndose ahora' : sesion.tieneTranscripcion ? ' · ya tiene grabación' : ''}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <SesionNueva
                datos={datos}
                dias={dias}
                valores={sesionNueva}
                alCambiar={(cambios) => setSesionNueva({ ...sesionNueva, ...cambios })}
              />
            )}
            <button
              type="button"
              onClick={() => {
                setNueva(!nueva)
                setIdSesion(null)
              }}
              className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-filete-fuerte text-sm font-medium text-texto-tenue transition-colors hover:bg-panel"
            >
              <Icono nombre={nueva ? 'list' : 'add'} className="text-lg" />
              {nueva ? 'Elegir una sesión de la agenda' : 'No está en la agenda: crear la sesión'}
            </button>
          </div>
          <Botonera>
            <span />
            <BotonMind disabled={!sesionLista} onClick={() => setPaso('archivo')}>
              Continuar <Icono nombre="arrow_forward" className="text-lg" />
            </BotonMind>
          </Botonera>
        </>
      ) : null}

      {paso === 'archivo' ? (
        <>
          <Cabecera icono="upload_file" titulo="La grabación" texto="Audio, video o transcripción." />
          <button
            type="button"
            onClick={() => entradaArchivo.current?.click()}
            className="flex w-full max-w-md cursor-pointer flex-col items-center gap-3 rounded-[24px] border-2 border-dashed border-filete-fuerte px-6 py-8 transition-colors hover:bg-panel"
          >
            {archivo === null ? (
              <>
                <Icono nombre="upload" className="text-4xl text-texto-tenue" />
                <span className="text-texto-tenue">Elegir archivo</span>
              </>
            ) : (
              <>
                <Icono nombre={tipo === null ? 'block' : ETIQUETA_DE_TIPO[tipo].icono} className="text-4xl" />
                <span className="max-w-full truncate font-medium">{archivo.name}</span>
                <span className="text-sm text-texto-tenue">
                  {tipo === null ? 'Este tipo de archivo no se admite' : `${ETIQUETA_DE_TIPO[tipo].etiqueta} · ${Math.round(archivo.size / 1048576)} MB`}
                </span>
              </>
            )}
          </button>
          <input
            ref={entradaArchivo}
            type="file"
            hidden
            accept={[...EXTENSIONES.audio, ...EXTENSIONES.video, ...EXTENSIONES.transcripcion].join(',')}
            onChange={(evento) => setArchivo(evento.target.files?.[0] ?? null)}
          />
          <Botonera>
            {idInicial === null ? (
              <BotonMind variante="tenue" icono="arrow_back" onClick={() => setPaso('sesion')}>
                Atrás
              </BotonMind>
            ) : (
              <span />
            )}
            <BotonMind disabled={tipo === null} onClick={() => setPaso('fotos')}>
              Continuar <Icono nombre="arrow_forward" className="text-lg" />
            </BotonMind>
          </Botonera>
        </>
      ) : null}

      {paso === 'fotos' ? (
        <>
          <Cabecera icono="add_photo_alternate" titulo="Fotos de la sesión" texto="Opcional: del ponente o del público. Puedes saltarte este paso." />
          {/*
            Vacío, un solo recuadro grande donde soltar o elegir; con fotos, la
            cuadrícula y un recuadro pequeño para añadir más. La cuadrícula
            vacía con un "+" suelto parecía un formulario a medio cargar.
          */}
          {fotos.length === 0 ? (
            <button
              type="button"
              onClick={() => entradaFotos.current?.click()}
              onDragOver={(evento) => evento.preventDefault()}
              onDrop={(evento) => {
                evento.preventDefault()
                setFotos([...fotos, ...[...evento.dataTransfer.files].filter((uno) => uno.type.startsWith('image/'))])
              }}
              className="flex w-full max-w-md cursor-pointer flex-col items-center gap-2 rounded-[24px] bg-panel px-6 py-10 text-texto-tenue transition-colors hover:bg-[var(--mind-variante)]"
            >
              <span className="flex size-14 items-center justify-center rounded-full bg-fondo shadow-[0_4px_12px_-6px_rgb(0_0_0/0.35)]">
                <Icono nombre="photo_library" className="text-[28px] text-texto" />
              </span>
              <span className="text-base font-medium text-texto">Suelta las fotos aquí o elígelas</span>
              <span className="text-sm">PNG, JPG o WebP</span>
            </button>
          ) : (
            <div className="grid w-full max-w-md grid-cols-4 gap-2">
              {urlsDeFotos.map((url, indice) => (
                <span key={url} className="relative aspect-square overflow-hidden rounded-[16px] bg-panel shadow-[0_0_0_1px_var(--bitacora-filete)]">
                  <img src={url} alt="" className="size-full object-cover" />
                  <button
                    type="button"
                    aria-label="Quitar foto"
                    onClick={() => setFotos(fotos.filter((_, otro) => otro !== indice))}
                    className="absolute top-1.5 right-1.5 flex size-6 cursor-pointer items-center justify-center rounded-full bg-black/65 text-white transition-transform hover:scale-110"
                  >
                    <Icono nombre="close" className="text-sm" />
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={() => entradaFotos.current?.click()}
                aria-label="Añadir más fotos"
                className="flex aspect-square cursor-pointer items-center justify-center rounded-[16px] bg-panel text-texto-tenue transition-colors hover:bg-[var(--mind-variante)]"
              >
                <Icono nombre="add_photo_alternate" className="text-2xl" />
              </button>
            </div>
          )}
          <input
            ref={entradaFotos}
            type="file"
            hidden
            multiple
            accept="image/png,image/jpeg,image/webp"
            onChange={(evento) => {
              setFotos([...fotos, ...(evento.target.files === null ? [] : [...evento.target.files])])
              evento.target.value = ''
            }}
          />
          <Botonera>
            <BotonMind variante="tenue" icono="arrow_back" onClick={() => setPaso('archivo')}>
              Atrás
            </BotonMind>
            <BotonMind onClick={() => setPaso('resumen')}>
              {fotos.length === 0 ? 'Omitir' : 'Continuar'} <Icono nombre="arrow_forward" className="text-lg" />
            </BotonMind>
          </Botonera>
        </>
      ) : null}

      {paso === 'resumen' ? (
        <>
          <span className="text-[36px] leading-none font-semibold">Resumen</span>
          <div className="flex w-full max-w-md flex-col gap-2 text-left">
            <Linea icono="event" titulo={nueva ? sesionNueva.titulo : (elegida?.titulo ?? '')}>
              {nueva
                ? `Sesión nueva · ${fecha(sesionNueva.fecha)}, ${sesionNueva.hora}`
                : `${elegida?.ponente ?? ''} · ${elegida?.horaInicio === null ? 'sin hora' : `${fecha(elegida?.fecha ?? '')}, ${elegida?.horaInicio ?? ''}`}`}
            </Linea>
            <Linea icono={tipo === null ? 'draft' : ETIQUETA_DE_TIPO[tipo].icono} titulo={archivo?.name ?? ''}>
              {tipo === null ? '' : ETIQUETA_DE_TIPO[tipo].etiqueta}
            </Linea>
            <Linea icono="photo_library" titulo={fotos.length === 0 ? 'Sin fotos' : `${fotos.length} ${fotos.length === 1 ? 'foto' : 'fotos'}`}>
              Fotos de la sesión
            </Linea>
          </div>
          {error === null ? null : (
            <p className="w-full max-w-md rounded-2xl bg-[var(--tono-rojo)] px-4 py-3 text-sm [color:var(--tono-rojo-texto)]">{error}</p>
          )}
          <Botonera>
            <BotonMind variante="tenue" icono="arrow_back" onClick={() => setPaso('fotos')}>
              Atrás
            </BotonMind>
            <BotonMind onClick={() => void subir()}>
              Subir y transcribir <Icono nombre="upload" className="text-lg" />
            </BotonMind>
          </Botonera>
        </>
      ) : null}

      {paso === 'subiendo' ? (
        <div className="flex w-full max-w-md flex-col items-center gap-4 py-10">
          <span className="size-10 animate-spin rounded-full border-[3px] border-filete border-t-acento" />
          <span className="text-xl">{fase}</span>
          {avance === null ? null : (
            <span className="h-1.5 w-full overflow-hidden rounded-full bg-panel">
              <span className="block h-full rounded-full bg-acento transition-[width]" style={{ width: `${Math.round(avance * 100)}%` }} />
            </span>
          )}
        </div>
      ) : null}

      {paso === 'hecho' ? (
        <>
          <span className="flex size-14 items-center justify-center rounded-full bg-acento text-acento-contraste">
            <Icono nombre="check" className="text-3xl" />
          </span>
          <span className="text-[36px] leading-none font-semibold">Grabación subida</span>
          <p className="max-w-sm text-texto-tenue">
            {enDemostracion()
              ? 'Modo demostración: el recorrido es el real, pero no se guardó nada ni se va a transcribir. Apágalo en Ajustes para trabajar de verdad.'
              : 'Ya se está transcribiendo. En Ponencias verás su avance en la fila de la sesión; puedes cerrar esto y seguir trabajando.'}
          </p>
          <BotonMind variante="tenue" onClick={alTerminar} className="w-full max-w-sm justify-center">
            Salir
          </BotonMind>
        </>
      ) : null}
    </div>
  )
}

function SesionNueva({
  datos,
  dias,
  valores,
  alCambiar,
}: {
  datos: DatosDelEvento
  dias: readonly string[]
  valores: { titulo: string; ponente: string; fecha: string; hora: string; minutos: number }
  alCambiar: (cambios: Partial<{ titulo: string; ponente: string; fecha: string; hora: string; minutos: number }>) => void
}): ReactElement {
  return (
    <div className="flex flex-col gap-4 rounded-[20px] bg-panel p-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-texto-tenue">Título</span>
        <input
          value={valores.titulo}
          onChange={(evento) => alCambiar({ titulo: evento.target.value })}
          className="h-12 rounded-2xl bg-fondo px-4 text-base outline-none shadow-[0_0_0_1px_var(--bitacora-filete-fuerte)]"
        />
      </label>
      <SelectorDePonente ponentes={datos.ponentes} valor={valores.ponente} alCambiar={(nombre) => alCambiar({ ponente: nombre })} />
      <div className="flex flex-wrap gap-2">
        {dias.map((dia) => (
          <Chip key={dia} elegido={valores.fecha === dia} onClick={() => alCambiar({ fecha: dia })}>
            <span className="capitalize">{DIA.format(new Date(`${dia}T12:00:00`))}</span>
          </Chip>
        ))}
      </div>
      <div className="relative z-10 grid grid-cols-2 items-end gap-3">
        <SelectorDeHora rotulo="Empieza" valor={valores.hora} alCambiar={(hora) => alCambiar({ hora })} />
        <div className="flex flex-wrap gap-2 pb-1.5">
          {[30, 60, 90, 120].map((minutos) => (
            <Chip key={minutos} elegido={valores.minutos === minutos} onClick={() => alCambiar({ minutos })}>
              {minutos < 60 ? `${minutos} min` : `${minutos / 60} h`}
            </Chip>
          ))}
        </div>
      </div>
    </div>
  )
}

function Cabecera({ icono, titulo, texto }: { icono: string; titulo: string; texto: string }): ReactElement {
  return (
    <div className="flex flex-col items-center gap-3">
      <Icono nombre={icono} className="text-[44px]" />
      <span className="text-[36px] leading-none font-semibold">{titulo}</span>
      <p className="max-w-md text-xl text-texto-tenue">{texto}</p>
    </div>
  )
}

function Botonera({ children }: { children: ReactNode }): ReactElement {
  return <div className="flex w-full max-w-md items-center justify-between gap-2">{children}</div>
}

function Linea({ icono, titulo, children }: { icono: string; titulo: string; children: ReactNode }): ReactElement {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-panel px-4 py-3">
      <Icono nombre={icono} className="text-xl" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{titulo}</span>
        <span className="truncate text-sm text-texto-tenue">{children}</span>
      </span>
    </div>
  )
}
