import type { ReactElement, ReactNode } from 'react'
import { Fragment, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Modal } from '@/shared/ui'
import { CargaDelEvento } from '../components/CargaDelEvento'
import { PanelLateral } from '../components/PanelLateral'
import { ReproductorDeCita } from '../components/ReproductorDeCita'
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
              <Estado etiqueta="Listo" tono="verde" />
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

      <PanelLateral abierto={abierta !== null} alCerrar={() => cambiar('ver', null)} origen={origen} titulo={abierta?.titulo ?? 'Artículo'} ancho="amplio">
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
    solido: { etiqueta: 'Material sólido · recomendado', tono: 'verde' as const },
    suficiente: { etiqueta: 'Material justo', tono: 'ambar' as const },
    insuficiente: { etiqueta: 'No alcanza con este evento', tono: 'rojo' as const },
  }
  return <Estado {...estilos[enfoque.respaldo]} />
}

/* Para citar como en un artículo: los dos últimos nombres son los apellidos. */
function apellidos(nombre: string): string {
  return nombre.split(' ').slice(-2).join(' ')
}

function Articulo({ produccion, datos }: { produccion: Produccion; datos: DatosDelEvento }): ReactElement {
  const porClave = new Map(produccion.evidencias.map((evidencia) => [evidencia.clave, evidencia]))
  const [sonando, setSonando] = useState<{ evidencia: Evidencia; ancla: HTMLElement } | null>(null)
  const lista = useRef<HTMLOListElement>(null)
  const idDueno = datos.ponencias[0]?.idDueno ?? ''
  /* Solo se desplaza la columna de evidencias: `scrollIntoView` movía también el artículo y la píldora quedaba lejos de su cita. */
  const escuchar = (evidencia: Evidencia, elemento: HTMLElement): void => {
    setSonando({ evidencia, ancla: elemento })
    const fila = document.getElementById(`evidencia-${evidencia.clave}`)
    if (fila !== null && lista.current !== null) {
      lista.current.scrollTo({ top: fila.offsetTop - 8, behavior: 'smooth' })
    }
  }

  return (
    <div className="entrar-escalonado grid min-h-0 grid-cols-[minmax(0,1fr)_340px] gap-2 pt-2">
      <div className="flex min-w-0 flex-col gap-2">
        <Tarjeta variante="rellena" className="flex flex-col gap-4">
          <span className="text-sm text-texto-tenue">Artículo de reflexión · {datos.evento.nombre}</span>
          <span className="text-[28px] leading-tight font-semibold">{produccion.titulo}</span>
          <span className="flex flex-wrap gap-2">
            <Estado etiqueta={`${new Set(produccion.evidencias.map((evidencia) => evidencia.ponente)).size} ponentes citados`} tono="azul" />
            <Estado etiqueta={`${produccion.evidencias.length} citas verificadas`} tono="verde" />
          </span>
        </Tarjeta>

        <article className="flex flex-col gap-6 px-4 py-4">
          {produccion.secciones.map((seccion) => (
            <section key={seccion.titulo} className="flex flex-col gap-3">
              <h3 className="text-xl font-semibold">{seccion.titulo}</h3>
              {seccion.texto.split('\n\n').map((parrafo, indice) => (
                <p key={indice} className="text-[16px] leading-[1.75] text-texto">
                  {conCitas(parrafo, porClave, escuchar, sonando?.evidencia.clave ?? null)}
                </p>
              ))}
            </section>
          ))}
        </article>
      </div>

      {/* Las evidencias al lado del texto: se comprueba sin perder el renglón. */}
      <aside className="sticky top-0 flex max-h-[calc(100dvh-96px)] min-h-0 flex-col gap-3 self-start rounded-[24px] bg-panel p-3">
        <span className="px-2 pt-2 text-xl font-semibold">Evidencias</span>
        <ol ref={lista} className="relative flex min-h-0 flex-col gap-2 overflow-y-auto">
          {produccion.evidencias.map((evidencia) => (
            <li
              key={evidencia.clave}
              id={`evidencia-${evidencia.clave}`}
              className={`flex items-start gap-3 rounded-[16px] px-3 py-3 transition-colors ${sonando?.evidencia.clave === evidencia.clave ? 'bg-acento text-acento-contraste' : 'bg-fondo'}`}
            >
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-[14px] leading-snug">«{evidencia.texto}»</span>
                <span className="text-xs opacity-70">
                  {apellidos(evidencia.ponente)} · min. {minuto(evidencia.segundo)}
                </span>
              </span>
              <button
                type="button"
                onClick={(evento) => escuchar(evidencia, evento.currentTarget)}
                aria-label={`Escuchar ${evidencia.clave}`}
                className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[var(--mind-neutro)] text-texto transition-colors hover:bg-acento hover:text-acento-contraste"
              >
                <Icono nombre="play_arrow" className="text-lg" />
              </button>
            </li>
          ))}
        </ol>
      </aside>

      {sonando === null ? null : (
        <ReproductorDeCita
          key={sonando.evidencia.clave}
          evidencia={sonando.evidencia}
          idDueno={idDueno}
          ancla={sonando.ancla}
          alCerrar={() => setSonando(null)}
        />
      )}
    </div>
  )
}

/*
  Cambia cada `{E-n}` del texto por la cita literal entre comillas y su
  referencia (apellidos, minuto). La referencia es un botón: al pasar el
  ratón enseña la frase verificada, y al pulsarla suena el tramo justo ahí.
*/
function conCitas(
  parrafo: string,
  porClave: Map<string, Evidencia>,
  alEscuchar: (evidencia: Evidencia, elemento: HTMLElement) => void,
  activa: string | null,
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
        <button
          type="button"
          title={`Literal en la transcripción · ${evidencia.ponente}, minuto ${minuto(evidencia.segundo)}`}
          onClick={(evento) => alEscuchar(evidencia, evento.currentTarget)}
          className={`inline-flex cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 align-baseline text-[13px] whitespace-nowrap transition-colors ${activa === evidencia.clave ? 'bg-acento text-acento-contraste' : 'bg-[var(--tono-azul)] [color:var(--tono-azul-texto)] hover:bg-acento hover:text-acento-contraste'}`}
        >
          <Icono nombre="graphic_eq" className="text-sm" />
          {apellidos(evidencia.ponente)}, min. {minuto(evidencia.segundo)}
        </button>
      </Fragment>
    )
  })
}
