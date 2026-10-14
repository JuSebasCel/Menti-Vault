import type { ChangeEvent, ReactElement, ReactNode } from 'react'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useSession } from '@/features/auth/session'
import { hayBackend } from '@/shared/api/backend'
import { mensajeDeError } from '@/shared/errors'
import { Modal } from '@/shared/ui'
import { pedirEnfoques, pedirEsquema, pedirRedaccion, ponenciasCitables } from '../articulos'
import { CargaDelEvento } from '../components/CargaDelEvento'
import { PanelLateral } from '../components/PanelLateral'
import { ReproductorDeCita } from '../components/ReproductorDeCita'
import { BotonMind, Chip, EncabezadoDePagina, Estado, Icono, Tarjeta } from '../components/piezas'
import { useDemostracion } from '../demostracion'
import { fechaYHora, minuto } from '../formato'
import { abrirEnOverleaf, articuloEnLatex, descargarTexto, nombreDeArchivo } from '../latex'
import { crearProduccion, eliminarProduccion, leerProduccion } from '../repositorio'
import type { DatosDelEvento, Enfoque, EstadoDeProduccion, Evidencia, Produccion } from '../tipos'
import { useEvento } from '../useEvento'

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

/* Los pasos que hace el modelo en segundo plano: mientras la fila esté en uno, se consulta hasta que cambie. */
const TRABAJANDO: ReadonlySet<EstadoDeProduccion> = new Set(['buscando', 'esquematizando', 'redactando'])

function estaLista(produccion: Produccion): boolean {
  return produccion.estado === 'lista' || produccion.estado === 'borrador'
}

function EstadoDeLaTarjeta({ produccion }: { produccion: Produccion }): ReactElement {
  if (estaLista(produccion)) {
    return <Estado etiqueta="Listo" tono="verde" />
  }
  if (produccion.estado === 'fallida') {
    return <Estado etiqueta="No salió" tono="rojo" />
  }
  if (TRABAJANDO.has(produccion.estado)) {
    return <Estado etiqueta="Trabajando…" tono="azul" />
  }
  return <Estado etiqueta="Espera tu elección" tono="ambar" />
}

