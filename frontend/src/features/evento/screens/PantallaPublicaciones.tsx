import type { ReactElement } from 'react'
import { useMemo, useRef, useState } from 'react'
import { Modal } from '@/shared/ui'
import { useSession } from '@/features/auth/session'
import { CargaDelEvento } from '../components/CargaDelEvento'
import { Filtros } from '../components/Filtros'
import { EncabezadoDePagina, Estado, Icono, Tarjeta } from '../components/piezas'
import { CONSENTIMIENTO, ESTADO_DE_PUBLICACION, RED, autorizanTodos, fecha, fechaYHora, mismoPonente } from '../formato'
import { crearPublicacion } from '../repositorio'
import { useEvento } from '../useEvento'
import type { DatosDelEvento, Publicacion } from '../tipos'

/*
  Lo que sale en las redes del evento.

  Arriba, publicaciones recomendadas armadas con el material que hay: el
  primer día, el agradecimiento a los ponentes, y una por sesión con una
  cita del ponente ya verificada en los artículos. Abajo, las piezas ya
  preparadas, por día.

  Todo respeta la autorización: de quien no autorizó difundir en redes, o
  todavía no respondió, no se propone nada ni se le nombra. Quiénes son se
  consulta desde el encabezado, no en una franja fija: es una nota de
  trabajo, no lo primero que hay que leer.
*/
export function PantallaPublicaciones(): ReactElement {
  return <CargaDelEvento>{(datos) => <Redes datos={datos} />}</CargaDelEvento>
}

type Recomendada = {
  readonly id: string
  readonly titulo: string
  readonly texto: string
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
  const [viendoPermisos, setViendoPermisos] = useState(false)
  const botonPermisos = useRef<HTMLButtonElement>(null)
  const conRedes = useMemo(
    () => datos.ponentes.filter((ponente) => ponente.consentimiento === 'aceptado' && ponente.usos.redes === true),
    [datos.ponentes],
  )
  const sinPermiso = datos.ponentes.filter(
    (ponente) =>
      datos.ponencias.some((ponencia) => mismoPonente(ponencia.ponente, ponente.nombre)) &&
      !(ponente.consentimiento === 'aceptado' && ponente.usos.redes === true),
  )

  const recomendadas = useMemo((): Recomendada[] => {
    const evento = datos.evento.nombre
    const lista: Recomendada[] = []
    const dias = [...new Set(datos.ponencias.map((ponencia) => ponencia.fecha))].sort()
    const primerDia = datos.ponencias
      .filter((ponencia) => ponencia.fecha === dias[0] && ponencia.horaInicio !== null)
      .sort((una, otra) => (una.horaInicio ?? '').localeCompare(otra.horaInicio ?? ''))
    const apertura = primerDia[0]
    const siguientes = primerDia
      .slice(1)
      .filter((ponencia) => autorizanTodos(ponencia.ponente, datos.ponentes, 'redes'))
      .map((ponencia) => ponencia.ponente)
    if (apertura !== undefined) {
      lista.push({
        id: 'primer-dia',
        titulo: `Primer día de ${evento}`,
        texto: `Así arrancó ${evento}. Abrimos con «${apertura.titulo}»${
          siguientes.length > 0 ? ` y seguimos con ${listaConY(siguientes)}` : ''
        }. Gracias a quienes nos acompañaron en esta primera jornada.`,
        cita: '',
        ponente: '',
        idConferencia: null,
      })
    }
    lista.push({
      id: 'gracias',
      titulo: 'Agradecer a todos los ponentes',
      texto: `Gracias a quienes hicieron posible ${evento}. A ${listaConY(conRedes.map((ponente) => ponente.nombre))}, por compartir lo que saben y abrir conversaciones que nos llevamos para seguir pensando.`,
      cita: '',
      ponente: '',
      idConferencia: null,
    })
    for (const ponencia of datos.ponencias) {
      const cita = datos.producciones.flatMap((produccion) => produccion.evidencias).find((evidencia) => evidencia.idConferencia === ponencia.id)
      if (cita === undefined || !autorizanTodos(ponencia.ponente, datos.ponentes, 'redes')) {
        continue
      }
      lista.push({
        id: ponencia.id,
        titulo: `Agradecer a ${ponencia.ponente}`,
        texto: `«${cita.texto}» — ${ponencia.ponente} en ${evento}. Gracias por «${ponencia.titulo}».`,
        cita: cita.texto,
        ponente: ponencia.ponente,
        idConferencia: ponencia.id,
      })
    }
    return lista
  }, [datos, conRedes])

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
        {sinPermiso.length === 0 ? null : (
          <button
            ref={botonPermisos}
            type="button"
            onClick={() => setViendoPermisos(true)}
            className="flex h-10 cursor-pointer items-center gap-2 rounded-full bg-[var(--tono-ambar)] px-4 text-sm font-medium [color:var(--tono-ambar-texto)] transition-opacity hover:opacity-85"
          >
            <Icono nombre="shield_person" className="text-lg" />
            {sinPermiso.length} sin permiso para redes
          </button>
        )}
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
      </EncabezadoDePagina>

      <Modal
        abierto={viendoPermisos}
        alCerrar={() => setViendoPermisos(false)}
        titulo="Sin permiso para redes"
        anclaje="disparador"
        anclaEn={botonPermisos}
        ancho="normal"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed text-texto-tenue">
            De estas personas no se propone ninguna pieza ni se las nombra: no autorizaron difundir en redes o todavía no han respondido.
          </p>
          <ul className="flex flex-col gap-1">
            {sinPermiso.map((ponente) => (
              <li key={ponente.id} className="flex items-center justify-between gap-3 rounded-[16px] bg-[var(--mind-neutro)] px-4 py-3">
                <span className="truncate font-medium">{ponente.nombre}</span>
                {/* Quien autorizó otros usos pero no redes no puede salir como "Autorizó": es justo lo que no hizo. */}
                <Estado {...(ponente.consentimiento === 'aceptado' ? { etiqueta: 'No autorizó redes', tono: 'rojo' as const } : CONSENTIMIENTO[ponente.consentimiento])} />
              </li>
            ))}
          </ul>
        </div>
      </Modal>

      <section className="flex flex-col gap-2">
        <h2 className="px-1 text-2xl font-medium">Recomendadas</h2>
        <div className="entrar-escalonado grid grid-cols-2 gap-2">
          {recomendadas.map((recomendada) => (
            <TarjetaRecomendada
              key={recomendada.id}
              recomendada={recomendada}
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
}: {
  recomendada: Recomendada
  alAnadir: () => Promise<boolean>
}): ReactElement {
  const [anadida, setAnadida] = useState(false)
  const [copiado, setCopiado] = useState(false)
  return (
    <Tarjeta className="flex gap-4 p-4">
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
