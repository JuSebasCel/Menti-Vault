import type { ReactElement } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from '@/features/auth/session'
import { CargaDelEvento } from '../components/CargaDelEvento'
import { Filtros } from '../components/Filtros'
import { MiniaturaDeFoto, useFotos } from '../components/GaleriaDeFotos'
import { EncabezadoDePagina, Estado, Icono, Tarjeta } from '../components/piezas'
import { ESTADO_DE_PUBLICACION, RED, fecha, fechaYHora, mismoPonente } from '../formato'
import { carpetaDeFotosDeSesion, carpetaDeFotosDelEvento, crearPublicacion, eliminarFoto, listarFotos, subirFoto } from '../repositorio'
import type { Foto } from '../repositorio'
import { useEvento } from '../useEvento'
import type { DatosDelEvento, Ponencia, Publicacion } from '../tipos'

/*
  Lo que sale en las redes del evento.

  Arriba, publicaciones recomendadas armadas con el material que hay: el
  primer día con una foto del evento, el agradecimiento a los ponentes, y una
  por sesión con su foto y una cita del ponente ya verificada en los
  artículos. Las fotos en sí quedan escondidas detrás de "Ver fotos": son
  material de trabajo, no el centro de la pantalla. Abajo, las piezas ya
  preparadas, por día.

  Todo respeta la autorización: de quien no autorizó difundir en redes, o
  todavía no respondió, no se propone nada, no se le nombra y sus fotos no
  se usan.
*/
export function PantallaPublicaciones(): ReactElement {
  return <CargaDelEvento>{(datos) => <Redes datos={datos} />}</CargaDelEvento>
}

type FotoDelCarrusel = { readonly foto: Foto; readonly sesion: Ponencia | null }

type Recomendada = {
  readonly id: string
  readonly titulo: string
  readonly texto: string
  readonly foto: Foto | null
  readonly cita: string
  readonly ponente: string
  readonly idConferencia: string | null
}