function Producciones({ datos }: { datos: DatosDelEvento }): ReactElement {
  const [parametros, setParametros] = useSearchParams()
  const [origen, setOrigen] = useState<DOMRect | null>(null)
  const botonNueva = useRef<HTMLButtonElement>(null)
  const { invalidar } = useEvento()
  const demostracion = useDemostracion() || !hayBackend()
  const abierta = datos.producciones.find((produccion) => produccion.id === parametros.get('ver')) ?? null
  const seguida = datos.producciones.find((produccion) => produccion.id === parametros.get('seguir')) ?? null
  const creando = parametros.get('nueva') === '1' || seguida !== null
  const hayEnCurso = datos.producciones.some((produccion) => TRABAJANDO.has(produccion.estado))

  /* Con un artículo trabajándose, la lista se refresca sola: su tarjeta cambia de estado aunque el modal esté cerrado. */
  useEffect(() => {
    if (!hayEnCurso) {
      return
    }
    const intervalo = window.setInterval(invalidar, 8000)
    return () => window.clearInterval(intervalo)
  }, [hayEnCurso, invalidar])

  const cambiar = (cambios: Record<string, string | null>): void => {
    const siguientes = new URLSearchParams(parametros)
    for (const [clave, valor] of Object.entries(cambios)) {
      if (valor === null) {
        siguientes.delete(clave)
      } else {
        siguientes.set(clave, valor)
      }
    }
    setParametros(siguientes, { replace: true })
  }

  const cerrarRecorrido = (): void => {
    invalidar()
    cambiar({ nueva: null, seguir: null })
  }

  return (
    <div className="flex flex-col gap-4">
      <EncabezadoDePagina titulo="Artículos">
        <BotonMind ref={botonNueva} icono="add" onClick={() => cambiar({ nueva: '1' })}>
          Nuevo artículo
        </BotonMind>
      </EncabezadoDePagina>

      <div className="entrar-escalonado grid grid-cols-2 gap-2">
        {[...datos.producciones].sort((uno, otro) => otro.creadaEl.localeCompare(uno.creadaEl)).map((produccion) => (
          <button
            key={produccion.id}
            type="button"
            onClick={(evento) => {
              setOrigen(evento.currentTarget.getBoundingClientRect())
              cambiar(estaLista(produccion) ? { ver: produccion.id } : { seguir: produccion.id })
            }}
            className="tarjeta-borde flex cursor-pointer flex-col gap-4 rounded-[24px] bg-fondo p-6 text-left transition-colors hover:bg-panel"
          >
            <span className="flex items-center justify-between">
              <span className="text-sm text-texto-tenue">{produccion.tipo || 'Artículo de reflexión'}</span>
              <EstadoDeLaTarjeta produccion={produccion} />
            </span>
            <span className="text-xl leading-snug font-medium">{produccion.titulo}</span>
            <span className="flex flex-wrap gap-4 text-sm text-texto-tenue">
              {produccion.evidencias.length === 0 ? null : (
                <>
                  <span className="flex items-center gap-1.5">
                    <Icono nombre="groups" relleno={false} className="text-lg" />
                    {new Set(produccion.evidencias.map((evidencia) => evidencia.ponente)).size} ponentes
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Icono nombre="verified" relleno={false} className="text-lg" />
                    {produccion.evidencias.filter((evidencia) => evidencia.verificada).length} citas verificadas
                  </span>
                </>
              )}
              <span className="flex items-center gap-1.5">
                <Icono nombre="schedule" relleno={false} className="text-lg" />
                {fechaYHora(produccion.creadaEl)}
              </span>
            </span>
          </button>
        ))}
      </div>

      <PanelLateral abierto={abierta !== null} alCerrar={() => cambiar({ ver: null })} origen={origen} titulo={abierta?.titulo ?? 'Artículo'} ancho="amplio">
        {abierta === null ? null : <Articulo produccion={abierta} datos={datos} />}
      </PanelLateral>

      <Modal
        abierto={creando}
        alCerrar={cerrarRecorrido}
        titulo={seguida === null ? 'Nuevo artículo' : 'Artículo en curso'}
        anclaEn={botonNueva}
        anclaje="disparador"
        ancho="normal"
        cerrarAlPulsarElVelo={false}
      >
        {demostracion ? (
          datos.producciones[0] === undefined ? null : (
            <RecorridoDeEjemplo
              ejemplo={datos.producciones[0]}
              datos={datos}
              alAbrirArticulo={() => {
                setOrigen(null)
                cambiar({ nueva: null, ver: datos.producciones[0]?.id ?? null })
              }}
            />
          )
        ) : (
          <Recorrido
            key={seguida?.id ?? 'nuevo'}
            datos={datos}
            inicial={seguida}
            alTerminar={(id) => {
              invalidar()
              setOrigen(null)
              cambiar({ nueva: null, seguir: null, ver: id })
            }}
            alDescartar={cerrarRecorrido}
          />
        )}
      </Modal>
    </div>
  )
}

