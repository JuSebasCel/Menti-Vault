import type { ReactElement, ReactNode } from 'react'
import { Fragment, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { FragmentoDeAudio } from '@/features/conferencias/components/FragmentoDeAudio'
import { Modal } from '@/shared/ui'
import { CargaDelEvento } from '../components/CargaDelEvento'
import { PanelLateral } from '../components/PanelLateral'
import { BotonMind, EncabezadoDePagina, Estado, Icono, Tarjeta } from '../components/piezas'
import { fechaYHora, minuto } from '../formato'
import type { DatosDelEvento, Enfoque, Evidencia, Produccion } from '../tipos'

/*
  Producción académica: artículos escritos a partir de lo que se dijo en el
  evento, donde cada cita se puede comprobar.

  Dos cosas la separan de pedirle un artículo a un modelo a secas, y las dos
  se ven aquí. Antes de escribir, los enfoques llegan con cuánto material los
  respalda —siete ponentes o dos—, así que se elige sabiendo si alcanza.
  Después, cada cita del artículo es una evidencia guardada con su ponente,
  su minuto y su texto literal, verificado contra la transcripción: se lee al
  pasar el ratón y se escucha en la grabación.
*/
export function PantallaProduccion(): ReactElement {
  return <CargaDelEvento>{(datos) => <Producciones datos={datos} />}</CargaDelEvento>
}

function Producciones({ datos }: { datos: DatosDelEvento }): ReactElement {
  const [parametros, setParametros] = useSearchParams()
  const [origen, setOrigen] = useState<DOMRect | null>(null)
  const botonNueva = useRef<HTMLButtonElement>(null)
  const abierta = datos.producciones.find((produccion) => produccion.id === parametros.get('ver')) ?? null
  const creando = parametros.get('nueva') === '1'

  const cambiar = (clave: string, valor: string | null): void => {
    const siguientes = new URLSearchParams(parametros)
    if (valor === null) {
      siguientes.delete(clave)
    } else {
      siguientes.set(clave, valor)
    }
    setParametros(siguientes, { replace: true })
  }

  return (
    <div className="flex flex-col gap-4">
      <EncabezadoDePagina titulo="Artículos">
        <BotonMind ref={botonNueva} icono="add" onClick={() => cambiar('nueva', '1')}>
          Nuevo artículo
        </BotonMind>
      </EncabezadoDePagina>

      <div className="entrar-escalonado grid grid-cols-2 gap-2">
        {datos.producciones.map((produccion) => (
          <button
            key={produccion.id}
            type="button"
            onClick={(evento) => {
              setOrigen(evento.currentTarget.getBoundingClientRect())
              cambiar('ver', produccion.id)
            }}
            className="tarjeta-borde flex cursor-pointer flex-col gap-4 rounded-[24px] bg-fondo p-6 text-left transition-colors hover:bg-panel"
          >
            <span className="flex items-center justify-between">
              <span className="text-sm text-texto-tenue">Artículo de reflexión</span>
              <Estado etiqueta="Listo" tono="listo" />
            </span>
            <span className="text-xl leading-snug font-medium">{produccion.titulo}</span>
            <span className="flex flex-wrap gap-4 text-sm text-texto-tenue">
              <span className="flex items-center gap-1.5">
                <Icono nombre="groups" relleno={false} className="text-lg" />
                {new Set(produccion.evidencias.map((evidencia) => evidencia.ponente)).size} ponentes
              </span>
              <span className="flex items-center gap-1.5">
                <Icono nombre="verified" relleno={false} className="text-lg" />
                {produccion.evidencias.filter((evidencia) => evidencia.verificada).length} citas verificadas
              </span>
              <span className="flex items-center gap-1.5">
                <Icono nombre="schedule" relleno={false} className="text-lg" />
                {fechaYHora(produccion.creadaEl)}
              </span>
            </span>
          </button>
        ))}
      </div>

      <PanelLateral abierto={abierta !== null} alCerrar={() => cambiar('ver', null)} origen={origen} titulo={abierta?.titulo ?? 'Artículo'}>
        {abierta === null ? null : <Articulo produccion={abierta} datos={datos} />}
      </PanelLateral>

      <Modal
        abierto={creando}
        alCerrar={() => cambiar('nueva', null)}
        titulo="Nuevo artículo"
        anclaEn={botonNueva}
        ancho="normal"
        cerrarAlPulsarElVelo={false}
      >
        {datos.producciones[0] === undefined ? null : (
          <Recorrido
            ejemplo={datos.producciones[0]}
            datos={datos}
            alAbrirArticulo={() => {
              const id = datos.producciones[0]?.id ?? null
              const siguientes = new URLSearchParams(parametros)
              siguientes.delete('nueva')
              if (id !== null) {
                siguientes.set('ver', id)
              }
              setOrigen(null)
              setParametros(siguientes, { replace: true })
            }}
          />
        )}
      </Modal>
    </div>
  )
}

/*
  El recorrido guiado: idea → enfoques → esquema → artículo.

  En esta versión los pasos muestran la producción de ejemplo ya generada
  (redactada a partir de las transcripciones y con sus citas verificadas
  fuera de línea), no llaman al modelo en el momento. La espera entre pasos
  es breve y solo marca que ahí, en la versión conectada, se busca en las
  ponencias.
*/
type PasoDelRecorrido = 'idea' | 'buscando' | 'enfoques' | 'esquema' | 'redactando'

function Recorrido({
  ejemplo,
  datos,
  alAbrirArticulo,
}: {
  ejemplo: Produccion
  datos: DatosDelEvento
  alAbrirArticulo: () => void
}): ReactElement {
  const [paso, setPaso] = useState<PasoDelRecorrido>('idea')
  const [idea, setIdea] = useState(ejemplo.idea)
  const [elegido, setElegido] = useState<Enfoque | null>(ejemplo.enfoques.find((enfoque) => enfoque.recomendado) ?? null)
  /* En una ref: la pantalla la vuelve a crear en cada render, y como dependencia reiniciaría la espera. */
  const alTerminar = useRef(alAbrirArticulo)
  alTerminar.current = alAbrirArticulo

  useEffect(() => {
    if (paso !== 'buscando' && paso !== 'redactando') {
      return
    }
    const temporizador = window.setTimeout(() => {
      if (paso === 'buscando') {
        setPaso('enfoques')
      } else {
        alTerminar.current()
      }
    }, 1400)
    return () => window.clearTimeout(temporizador)
  }, [paso])

  return (
    <div key={paso} className="entrar-escalonado flex flex-col gap-5 px-2 pb-2">
      {paso === 'idea' ? (
        <>
          <PasoTitulo numero={1} titulo="Tu idea" texto="Con lo que tengas en mente." />
          <textarea
            value={idea}
            onChange={(evento) => setIdea(evento.target.value)}
            rows={3}
            className="w-full resize-none rounded-2xl bg-panel px-4 py-3 text-lg text-texto shadow-[0_0_0_1px_var(--bitacora-filete-fuerte)] outline-none focus:shadow-[0_0_0_3px_var(--mind-tonal),0_0_0_1px_var(--bitacora-filete-fuerte)]"
          />
          <div className="flex justify-end">
            <BotonMind disabled={idea.trim() === ''} onClick={() => setPaso('buscando')}>
              Buscar enfoques <Icono nombre="arrow_forward" className="text-lg" />
            </BotonMind>
          </div>
        </>
      ) : null}

      {paso === 'buscando' || paso === 'redactando' ? (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <span className="size-10 animate-spin rounded-full border-[3px] border-filete border-t-acento" />
          <span className="text-xl">
            {paso === 'buscando'
              ? `Buscando en ${datos.ponencias.length} ponencias…`
              : `Redactando con ${ejemplo.evidencias.length} evidencias…`}
          </span>
        </div>
      ) : null}

      {paso === 'enfoques' ? (
        <>
          <PasoTitulo numero={2} titulo="Enfoques" texto="Con el material que respalda cada uno." />
          <div className="flex flex-col gap-2">
            {ejemplo.enfoques.map((enfoque) => (
              <button
                key={enfoque.titulo}
                type="button"
                disabled={enfoque.respaldo === 'insuficiente'}
                onClick={() => setElegido(enfoque)}
                className={`flex cursor-pointer flex-col gap-2 rounded-[20px] p-4 text-left transition-colors disabled:cursor-not-allowed ${elegido?.titulo === enfoque.titulo ? 'bg-acento text-acento-contraste' : 'bg-panel hover:bg-acento-tenue disabled:opacity-60 disabled:hover:bg-panel'}`}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="text-lg font-medium">{enfoque.titulo}</span>
                  <Respaldo enfoque={enfoque} />
                </span>
                <span className="text-sm opacity-80">{enfoque.pregunta}</span>
                <span className="flex gap-4 text-sm opacity-70">
                  <span>{enfoque.tipo}</span>
                  <span>{enfoque.ponentes} ponentes</span>
                  <span>{enfoque.evidencias} evidencias</span>
                </span>
                <span className="text-sm opacity-70">{enfoque.por_que}</span>
              </button>
            ))}
          </div>
          <div className="flex justify-between">
            <BotonMind variante="tenue" icono="arrow_back" onClick={() => setPaso('idea')}>
              Atrás
            </BotonMind>
            <BotonMind disabled={elegido === null} onClick={() => setPaso('esquema')}>
              Ver esquema <Icono nombre="arrow_forward" className="text-lg" />
            </BotonMind>
          </div>
        </>
      ) : null}

      {paso === 'esquema' ? (
        <>
          <PasoTitulo numero={3} titulo="Esquema" texto="Secciones y sus evidencias." />
          <ol className="flex flex-col gap-2">
            {ejemplo.esquema.map((seccion, indice) => (
              <li key={seccion.titulo} className="flex flex-col gap-2 rounded-[20px] bg-panel px-4 py-3">
                <span className="flex items-center gap-3">
                  <span className="text-sm text-texto-tenue">{indice + 1}</span>
                  <span className="flex-1 font-medium">{seccion.titulo}</span>
                  <span className="text-sm text-texto-tenue">
                    {seccion.evidencias.length === 0 ? 'Texto de enlace' : `${seccion.evidencias.length} evidencias`}
                  </span>
                </span>
                {seccion.evidencias.length === 0 ? null : (
                  <span className="flex flex-wrap gap-1.5 pl-6">
                    {[...new Set(seccion.evidencias.map((clave) => ejemplo.evidencias.find((evidencia) => evidencia.clave === clave)?.ponente ?? ''))].map(
                      (ponente) => (
                        <span key={ponente} className="rounded-full bg-fondo px-2.5 py-1 text-xs">
                          {apellidos(ponente)}
                        </span>
                      ),
                    )}
                  </span>
                )}
              </li>
            ))}
          </ol>
          <div className="flex justify-between">
            <BotonMind variante="tenue" icono="arrow_back" onClick={() => setPaso('enfoques')}>
              Atrás
            </BotonMind>
            <BotonMind onClick={() => setPaso('redactando')}>
              Redactar artículo <Icono nombre="edit_note" className="text-lg" />
            </BotonMind>
          </div>
        </>
      ) : null}
    </div>
  )
}

function PasoTitulo({ numero, titulo, texto }: { numero: number; titulo: string; texto: string }): ReactElement {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-texto-tenue">Paso {numero} de 3</span>
      <span className="text-[32px] leading-none font-semibold">{titulo}</span>
      <span className="text-texto-tenue">{texto}</span>
    </div>
  )
}

