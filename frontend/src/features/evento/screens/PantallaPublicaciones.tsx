import type { ReactElement } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from '@/features/auth/session'
import { CargaDelEvento } from '../components/CargaDelEvento'
import { Filtros } from '../components/Filtros'
import { MiniaturaDeFoto, useFotos } from '../components/GaleriaDeFotos'
import { BotonMind, EncabezadoDePagina, Estado, Icono, Tarjeta } from '../components/piezas'
import { ESTADO_DE_PUBLICACION, RED, fecha, fechaYHora, mismoPonente } from '../formato'
import {
  carpetaDeFotosDeSesion,
  carpetaDeFotosDelEvento,
  crearPublicacion,
  listarFotos,
  subirFoto,
} from '../repositorio'
import type { Foto } from '../repositorio'
import { useEvento } from '../useEvento'
import type { DatosDelEvento, Ponencia, Publicacion } from '../tipos'

/*
  Lo que sale en las redes del evento.

  Arriba, un carrusel con todas las fotos —las del evento y las que se
  subieron con cada sesión— y, para la foto elegida, publicaciones
  propuestas con esa foto: el agradecimiento al ponente con una cita suya ya
  verificada en los artículos, o el agradecimiento general si es del evento.
  Abajo, las piezas ya preparadas, por día.

  Todo respeta la autorización: de quien no autorizó difundir en redes, o
  todavía no respondió, no se propone nada, no se le nombra y sus fotos no
  entran al carrusel.
*/
export function PantallaPublicaciones(): ReactElement {
  return <CargaDelEvento>{(datos) => <Redes datos={datos} />}</CargaDelEvento>
}

type FotoDelCarrusel = { readonly foto: Foto; readonly sesion: Ponencia | null }

type Sugerencia = {
  readonly id: string
  readonly titulo: string
  readonly texto: string
  readonly cita: string
  readonly ponente: string
  readonly idConferencia: string | null
}

function listaConY(nombres: readonly string[]): string {
  return nombres.length <= 1
    ? (nombres[0] ?? '')
    : `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1) ?? ''}`
}