/*
  El recorrido de verdad: cada paso lo hace el modelo en el backend y deja su
  resultado en la fila, que aquí se consulta hasta que cambia.

  La fila manda sobre lo que se ve. Por eso cerrar el modal no pierde nada:
  al volver a abrir la tarjeta, el recorrido sigue en el paso donde iba.
*/
function Recorrido({
  datos,
  inicial,
  alTerminar,
  alDescartar,
}: {
  datos: DatosDelEvento
  inicial: Produccion | null
  alTerminar: (id: string) => void
  alDescartar: () => void
}): ReactElement {
  const { usuario } = useSession()
  const citables = useMemo(() => ponenciasCitables(datos), [datos])
  const [produccion, setProduccion] = useState<Produccion | null>(inicial)
  const [idea, setIdea] = useState(inicial?.idea ?? '')
  const [fuera, setFuera] = useState<ReadonlySet<string>>(new Set())
  const [elegido, setElegido] = useState<number | null>(null)
  const [otraVez, setOtraVez] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  /* En una ref: la pantalla la vuelve a crear en cada render, y como dependencia volvería a dispararse. */
  const terminar = useRef(alTerminar)
  terminar.current = alTerminar

  const id = produccion?.id ?? null
  const estado = produccion?.estado ?? null
  const elegidas = citables.filter((ponencia) => !fuera.has(ponencia.id))

  useEffect(() => {
    if (id === null || estado === null || !TRABAJANDO.has(estado)) {
      return
    }
    const intervalo = window.setInterval(() => {
      void leerProduccion(id).then((leida) => {
        if (leida.ok && leida.datos !== null) {
          setProduccion(leida.datos)
        }
      })
    }, 3000)
    return () => window.clearInterval(intervalo)
  }, [id, estado])

  useEffect(() => {
    if (id !== null && estado === 'lista') {
      terminar.current(id)
    }
  }, [id, estado])

  /* Pide un paso y, si el backend lo acepta, pasa la fila a su estado de trabajo para que empiece la consulta. */
  const pedir = async (paso: Promise<{ ok: true } | { ok: false; codigo: string }>, siguiente: EstadoDeProduccion): Promise<boolean> => {
    setEnviando(true)
    setError(null)
    const respuesta = await paso
    setEnviando(false)
    if (!respuesta.ok) {
      setError(mensajeDeError(respuesta.codigo))
      return false
    }
    setProduccion((actual) => (actual === null ? actual : { ...actual, estado: siguiente, fallo: '' }))
    setOtraVez(false)
    return true
  }

  const empezar = async (): Promise<void> => {
    if (usuario === null) {
      return
    }
    setEnviando(true)
    setError(null)
    const creada = await crearProduccion(usuario.id, datos.evento.nombre, idea.trim())
    if (!creada.ok) {
      setEnviando(false)
      setError(mensajeDeError(creada.codigo))
      return
    }
    const leida = await leerProduccion(creada.datos)
    if (leida.ok && leida.datos !== null) {
      setProduccion(leida.datos)
    }
    /* Si el backend no acepta el primer paso, la fila no tendría nunca enfoques: se borra para no dejar una tarjeta muerta. */
    if (!(await pedir(pedirEnfoques(creada.datos, elegidas), 'buscando'))) {
      await eliminarProduccion(creada.datos)
      setProduccion(null)
    }
  }

  const descartar = async (): Promise<void> => {
    if (id !== null) {
      await eliminarProduccion(id)
    }
    alDescartar()
  }

  if (produccion === null) {
    return (
      <div className="entrar-escalonado flex flex-col gap-5 px-2 pb-2">
        <PasoTitulo numero={1} titulo="Tu idea" texto="Con lo que tengas en mente: un tema, una pregunta, una intuición." />
        <textarea
          value={idea}
          onChange={(evento) => setIdea(evento.target.value)}
          rows={3}
          placeholder="Por ejemplo: qué dijeron los ponentes sobre el papel de las universidades en la transición energética"
          className="w-full resize-none rounded-2xl bg-panel px-4 py-3 text-lg text-texto shadow-[0_0_0_1px_var(--bitacora-filete-fuerte)] outline-none placeholder:text-texto-tenue focus:shadow-[0_0_0_3px_var(--mind-tonal),0_0_0_1px_var(--bitacora-filete-fuerte)]"
        />
        <div className="flex flex-col gap-2">
          <span className="text-sm text-texto-tenue">
            {citables.length === 0
              ? 'Ninguna ponencia se puede citar todavía: hace falta que esté transcrita y que sus ponentes autoricen citarla y procesarla con IA.'
              : `Se buscará en ${elegidas.length} de ${citables.length} ponencias transcritas y autorizadas. Quita las que no quieras.`}
          </span>
          <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
            {citables.map((ponencia) => (
              <Chip
                key={ponencia.id}
                elegido={!fuera.has(ponencia.id)}
                onClick={() =>
                  setFuera((actual) => {
                    const siguiente = new Set(actual)
                    if (siguiente.has(ponencia.id)) {
                      siguiente.delete(ponencia.id)
                    } else {
                      siguiente.add(ponencia.id)
                    }
                    return siguiente
                  })
                }
              >
                {ponencia.titulo}
              </Chip>
            ))}
          </div>
        </div>
        <Aviso error={error} />
        <div className="flex justify-end">
          <BotonMind disabled={idea.trim() === '' || elegidas.length === 0 || enviando} onClick={() => void empezar()}>
            {enviando ? 'Empezando…' : 'Buscar enfoques'} <Icono nombre="arrow_forward" className="text-lg" />
          </BotonMind>
        </div>
      </div>
    )
  }

  if (TRABAJANDO.has(produccion.estado)) {
    const textos: Partial<Record<EstadoDeProduccion, string>> = {
      buscando: 'Leyendo las ponencias y buscando enfoques…',
      esquematizando: 'Armando el esquema y verificando cada cita…',
      redactando: `Redactando con ${produccion.evidencias.length} evidencias…`,
    }
    return (
      <div className="flex flex-col items-center gap-4 px-2 py-16 text-center">
        <span className="size-10 animate-spin rounded-full border-[3px] border-filete border-t-acento" />
        <span className="text-xl">{textos[produccion.estado]}</span>
        <span className="max-w-sm text-sm text-texto-tenue">
          Tarda unos minutos. Puedes cerrar esta ventana: el artículo sigue y lo encuentras en la lista.
        </span>
      </div>
    )
  }

  /* Un fallo al armar el esquema vuelve a los enfoques: es ahí donde se decide de nuevo. */
  const verEnfoques =
    produccion.estado === 'eligiendo' ||
    otraVez ||
    (produccion.estado === 'fallida' && produccion.enfoques.length > 0 && produccion.evidencias.length === 0)

  if (produccion.estado === 'fallida' && !verEnfoques) {
    const reintentar = (): void => {
      void (produccion.enfoques.length === 0
        ? pedir(pedirEnfoques(produccion.id, elegidas), 'buscando')
        : pedir(pedirRedaccion(produccion.id), 'redactando'))
    }
    return (
      <div className="entrar-escalonado flex flex-col gap-5 px-2 pb-2">
        <PasoTitulo
          numero={produccion.enfoques.length === 0 ? 1 : 3}
          titulo="Este paso no salió"
          texto={produccion.fallo || 'El modelo no terminó el paso. Vuelve a intentarlo.'}
        />
        <Aviso error={error} />
        <div className="flex justify-between">
          <BotonMind variante="tenue" icono="delete" onClick={() => void descartar()}>
            Descartar
          </BotonMind>
          <BotonMind icono="refresh" disabled={enviando} onClick={reintentar}>
            Reintentar
          </BotonMind>
        </div>
      </div>
    )
  }

  if (verEnfoques) {
    const anterior = produccion.enfoques.findIndex((enfoque) => enfoque.titulo === produccion.enfoque?.titulo)
    const marcado = elegido ?? (anterior >= 0 ? anterior : produccion.enfoques.findIndex((enfoque) => enfoque.recomendado))
    return (
      <div className="entrar-escalonado flex flex-col gap-5 px-2 pb-2">
        <PasoTitulo numero={2} titulo="Enfoques" texto={produccion.fallo || 'Con el material que respalda cada uno.'} />
        <ListaDeEnfoques enfoques={produccion.enfoques} elegido={marcado} alElegir={setElegido} />
        <Aviso error={error} />
        <div className="flex justify-between">
          <BotonMind variante="tenue" icono="delete" onClick={() => void descartar()}>
            Descartar
          </BotonMind>
          <BotonMind disabled={marcado < 0 || enviando} onClick={() => void pedir(pedirEsquema(produccion.id, marcado), 'esquematizando')}>
            Armar esquema <Icono nombre="arrow_forward" className="text-lg" />
          </BotonMind>
        </div>
      </div>
    )
  }

  const porClave = new Map(produccion.evidencias.map((evidencia) => [evidencia.clave, evidencia]))
  return (
    <div className="entrar-escalonado flex flex-col gap-5 px-2 pb-2">
      <PasoTitulo
        numero={3}
        titulo="Esquema"
        texto={`«${produccion.titulo}» · ${produccion.evidencias.length} citas, todas encontradas en la transcripción.`}
      />
      <ol className="flex flex-col gap-2">
        {produccion.esquema.map((seccion, indice) => (
          <li key={`${indice}-${seccion.titulo}`} className="flex flex-col gap-2 rounded-[20px] bg-panel px-4 py-3">
            <span className="flex items-center gap-3">
              <span className="text-sm text-texto-tenue">{indice + 1}</span>
              <span className="flex-1 font-medium">{seccion.titulo}</span>
              <span className="text-sm text-texto-tenue">{seccion.evidencias.length === 0 ? 'Sin citas' : `${seccion.evidencias.length} citas`}</span>
            </span>
            {seccion.proposito === undefined || seccion.proposito === '' ? null : (
              <span className="pl-6 text-sm text-texto-tenue">{seccion.proposito}</span>
            )}
            {seccion.evidencias.map((clave) => {
              const evidencia = porClave.get(clave)
              return evidencia === undefined ? null : (
                <span key={clave} className="ml-6 rounded-[14px] bg-fondo px-3 py-2 text-sm leading-snug">
                  «{evidencia.texto}»{' '}
                  <span className="text-texto-tenue">
                    — {apellidos(evidencia.ponente)}, min. {minuto(evidencia.segundo)}
                  </span>
                </span>
              )
            })}
          </li>
        ))}
      </ol>
      <Aviso error={error} />
      <div className="flex justify-between">
        <BotonMind variante="tenue" icono="arrow_back" onClick={() => setOtraVez(true)}>
          Otro enfoque
        </BotonMind>
        <BotonMind disabled={enviando} onClick={() => void pedir(pedirRedaccion(produccion.id), 'redactando')}>
          Redactar artículo <Icono nombre="edit_note" className="text-lg" />
        </BotonMind>
      </div>
    </div>
  )
}