function Respaldo({ enfoque }: { enfoque: Enfoque }): ReactElement {
  const estilos = {
    solido: { etiqueta: 'Material sólido · recomendado', tono: 'listo' as const },
    suficiente: { etiqueta: 'Material justo', tono: 'espera' as const },
    insuficiente: { etiqueta: 'No alcanza con este evento', tono: 'alerta' as const },
  }
  return <Estado {...estilos[enfoque.respaldo]} />
}

/* Para citar como en un artículo: los dos últimos nombres son los apellidos. */
function apellidos(nombre: string): string {
  return nombre.split(' ').slice(-2).join(' ')
}

function Articulo({ produccion, datos }: { produccion: Produccion; datos: DatosDelEvento }): ReactElement {
  const porClave = new Map(produccion.evidencias.map((evidencia) => [evidencia.clave, evidencia]))
  const [sonando, setSonando] = useState<Evidencia | null>(null)

  return (
    <div className="entrar-escalonado flex flex-col gap-2 pt-2">
      <Tarjeta variante="rellena" className="flex flex-col gap-4">
        <span className="text-sm text-texto-tenue">Artículo de reflexión · {datos.evento.nombre}</span>
        <span className="text-[28px] leading-tight font-semibold">{produccion.titulo}</span>
        <span className="flex flex-wrap gap-2">
          <Estado etiqueta={`${new Set(produccion.evidencias.map((evidencia) => evidencia.ponente)).size} ponentes citados`} tono="neutro" />
          <Estado etiqueta={`${produccion.evidencias.length} citas verificadas contra la transcripción`} tono="listo" />
        </span>
      </Tarjeta>

      {sonando === null ? null : (
        <div className="sticky top-0 z-10 flex flex-col gap-2 rounded-[24px] bg-panel p-4 shadow-[0_0_0_1px_var(--bitacora-filete)]">
          <span className="flex items-center justify-between gap-3 text-sm">
            <span>
              <span className="font-medium">{sonando.ponente}</span>
              <span className="text-texto-tenue"> · min. {minuto(sonando.segundo)}</span>
            </span>
            <button type="button" onClick={() => setSonando(null)} className="cursor-pointer text-texto-tenue hover:text-texto" aria-label="Cerrar audio">
              <Icono nombre="close" className="text-lg" />
            </button>
          </span>
          <FragmentoDeAudio
            idDueno={datos.ponencias[0]?.idDueno ?? ''}
            idConferencia={sonando.idConferencia}
            inicio={sonando.segundo}
            fin={sonando.segundo + 12}
          />
        </div>
      )}

      <article className="flex flex-col gap-6 px-4 py-4">
        {produccion.secciones.map((seccion) => (
          <section key={seccion.titulo} className="flex flex-col gap-3">
            <h3 className="text-xl font-semibold">{seccion.titulo}</h3>
            {seccion.texto.split('\n\n').map((parrafo, indice) => (
              <p key={indice} className="text-[16px] leading-[1.75] text-texto">
                {conCitas(parrafo, porClave, setSonando)}
              </p>
            ))}
          </section>
        ))}
      </article>

      <Tarjeta className="flex flex-col gap-3">
        <span className="text-xl font-semibold">Evidencias</span>
        <ol className="flex flex-col gap-2">
          {produccion.evidencias.map((evidencia) => (
            <li key={evidencia.clave} className="flex items-start gap-3 rounded-2xl bg-panel px-4 py-3">
              <span className="mt-0.5 shrink-0 font-mono text-xs text-texto-tenue">{evidencia.clave}</span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-[15px]">«{evidencia.texto}»</span>
                <span className="text-sm text-texto-tenue">
                  {evidencia.ponente} · min. {minuto(evidencia.segundo)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setSonando(evidencia)}
                aria-label="Escuchar"
                className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-fondo transition-colors hover:bg-acento hover:text-acento-contraste"
              >
                <Icono nombre="play_arrow" className="text-lg" />
              </button>
            </li>
          ))}
        </ol>
      </Tarjeta>
    </div>
  )
}