function listaConY(nombres: readonly string[]): string {
  return nombres.length <= 1 ? (nombres[0] ?? '') : `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1) ?? ''}`
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
  const [viendoFotos, setViendoFotos] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const entrada = useRef<HTMLInputElement>(null)

  const conRedes = useMemo(
    () => datos.ponentes.filter((ponente) => ponente.consentimiento === 'aceptado' && ponente.usos.redes === true),
    [datos.ponentes],
  )
  const sinPermiso = datos.ponentes.filter(
    (ponente) =>
      datos.ponencias.some((ponencia) => mismoPonente(ponencia.ponente, ponente.nombre)) &&
      !(ponente.consentimiento === 'aceptado' && ponente.usos.redes === true),
  )

  useEffect(() => {
    let vigente = true
    const autorizadas = datos.ponencias.filter((ponencia) => conRedes.some((ponente) => mismoPonente(ponencia.ponente, ponente.nombre)))
    void Promise.all(
      autorizadas.map(async (ponencia) => [ponencia.id, await listarFotos(carpetaDeFotosDeSesion(ponencia.idDueno, ponencia.id))] as const),
    ).then((pares) => {
      if (vigente) {
        setFotosPorSesion(Object.fromEntries(pares))
      }
    })
    return () => {
      vigente = false
    }
  }, [datos.ponencias, conRedes])

  /* Quitar una foto se ve en el acto: la del evento se vuelve a listar y la de una sesión se saca del estado, sin volver a pedir todas. */
  const quitarFoto = async (item: FotoDelCarrusel): Promise<void> => {
    await eliminarFoto(item.foto.ruta)
    if (item.sesion === null) {
      await recargar()
      return
    }
    const idSesion = item.sesion.id
    setFotosPorSesion((antes) => ({ ...antes, [idSesion]: (antes[idSesion] ?? []).filter((foto) => foto.ruta !== item.foto.ruta) }))
  }

  const carrusel: FotoDelCarrusel[] = useMemo(
    () => [
      ...(fotosDelEvento ?? []).map((foto) => ({ foto, sesion: null })),
      ...datos.ponencias.flatMap((ponencia) => (fotosPorSesion[ponencia.id] ?? []).map((foto) => ({ foto, sesion: ponencia }))),
    ],
    [fotosDelEvento, fotosPorSesion, datos.ponencias],
  )

  const recomendadas = useMemo((): Recomendada[] => {
    const evento = datos.evento.nombre
    const fotosEvento = fotosDelEvento ?? []
    const lista: Recomendada[] = []
    const dias = [...new Set(datos.ponencias.map((ponencia) => ponencia.fecha))].sort()
    const primerDia = datos.ponencias
      .filter((ponencia) => ponencia.fecha === dias[0] && ponencia.horaInicio !== null)
      .sort((una, otra) => (una.horaInicio ?? '').localeCompare(otra.horaInicio ?? ''))
    const apertura = primerDia[0]
    const siguientes = primerDia
      .slice(1)
      .filter((ponencia) => conRedes.some((ponente) => mismoPonente(ponencia.ponente, ponente.nombre)))
      .map((ponencia) => ponencia.ponente)
    if (apertura !== undefined) {
      lista.push({
        id: 'primer-dia',
        titulo: `Primer día de ${evento}`,
        texto: `Así arrancó ${evento}. Abrimos con «${apertura.titulo}»${
          siguientes.length > 0 ? ` y seguimos con ${listaConY(siguientes)}` : ''
        }. Gracias a quienes nos acompañaron en esta primera jornada.`,
        foto: fotosEvento[0] ?? null,
        cita: '',
        ponente: '',
        idConferencia: null,
      })
    }
    lista.push({
      id: 'gracias',
      titulo: 'Agradecer a todos los ponentes',
      texto: `Gracias a quienes hicieron posible ${evento}. A ${listaConY(conRedes.map((ponente) => ponente.nombre))}, por compartir lo que saben y abrir conversaciones que nos llevamos para seguir pensando.`,
      foto: fotosEvento[1] ?? fotosEvento[0] ?? null,
      cita: '',
      ponente: '',
      idConferencia: null,
    })
    for (const ponencia of datos.ponencias) {
      const foto = fotosPorSesion[ponencia.id]?.[0]
      if (foto === undefined) {
        continue
      }
      const cita = datos.producciones.flatMap((produccion) => produccion.evidencias).find((evidencia) => evidencia.idConferencia === ponencia.id)
      lista.push({
        id: ponencia.id,
        titulo: `Agradecer a ${ponencia.ponente}`,
        texto:
          cita === undefined
            ? `Gracias, ${ponencia.ponente}, por «${ponencia.titulo}» en ${evento}.`
            : `«${cita.texto}» — ${ponencia.ponente} en ${evento}. Gracias por «${ponencia.titulo}».`,
        foto,
        cita: cita?.texto ?? '',
        ponente: ponencia.ponente,
        idConferencia: ponencia.id,
      })
    }
    return lista
  }, [datos, conRedes, fotosDelEvento, fotosPorSesion])

  const subir = async (lista: FileList): Promise<void> => {
    setSubiendo(true)
    for (const archivo of [...lista]) {
      await subirFoto(carpetaDelEvento, archivo)
    }
    setSubiendo(false)
    await recargar()
  }

  const visibles = datos.publicaciones.filter(
    (publicacion) => (red === 'todas' || publicacion.red === red) && (estado === 'todos' || publicacion.estado === estado),
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
        <button
          type="button"
          onClick={() => setViendoFotos(!viendoFotos)}
          aria-expanded={viendoFotos}
          className="flex h-10 cursor-pointer items-center gap-2 rounded-full bg-[var(--mind-neutro)] px-4 text-sm font-medium transition-colors hover:bg-[var(--mind-variante)]"
        >
          <Icono nombre="photo_library" className="text-lg" />
          {viendoFotos ? 'Ocultar fotos' : `Ver fotos (${carrusel.length})`}
        </button>
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
                ...(['linkedin', 'instagram', 'x'] as const).map((una) => ({ valor: una, etiqueta: RED[una].etiqueta })),
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
            {sinPermiso.length === 1 ? 'autorizó' : 'autorizaron'} difundir en redes o no {sinPermiso.length === 1 ? 'ha' : 'han'} respondido.
          </span>
        </div>
      )}

      {/* Las fotos, escondidas hasta pedirlas. */}
      {viendoFotos ? (
        <Tarjeta className="entrar-escalonado p-3">
          <ul className="flex snap-x gap-2 overflow-x-auto pb-1">
            {carrusel.map((item) => (
              <li key={item.foto.ruta} className="group relative flex w-36 shrink-0 snap-start flex-col gap-1.5">
                <MiniaturaDeFoto ruta={item.foto.ruta} className="aspect-square rounded-[16px]" />
                <button
                  type="button"
                  aria-label="Quitar foto"
                  onClick={() => void quitarFoto(item)}
                  className="absolute top-2 right-2 flex size-8 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <Icono nombre="delete" className="text-lg" />
                </button>
                <span className="truncate px-1 text-xs font-medium">{item.sesion === null ? datos.evento.nombre : item.sesion.ponente}</span>
              </li>
            ))}
            <li className="w-36 shrink-0">
              <button
                type="button"
                onClick={() => entrada.current?.click()}
                className="flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-[16px] border-2 border-dashed border-filete-fuerte text-sm text-texto-tenue transition-colors hover:bg-panel"
              >
                <Icono nombre="add_photo_alternate" className="text-2xl" />
                {subiendo ? 'Subiendo…' : 'Añadir'}
              </button>
            </li>
          </ul>
        </Tarjeta>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="px-1 text-2xl font-medium">Recomendadas</h2>
        <div className="entrar-escalonado grid grid-cols-2 gap-2">
          {recomendadas.map((recomendada) => (
            <TarjetaRecomendada
              key={recomendada.id}
              recomendada={recomendada}
              alPedirFoto={() => {
                setViendoFotos(true)
                entrada.current?.click()
              }}
              alAnadir={async () => {
                const resultado = await crearPublicacion(idDueno, datos.evento.nombre, {
                  red: 'instagram',
                  formato: recomendada.cita === '' ? 'anuncio' : 'cita',
                  texto: recomendada.texto,
                  cita: recomendada.cita,
                  ponente: recomendada.ponente,
                  idConferencia: recomendada.idConferencia,
                })
                if (resultado.ok) {
                  invalidar()
                }
                return resultado.ok
              }}
            />
          ))}
        </div>
      </section>

      <div className="entrar-escalonado flex flex-col gap-5">
        {porDia.map(([dia, publicaciones]) => (
          <section key={dia} className="flex flex-col gap-2">
            <h2 className="px-1 text-2xl font-medium">{dia === 'sin-fecha' ? 'Sin programar' : fecha(dia)}</h2>
            <div className="grid grid-cols-2 gap-2">
              {publicaciones.map((publicacion) => (
                <Pieza key={publicacion.id} publicacion={publicacion} evento={datos.evento.nombre} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function TarjetaRecomendada({
  recomendada,
  alAnadir,
  alPedirFoto,
}: {
  recomendada: Recomendada
  alAnadir: () => Promise<boolean>
  alPedirFoto: () => void
}): ReactElement {
  const [anadida, setAnadida] = useState(false)
  const [copiado, setCopiado] = useState(false)
  return (
    <Tarjeta className="flex gap-4 p-4">
      {recomendada.foto === null ? (
        <button
          type="button"
          onClick={alPedirFoto}
          aria-label="Añadir una foto"
          className="flex size-24 shrink-0 cursor-pointer items-center justify-center rounded-[16px] border-2 border-dashed border-filete-fuerte text-texto-tenue transition-colors hover:bg-panel"
        >
          <Icono nombre="add_photo_alternate" className="text-2xl" />
        </button>
      ) : (
        <MiniaturaDeFoto ruta={recomendada.foto.ruta} className="size-24 shrink-0 rounded-[16px]" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="flex items-center gap-2">
          <Icono nombre="auto_awesome" className="text-base [color:var(--tono-violeta-texto)]" />
          <span className="truncate text-[15px] font-semibold">{recomendada.titulo}</span>
        </span>
        <p className="line-clamp-3 text-sm leading-relaxed text-texto-tenue">{recomendada.texto}</p>
        <span className="mt-auto flex gap-2">
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(recomendada.texto)
              setCopiado(true)
              window.setTimeout(() => setCopiado(false), 1600)
            }}
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-full bg-[var(--mind-neutro)] px-3 text-xs font-medium"
          >
            <Icono nombre={copiado ? 'check' : 'content_copy'} className="text-base" />
            {copiado ? 'Copiado' : 'Copiar texto'}
          </button>
          <button
            type="button"
            disabled={anadida}
            onClick={() => void alAnadir().then(setAnadida)}
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-full bg-acento px-3 text-xs font-medium text-acento-contraste disabled:opacity-40"
          >
            <Icono nombre={anadida ? 'check' : 'add'} className="text-base" />
            {anadida ? 'Añadida' : 'Añadir a las piezas'}
          </button>
        </span>
      </div>
    </Tarjeta>
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