function Redes({ datos }: { datos: DatosDelEvento }): ReactElement {
  const { usuario } = useSession()
  const { invalidar } = useEvento()
  const [red, setRed] = useState('todas')
  const [estado, setEstado] = useState('todos')
  const idDueno = usuario?.id ?? ''
  const carpetaDelEvento = carpetaDeFotosDelEvento(idDueno, datos.evento.nombre)
  const { fotos: fotosDelEvento, recargar } = useFotos(carpetaDelEvento)
  const [fotosPorSesion, setFotosPorSesion] = useState<Record<string, readonly Foto[]>>({})
  const [elegida, setElegida] = useState<string | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const entrada = useRef<HTMLInputElement>(null)

  const conRedes = useMemo(
    () =>
      datos.ponentes.filter(
        (ponente) => ponente.consentimiento === 'aceptado' && ponente.usos.redes === true,
      ),
    [datos.ponentes],
  )
  const sinPermiso = datos.ponentes.filter(
    (ponente) =>
      datos.ponencias.some((ponencia) => mismoPonente(ponencia.ponente, ponente.nombre)) &&
      !(ponente.consentimiento === 'aceptado' && ponente.usos.redes === true),
  )

  useEffect(() => {
    let vigente = true
    const autorizadas = datos.ponencias.filter((ponencia) =>
      conRedes.some((ponente) => mismoPonente(ponencia.ponente, ponente.nombre)),
    )
    void Promise.all(
      autorizadas.map(
        async (ponencia) =>
          [
            ponencia.id,
            await listarFotos(carpetaDeFotosDeSesion(ponencia.idDueno, ponencia.id)),
          ] as const,
      ),
    ).then((pares) => {
      if (vigente) {
        setFotosPorSesion(Object.fromEntries(pares))
      }
    })
    return () => {
      vigente = false
    }
  }, [datos.ponencias, conRedes])

  const carrusel: FotoDelCarrusel[] = useMemo(
    () => [
      ...(fotosDelEvento ?? []).map((foto) => ({ foto, sesion: null })),
      ...datos.ponencias.flatMap((ponencia) =>
        (fotosPorSesion[ponencia.id] ?? []).map((foto) => ({ foto, sesion: ponencia })),
      ),
    ],
    [fotosDelEvento, fotosPorSesion, datos.ponencias],
  )
  const actual = carrusel.find((item) => item.foto.ruta === elegida) ?? carrusel[0] ?? null

  /* Lo que se puede publicar con la foto elegida. */
  const sugerencias = useMemo((): Sugerencia[] => {
    if (actual === null) {
      return []
    }
    const evento = datos.evento.nombre
    if (actual.sesion === null) {
      const horas = Math.round(
        datos.ponencias.reduce((suma, ponencia) => suma + ponencia.duracionEnSegundos, 0) / 3600,
      )
      return [
        {
          id: 'gracias',
          titulo: 'Agradecer a todos los ponentes',
          texto: `Gracias a quienes hicieron posible ${evento}. A ${listaConY(conRedes.map((ponente) => ponente.nombre))}, por compartir lo que saben y abrir conversaciones que nos llevamos para seguir pensando.`,
          cita: '',
          ponente: '',
          idConferencia: null,
        },
        {
          id: 'cifras',
          titulo: 'El evento en cifras',
          texto: `${evento} en cifras: ${datos.ponencias.length} sesiones, ${horas} horas de conversación y ${datos.evento.ejes.length} ejes temáticos. Gracias a todos los que se conectaron.`,
          cita: '',
          ponente: '',
          idConferencia: null,
        },
      ]
    }
    const sesion = actual.sesion
    const citas = datos.producciones
      .flatMap((produccion) => produccion.evidencias)
      .filter((evidencia) => evidencia.idConferencia === sesion.id)
    const lista: Sugerencia[] = [
      {
        id: `gracias-${sesion.id}`,
        titulo: `Agradecer a ${sesion.ponente}`,
        texto: `Gracias, ${sesion.ponente}, por «${sesion.titulo}» en ${evento}.`,
        cita: '',
        ponente: sesion.ponente,
        idConferencia: sesion.id,
      },
    ]
    const cita = citas[0]
    if (cita !== undefined) {
      lista.push({
        id: `cita-${sesion.id}`,
        titulo: 'Foto con una cita suya',
        texto: `«${cita.texto}» — ${sesion.ponente} en ${evento}, sobre ${sesion.titulo.toLowerCase()}.`,
        cita: cita.texto,
        ponente: sesion.ponente,
        idConferencia: sesion.id,
      })
    }
    return lista
  }, [actual, datos, conRedes])

  const subir = async (lista: FileList): Promise<void> => {
    setSubiendo(true)
    for (const archivo of [...lista]) {
      await subirFoto(carpetaDelEvento, archivo)
    }
    setSubiendo(false)
    await recargar()
  }

  const visibles = datos.publicaciones.filter(
    (publicacion) =>
      (red === 'todas' || publicacion.red === red) &&
      (estado === 'todos' || publicacion.estado === estado),
  )
  const porDia = useMemo(() => {
    const dias = new Map<string, Publicacion[]>()
    for (const publicacion of visibles) {
      const dia = publicacion.programadaPara?.slice(0, 10) ?? 'sin-fecha'
      dias.set(dia, [...(dias.get(dia) ?? []), publicacion])
    }
    return [...dias.entries()]
  }, [visibles])

  return (
    <div className="flex flex-col gap-4">
      <EncabezadoDePagina titulo="Redes">
        <Filtros
          grupos={[
            {
              clave: 'red',
              rotulo: 'Red',
              icono: 'share',
              valor: red,
              porDefecto: 'todas',
              alCambiar: setRed,
              opciones: [
                { valor: 'todas', etiqueta: 'Todas' },
                ...(['linkedin', 'instagram', 'x'] as const).map((una) => ({
                  valor: una,
                  etiqueta: RED[una].etiqueta,
                })),
              ],
            },
            {
              clave: 'estado',
              rotulo: 'Estado',
              icono: 'event_available',
              valor: estado,
              porDefecto: 'todos',
              alCambiar: setEstado,
              opciones: [
                { valor: 'todos', etiqueta: 'Todos' },
                ...(['propuesta', 'aprobada', 'programada', 'publicada'] as const).map((uno) => ({
                  valor: uno,
                  etiqueta: ESTADO_DE_PUBLICACION[uno].etiqueta,
                })),
              ],
            },
          ]}
        />
        <BotonMind
          icono="add_photo_alternate"
          disabled={subiendo}
          onClick={() => entrada.current?.click()}
        >
          {subiendo ? 'Subiendo…' : 'Fotos del evento'}
        </BotonMind>
        <input
          ref={entrada}
          type="file"
          hidden
          multiple
          accept="image/png,image/jpeg,image/webp"
          onChange={(evento) => {
            if (evento.target.files !== null && evento.target.files.length > 0) {
              void subir(evento.target.files)
            }
            evento.target.value = ''
          }}
        />
      </EncabezadoDePagina>

      {sinPermiso.length === 0 ? null : (
        <div className="flex items-center gap-3 rounded-[20px] bg-[var(--tono-ambar)] px-5 py-3 [color:var(--tono-ambar-texto)]">
          <Icono nombre="shield_person" className="text-xl" />
          <span className="text-sm">
            Sin piezas ni fotos de {listaConY(sinPermiso.map((ponente) => ponente.nombre))}: no{' '}
            {sinPermiso.length === 1 ? 'autorizó' : 'autorizaron'} difundir en redes o no{' '}
            {sinPermiso.length === 1 ? 'ha' : 'han'} respondido.
          </span>
        </div>
      )}

      {/* El carrusel con todas las fotos: las del evento primero, luego las de cada sesión. */}
      <Tarjeta className="flex flex-col gap-4 p-4">
        <span className="px-2 pt-2 text-2xl">Fotos</span>
        {carrusel.length === 0 ? (
          <button
            type="button"
            onClick={() => entrada.current?.click()}
            className="flex cursor-pointer flex-col items-center gap-2 rounded-[20px] border-2 border-dashed border-filete-fuerte px-6 py-10 text-texto-tenue transition-colors hover:bg-panel"
          >
            <Icono nombre="photo_library" className="text-4xl" />
            <span>Sube fotos del evento, o añádelas a cada sesión al subir su grabación.</span>
          </button>
        ) : (
          <ul className="flex snap-x gap-2 overflow-x-auto pb-2">
            {carrusel.map((item) => {
              const activa = item.foto.ruta === actual?.foto.ruta
              return (
                <li key={item.foto.ruta} className="w-44 shrink-0 snap-start">
                  <button
                    type="button"
                    onClick={() => setElegida(item.foto.ruta)}
                    className={`flex w-full cursor-pointer flex-col gap-2 rounded-[20px] p-1.5 text-left transition-colors ${activa ? 'bg-acento text-acento-contraste' : 'hover:bg-panel'}`}
                  >
                    <MiniaturaDeFoto
                      ruta={item.foto.ruta}
                      className="aspect-square rounded-[16px]"
                    />
                    <span className="truncate px-1.5 pb-1 text-xs font-medium">
                      {item.sesion === null ? datos.evento.nombre : item.sesion.ponente}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Tarjeta>

      {actual === null ? null : (
        <div className="entrar-escalonado grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
          <Tarjeta className="flex flex-col gap-3 p-4">
            <MiniaturaDeFoto ruta={actual.foto.ruta} className="aspect-[4/3] rounded-[20px]" />
            <span className="px-2 text-sm text-texto-tenue">
              {actual.sesion === null
                ? `Foto del evento · ${datos.evento.nombre}`
                : `${actual.sesion.titulo} · ${actual.sesion.ponente}`}
            </span>
          </Tarjeta>
          <Tarjeta className="flex flex-col gap-3">
            <span className="text-2xl">Para esta foto</span>
            <ul className="flex flex-col gap-2">
              {sugerencias.map((sugerencia) => (
                <FilaDeSugerencia
                  key={sugerencia.id}
                  sugerencia={sugerencia}
                  alAnadir={async () => {
                    const resultado = await crearPublicacion(idDueno, datos.evento.nombre, {
                      red: 'instagram',
                      formato: sugerencia.cita === '' ? 'anuncio' : 'cita',
                      texto: sugerencia.texto,
                      cita: sugerencia.cita,
                      ponente: sugerencia.ponente,
                      idConferencia: sugerencia.idConferencia,
                    })
                    if (resultado.ok) {
                      invalidar()
                    }
                    return resultado.ok
                  }}
                />
              ))}
            </ul>
          </Tarjeta>
        </div>
      )}

      <div className="entrar-escalonado flex flex-col gap-5">
        {porDia.map(([dia, publicaciones]) => (
          <section key={dia} className="flex flex-col gap-2">
            <h2 className="px-1 text-2xl font-medium">
              {dia === 'sin-fecha' ? 'Sin programar' : fecha(dia)}
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {publicaciones.map((publicacion) => (
                <Pieza
                  key={publicacion.id}
                  publicacion={publicacion}
                  evento={datos.evento.nombre}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function FilaDeSugerencia({
  sugerencia,
  alAnadir,
}: {
  sugerencia: Sugerencia
  alAnadir: () => Promise<boolean>
}): ReactElement {
  const [anadida, setAnadida] = useState(false)
  const [copiado, setCopiado] = useState(false)
  return (
    <li className="flex flex-col gap-3 rounded-[20px] bg-panel p-4">
      <span className="text-[15px] font-semibold">{sugerencia.titulo}</span>
      <p className="text-sm leading-relaxed">{sugerencia.texto}</p>
      <span className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(sugerencia.texto)
            setCopiado(true)
            window.setTimeout(() => setCopiado(false), 1600)
          }}
          className="flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-[var(--mind-neutro)] px-3 text-xs font-medium"
        >
          <Icono nombre={copiado ? 'check' : 'content_copy'} className="text-base" />
          {copiado ? 'Copiado' : 'Copiar texto'}
        </button>
        <button
          type="button"
          disabled={anadida}
          onClick={() => void alAnadir().then(setAnadida)}
          className="flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-acento px-3 text-xs font-medium text-acento-contraste disabled:opacity-50"
        >
          <Icono nombre={anadida ? 'check' : 'add'} className="text-base" />
          {anadida ? 'Añadida a las piezas' : 'Añadir a las piezas'}
        </button>
      </span>
    </li>
  )
}

/*
  La tarjeta de la pieza como imagen de 1080×1080, dibujada en un lienzo con
  la misma tipografía de la app: es lo que se sube a la red junto al texto.
*/
function partirEnLineas(
  contexto: CanvasRenderingContext2D,
  texto: string,
  ancho: number,
): string[] {
  const lineas: string[] = []
  let actual = ''
  for (const palabra of texto.split(' ')) {
    const prueba = actual === '' ? palabra : `${actual} ${palabra}`
    if (contexto.measureText(prueba).width > ancho && actual !== '') {
      lineas.push(actual)
      actual = palabra
    } else {
      actual = prueba
    }
  }
  if (actual !== '') {
    lineas.push(actual)
  }
  return lineas
}

async function descargarTarjeta(publicacion: Publicacion, evento: string): Promise<void> {
  const lienzo = document.createElement('canvas')
  lienzo.width = 1080
  lienzo.height = 1080
  const contexto = lienzo.getContext('2d')
  if (contexto === null) {
    return
  }
  await document.fonts.ready
  contexto.fillStyle = '#000000'
  contexto.fillRect(0, 0, 1080, 1080)
  contexto.fillStyle = 'rgba(255,255,255,0.6)'
  contexto.font = '500 30px "DM Sans Variable", sans-serif'
  contexto.fillText(evento.toUpperCase(), 96, 140)

  const cita =
    publicacion.cita === '' ? (publicacion.texto.split('.')[0] ?? '') : `“${publicacion.cita}”`
  contexto.fillStyle = '#ffffff'
  contexto.font = '600 62px "DM Sans Variable", sans-serif'
  const lineas = partirEnLineas(contexto, cita, 888).slice(0, 9)
  const alto = lineas.length * 80
  lineas.forEach((linea, indice) => contexto.fillText(linea, 96, 540 - alto / 2 + indice * 80))

  contexto.fillStyle = 'rgba(255,255,255,0.75)'
  contexto.font = '500 34px "DM Sans Variable", sans-serif'
  contexto.fillText(publicacion.ponente || evento, 96, 960)

  const blob = await new Promise<Blob | null>((resolver) => lienzo.toBlob(resolver, 'image/png'))
  if (blob === null) {
    return
  }
  const enlace = document.createElement('a')
  enlace.href = URL.createObjectURL(blob)
  enlace.download = `${evento}-${publicacion.red}-${publicacion.id.slice(0, 6)}.png`
  enlace.click()
  URL.revokeObjectURL(enlace.href)
}

function Pieza({
  publicacion,
  evento,
}: {
  publicacion: Publicacion
  evento: string
}): ReactElement {
  const [copiado, setCopiado] = useState(false)
  const boton =
    'flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-[var(--mind-neutro)] px-3 text-xs font-medium transition-colors hover:bg-[var(--mind-variante)]'

  return (
    <Tarjeta className="flex gap-5 p-5">
      <div className="flex aspect-square w-44 shrink-0 flex-col justify-between rounded-[20px] bg-black p-5 text-white">
        <span className="text-[10px] tracking-wide uppercase opacity-60">{evento}</span>
        <span className="line-clamp-6 text-[14px] leading-snug font-semibold">
          {publicacion.cita === '' ? publicacion.texto.split('.')[0] : `“${publicacion.cita}”`}
        </span>
        <span className="truncate text-xs opacity-75">{publicacion.ponente || evento}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-medium">
            <Icono nombre={RED[publicacion.red].icono} className="text-lg" />
            {RED[publicacion.red].etiqueta}
            <span className="truncate font-normal text-texto-tenue">
              · {fechaYHora(publicacion.programadaPara)}
            </span>
          </span>
          <Estado {...ESTADO_DE_PUBLICACION[publicacion.estado]} />
        </div>
        <p className="line-clamp-6 text-[15px] leading-relaxed">{publicacion.texto}</p>
        <div className="mt-auto flex flex-wrap gap-2">
          <button
            type="button"
            className={boton}
            onClick={() => {
              void navigator.clipboard?.writeText(publicacion.texto)
              setCopiado(true)
              window.setTimeout(() => setCopiado(false), 1600)
            }}
          >
            <Icono nombre={copiado ? 'check' : 'content_copy'} className="text-base" />
            {copiado ? 'Copiado' : 'Copiar texto'}
          </button>
          <button
            type="button"
            className={boton}
            onClick={() => void descargarTarjeta(publicacion, evento)}
          >
            <Icono nombre="download" className="text-base" />
            Descargar imagen
          </button>
        </div>
      </div>
    </Tarjeta>
  )
}