/*
  Cambia cada `{E-n}` del texto por la cita literal entre comillas y su
  referencia (apellidos, minuto). La referencia es un botón: al pasar el
  ratón enseña el contexto, y al pulsarlo suena el tramo de la grabación.
*/
function conCitas(
  parrafo: string,
  porClave: Map<string, Evidencia>,
  alEscuchar: (evidencia: Evidencia) => void,
): ReactNode {
  return parrafo.split(/(\{E-\d+\})/).map((trozo, indice) => {
    const clave = /^\{(E-\d+)\}$/.exec(trozo)?.[1]
    const evidencia = clave === undefined ? undefined : porClave.get(clave)
    if (evidencia === undefined) {
      return <Fragment key={indice}>{trozo}</Fragment>
    }
    return (
      <Fragment key={indice}>
        «{evidencia.texto.replace(/[.]$/, '')}»{' '}
        <span className="group relative inline-block">
          <button
            type="button"
            onClick={() => alEscuchar(evidencia)}
            className="cursor-pointer rounded-full bg-acento-tenue px-2 py-0.5 text-[13px] whitespace-nowrap text-texto transition-colors hover:bg-acento hover:text-acento-contraste"
          >
            ({apellidos(evidencia.ponente)}, min. {minuto(evidencia.segundo)})
          </button>
          <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-80 -translate-x-1/2 translate-y-1 rounded-2xl bg-acento p-4 text-left text-sm leading-relaxed text-acento-contraste opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-y-0 group-hover:opacity-100">
            <span className="mb-2 flex items-center gap-1.5 text-xs opacity-70">
              <Icono nombre="verified" className="text-sm" /> Literal en la transcripción · {evidencia.clave}
            </span>
            «{evidencia.texto}»
            <span className="mt-2 block text-xs opacity-70">
              {evidencia.ponente} · minuto {minuto(evidencia.segundo)} · pulsa para escuchar
            </span>
          </span>
        </span>
      </Fragment>
    )
  })
}