function Aviso({ error }: { error: string | null }): ReactElement | null {
  return error === null ? null : (
    <p className="rounded-2xl bg-[var(--tono-rojo)] px-4 py-3 text-sm [color:var(--tono-rojo-texto)]">{error}</p>
  )
}

function ListaDeEnfoques({
  enfoques,
  elegido,
  alElegir,
}: {
  enfoques: readonly Enfoque[]
  elegido: number | null
  alElegir: (indice: number) => void
}): ReactElement {
  return (
    <div className="flex flex-col gap-2">
      {enfoques.map((enfoque, indice) => (
        <button
          key={`${indice}-${enfoque.titulo}`}
          type="button"
          disabled={enfoque.respaldo === 'insuficiente'}
          onClick={() => alElegir(indice)}
          className={`flex cursor-pointer flex-col gap-2 rounded-[20px] p-4 text-left transition-colors disabled:cursor-not-allowed ${elegido === indice ? 'bg-acento text-acento-contraste' : 'bg-panel hover:bg-acento-tenue disabled:opacity-60 disabled:hover:bg-panel'}`}
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
  )
}

/*
  El recorrido de la demostración: idea → enfoques → esquema → artículo.

  Los pasos muestran la producción de ejemplo ya generada (redactada a partir
  de las transcripciones y con sus citas verificadas fuera de línea), no
  llaman al modelo. Es el que se ve en modo demostración, donde nada se
  escribe, y cuando no hay backend.
*/
type PasoDelRecorrido = 'idea' | 'buscando' | 'enfoques' | 'esquema' | 'redactando'

function RecorridoDeEjemplo({
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
  const [elegido, setElegido] = useState<number | null>(() => {
    const recomendado = ejemplo.enfoques.findIndex((enfoque) => enfoque.recomendado)
    return recomendado >= 0 ? recomendado : null
  })
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
          <ListaDeEnfoques enfoques={ejemplo.enfoques} elegido={elegido} alElegir={setElegido} />
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

/*
  Llevarse el artículo como LaTeX: con la plantilla de siempre, con la de la
  revista o el congreso (marcada con [[cuerpo]] y compañía), o directo a
  Overleaf para compilarlo a PDF.
*/
function ExportarLatex({ produccion, datos }: { produccion: Produccion; datos: DatosDelEvento }): ReactElement {
  const [aviso, setAviso] = useState<string | null>(null)
  const selector = useRef<HTMLInputElement>(null)
  const nombre = nombreDeArchivo(produccion.titulo)

  const conPlantilla = async (evento: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const archivo = evento.target.files?.[0]
    evento.target.value = ''
    if (archivo === undefined) {
      return
    }
    const resultado = articuloEnLatex(produccion, datos, await archivo.text())
    setAviso(resultado.ok ? null : resultado.motivo)
    if (resultado.ok) {
      descargarTexto(resultado.tex, nombre)
    }
  }

  const porDefecto = articuloEnLatex(produccion, datos)
  return (
    <div className="flex flex-col gap-2">
      <span className="flex flex-wrap gap-2">
        <BotonMind variante="secundario" icono="download" onClick={() => porDefecto.ok && descargarTexto(porDefecto.tex, nombre)}>
          LaTeX
        </BotonMind>
        <BotonMind variante="secundario" icono="upload_file" onClick={() => selector.current?.click()}>
          Con mi plantilla .tex
        </BotonMind>
        <BotonMind variante="secundario" icono="open_in_new" onClick={() => porDefecto.ok && abrirEnOverleaf(porDefecto.tex, nombre)}>
          Abrir en Overleaf
        </BotonMind>
      </span>
      <input ref={selector} type="file" accept=".tex,text/x-tex" className="hidden" onChange={(evento) => void conPlantilla(evento)} />
      {aviso === null ? null : <span className="text-sm [color:var(--tono-rojo-texto)]">{aviso}</span>}
    </div>
  )
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
          <span className="text-sm text-texto-tenue">
            {produccion.tipo || 'Artículo de reflexión'} · {datos.evento.nombre}
          </span>
          <span className="text-[28px] leading-tight font-semibold">{produccion.titulo}</span>
          <span className="flex flex-wrap gap-2">
            <Estado etiqueta={`${new Set(produccion.evidencias.map((evidencia) => evidencia.ponente)).size} ponentes citados`} tono="azul" />
            <Estado etiqueta={`${produccion.evidencias.filter((evidencia) => evidencia.verificada).length} citas verificadas`} tono="verde" />
          </span>
          <ExportarLatex produccion={produccion} datos={datos} />
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
