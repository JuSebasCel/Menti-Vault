import type { ReactElement } from 'react'
import { useMemo, useRef, useState } from 'react'
import { Modal } from '@/shared/ui'
import { useSession } from '@/features/auth/session'
import { CargaDelEvento } from '../components/CargaDelEvento'
import { Filtros } from '../components/Filtros'
import { EncabezadoDePagina, Estado, Icono, Tarjeta } from '../components/piezas'
import { CONSENTIMIENTO, RED, autorizanTodos, fechaYHora, mismoPonente } from '../formato'
import { cambiarEstadoDePublicacion, crearPublicacion, eliminarPublicacion } from '../repositorio'
import { useEvento } from '../useEvento'
import type { DatosDelEvento, Publicacion } from '../tipos'

/*
  Lo que sale en las redes del evento, ordenado por lo que hay que hacer con
  cada pieza y no por fechas.

  Arriba, ideas para publicar armadas con el material que hay: el primer
  día, el agradecimiento a los ponentes y una por sesión con una cita ya
  verificada en los artículos. Debajo, un tablero de tres columnas —por
  revisar, listas para publicar, publicadas—, y cada pieza avanza con un
  botón. La versión anterior agrupaba por día de publicación: mezclaba
  piezas sin fecha con programadas y no decía qué faltaba hacer con ninguna.

  Todo respeta la autorización: de quien no autorizó difundir en redes, o
  todavía no respondió, no se propone nada ni se le nombra. Quiénes son se
  consulta desde el encabezado.
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

  const visibles = datos.publicaciones.filter((publicacion) => red === 'todas' || publicacion.red === red)
  /* Las ideas que ya se añadieron no se vuelven a ofrecer. */
  const ideas = recomendadas.filter((idea) => !datos.publicaciones.some((publicacion) => publicacion.texto === idea.texto))

  const mover = async (publicacion: Publicacion, estado: Publicacion['estado']): Promise<void> => {
    const resultado = await cambiarEstadoDePublicacion(publicacion.id, estado)
    if (resultado.ok) {
      invalidar()
    }
  }
  const quitar = async (publicacion: Publicacion): Promise<void> => {
    const resultado = await eliminarPublicacion(publicacion.id)
    if (resultado.ok) {
      invalidar()
    }
  }

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

      {ideas.length === 0 ? null : (
        <section className="flex flex-col gap-2">
          <h2 className="flex items-center gap-2 px-1 text-2xl font-medium">
            <Icono nombre="auto_awesome" className="text-xl [color:var(--tono-violeta-texto)]" />
            Ideas para publicar
          </h2>
          <ul className="entrar-escalonado flex snap-x gap-2 overflow-x-auto pb-1">
            {ideas.map((idea) => (
              <li key={idea.id} className="w-80 shrink-0 snap-start">
                <TarjetaRecomendada
                  recomendada={idea}
                  alAnadir={async () => {
                    const resultado = await crearPublicacion(idDueno, datos.evento.nombre, {
                      red: 'instagram',
                      formato: idea.cita === '' ? 'anuncio' : 'cita',
                      texto: idea.texto,
                      cita: idea.cita,
                      ponente: idea.ponente,
                      idConferencia: idea.idConferencia,
                    })
                    if (resultado.ok) {
                      invalidar()
                    }
                    return resultado.ok
                  }}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="entrar-escalonado grid grid-cols-3 items-start gap-2">
        {COLUMNAS.map((columna) => {
          const piezas = visibles.filter((publicacion) => columna.estados.includes(publicacion.estado))
          const siguiente = columna.siguiente
          return (
            <section key={columna.titulo} className="tarjeta-borde flex min-h-48 flex-col gap-3 rounded-[24px] bg-fondo p-3">
              <header className="flex items-center gap-2 px-2 pt-2">
                <Icono nombre={columna.icono} className="text-xl" />
                <span className="flex-1 text-lg font-medium">{columna.titulo}</span>
                <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-panel px-2 text-xs font-semibold">{piezas.length}</span>
              </header>
              {piezas.length === 0 ? (
                <p className="px-2 pb-2 text-sm text-texto-tenue">{columna.vacio}</p>
              ) : (
                piezas.map((publicacion) => (
                  <Pieza
                    key={publicacion.id}
                    publicacion={publicacion}
                    evento={datos.evento.nombre}
                    alAvanzar={siguiente === null ? null : () => void mover(publicacion, siguiente)}
                    textoDeAvance={columna.accion}
                    alQuitar={() => void quitar(publicacion)}
                  />
                ))
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

/* Las tres etapas de una pieza. "Programada" cuenta como lista: ya no hay nada que revisar, solo esperar su hora. */
const COLUMNAS: readonly {
  titulo: string
  icono: string
  estados: readonly Publicacion['estado'][]
  siguiente: Publicacion['estado'] | null
  accion: string
  vacio: string
}[] = [
  {
    titulo: 'Por revisar',
    icono: 'rate_review',
    estados: ['propuesta'],
    siguiente: 'aprobada',
    accion: 'Aprobar',
    vacio: 'Añade una idea de arriba para empezar.',
  },
  {
    titulo: 'Listas para publicar',
    icono: 'task_alt',
    estados: ['aprobada', 'programada'],
    siguiente: 'publicada',
    accion: 'Marcar como publicada',
    vacio: 'Lo que apruebes aparece aquí.',
  },
  { titulo: 'Publicadas', icono: 'campaign', estados: ['publicada'], siguiente: null, accion: '', vacio: 'Todavía no se ha publicado nada.' },
]

function TarjetaRecomendada({
  recomendada,
  alAnadir,
}: {
  recomendada: Recomendada
  alAnadir: () => Promise<boolean>
}): ReactElement {
  const [anadiendo, setAnadiendo] = useState(false)
  return (
    <Tarjeta className="flex h-full flex-col gap-2 p-4">
      <span className="truncate text-[15px] font-semibold">{recomendada.titulo}</span>
      <p className="line-clamp-3 text-sm leading-relaxed text-texto-tenue">{recomendada.texto}</p>
      <button
        type="button"
        disabled={anadiendo}
        onClick={() => {
          setAnadiendo(true)
          void alAnadir().finally(() => setAnadiendo(false))
        }}
        className="mt-auto flex h-8 w-fit cursor-pointer items-center gap-1.5 rounded-full bg-acento px-3 text-xs font-medium text-acento-contraste disabled:opacity-40"
      >
        <Icono nombre="add" className="text-base" />
        {anadiendo ? 'Añadiendo…' : 'Añadir a por revisar'}
      </button>
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
  alAvanzar,
  textoDeAvance,
  alQuitar,
}: {
  publicacion: Publicacion
  evento: string
  alAvanzar: (() => void) | null
  textoDeAvance: string
  alQuitar: () => void
}): ReactElement {
  const [copiado, setCopiado] = useState(false)
  const boton =
    'flex size-8 cursor-pointer items-center justify-center rounded-full bg-[var(--mind-neutro)] transition-colors hover:bg-[var(--mind-variante)]'

  return (
    <article className="flex flex-col gap-3 rounded-[18px] bg-panel p-3">
      <div className="flex items-start gap-3">
        <div className="flex aspect-square w-16 shrink-0 items-center justify-center rounded-[12px] bg-black p-2 text-center text-[8px] leading-tight font-semibold text-white">
          <span className="line-clamp-5">{publicacion.cita === '' ? publicacion.texto.split('.')[0] : `“${publicacion.cita}”`}</span>
        </div>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <Icono nombre={RED[publicacion.red].icono} className="text-base" />
            {RED[publicacion.red].etiqueta}
          </span>
          <span className="truncate text-xs text-texto-tenue">{publicacion.ponente || evento}</span>
          {publicacion.estado === 'programada' && publicacion.programadaPara !== null ? (
            <span className="flex items-center gap-1 text-xs text-texto-tenue">
              <Icono nombre="schedule" relleno={false} className="text-sm" /> {fechaYHora(publicacion.programadaPara)}
            </span>
          ) : null}
        </span>
      </div>
      <p className="line-clamp-4 text-sm leading-relaxed">{publicacion.texto}</p>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          title={copiado ? 'Copiado' : 'Copiar texto'}
          aria-label="Copiar texto"
          className={boton}
          onClick={() => {
            void navigator.clipboard?.writeText(publicacion.texto)
            setCopiado(true)
            window.setTimeout(() => setCopiado(false), 1600)
          }}
        >
          <Icono nombre={copiado ? 'check' : 'content_copy'} className="text-base" />
        </button>
        <button type="button" title="Descargar imagen" aria-label="Descargar imagen" className={boton} onClick={() => void descargarTarjeta(publicacion, evento)}>
          <Icono nombre="download" className="text-base" />
        </button>
        <button type="button" title="Quitar" aria-label="Quitar la pieza" className={boton} onClick={alQuitar}>
          <Icono nombre="delete" className="text-base" />
        </button>
        {alAvanzar === null ? null : (
          <button
            type="button"
            onClick={alAvanzar}
            className="ml-auto flex h-8 cursor-pointer items-center gap-1 rounded-full bg-acento px-3 text-xs font-medium text-acento-contraste transition-opacity hover:opacity-85"
          >
            {textoDeAvance} <Icono nombre="arrow_forward" className="text-sm" />
          </button>
        )}
      </div>
    </article>
  )
}
