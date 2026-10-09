import type { ReactElement } from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { ReproductorDeCita } from '../components/ReproductorDeCita'
import { Icono } from '../components/piezas'
import { minuto } from '../formato'
import type { DatosDelEvento, Evidencia } from '../tipos'
import { agregarPregunta, completarRespuesta, marcarLeida, nuevaConversacion, useConversacion } from './conversacion'
import type { Mensaje } from './conversacion'
import { responderConAgente } from './agente'
import { LogoDeMenti } from './LogoDeMenti'
import { prepararIndice, responder } from './motor'
import type { Fragmento, Respuesta } from './motor'

/*
  Menti: preguntarle al evento. Responde con lo que se dijo —fragmentos con
  ponente y minuto, que se escuchan ahí mismo—, con la agenda o con la
  memoria de una ponencia, según la pregunta.

  Mientras piensa, su logo se dibuja y el texto de espera dice qué está
  haciendo; la respuesta se escribe palabra a palabra y los fragmentos
  entran después, uno tras otro. La conversación sigue ahí al cerrar y
  volver a abrir el panel, hasta pedir una nueva o recargar la página.
*/
const SUGERENCIAS = [
  '¿Qué ponencias hablaron de IA?',
  '¿Quién habló de ética?',
  'Resume la ponencia de Héctor',
  '¿Qué sesiones hubo el martes?',
]

/* La clase de afirmación, cuando se pidió comprobar: los datos van primero porque son lo que se contrasta. */
const ETIQUETAS: Record<NonNullable<Fragmento['etiqueta']>, { texto: string; tono: string }> = {
  dato: { texto: 'Dato', tono: 'bg-[var(--tono-azul)] [color:var(--tono-azul-texto)]' },
  afirmacion: { texto: 'Afirmación', tono: 'bg-[var(--tono-gris)] [color:var(--tono-gris-texto)]' },
  opinion: { texto: 'Opinión', tono: 'bg-[var(--tono-violeta)] [color:var(--tono-violeta-texto)]' },
}

const ESPERAS = ['Leyendo las transcripciones…', 'Buscando en lo que se dijo…', 'Comprobando los minutos…']

export function ChatDeMenti({ datos, alCerrar }: { datos: DatosDelEvento; alCerrar: () => void }): ReactElement {
  const mensajes = useConversacion()
  const [texto, setTexto] = useState('')
  const [preparado, setPreparado] = useState<number | null>(null)
  const lista = useRef<HTMLDivElement>(null)
  const campo = useRef<HTMLTextAreaElement>(null)
  const pensando = mensajes.some((mensaje) => mensaje.rol === 'menti' && mensaje.estado === 'pensando')

  useEffect(() => {
    void prepararIndice(datos).then(setPreparado)
    campo.current?.focus()
  }, [datos])

  /* Siempre al final de la conversación, también mientras se escribe una respuesta. */
  useLayoutEffect(() => {
    lista.current?.scrollTo({ top: lista.current.scrollHeight, behavior: 'smooth' })
  }, [mensajes])

  const enviar = async (pregunta: string): Promise<void> => {
    const limpia = pregunta.trim()
    if (limpia === '' || pensando) {
      return
    }
    setTexto('')
    const historial = mensajes
    const id = agregarPregunta(limpia)
    /*
      Primero el agente, con el modelo; si el backend no responde, el motor
      sin modelo. Una espera mínima: una respuesta instantánea parece
      copiada, no leída.
    */
    const conModelo = async (): Promise<Respuesta> => (await responderConAgente(datos, historial, limpia)) ?? (await responder(datos, limpia))
    const [respuesta] = await Promise.all([conModelo(), new Promise((resolver) => window.setTimeout(resolver, 900))])
    completarRespuesta(id, respuesta)
  }

  return (
    <div className="flex h-[min(700px,calc(100dvh-32px))] w-[460px] flex-col overflow-hidden rounded-[32px] bg-fondo shadow-[0_0_0_1px_var(--bitacora-filete),0_24px_64px_-24px_rgb(0_0_0/0.45)]">
      <header className="flex shrink-0 items-center gap-3 border-b border-filete px-5 py-4">
        <LogoDeMenti tamano={40} pensando={pensando} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-lg leading-tight font-semibold">Menti</span>
          <span className="truncate text-xs text-texto-tenue">
            {preparado === null ? 'Preparando las ponencias…' : `Conoce ${preparado} ponencias de ${datos.evento.nombre}`}
          </span>
        </span>
        <button
          type="button"
          onClick={nuevaConversacion}
          disabled={mensajes.length === 0}
          title="Nueva conversación"
          className="flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-[var(--mind-neutro)] px-3 text-xs font-medium transition-opacity disabled:cursor-default disabled:opacity-40"
        >
          <Icono nombre="edit_square" className="text-base" />
          Nueva
        </button>
        <button
          type="button"
          onClick={alCerrar}
          aria-label="Cerrar"
          className="flex size-9 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-panel"
        >
          <Icono nombre="close" className="text-xl" />
        </button>
      </header>

      <div ref={lista} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
        {mensajes.length === 0 ? (
          <Bienvenida evento={datos.evento.nombre} alElegir={(pregunta) => void enviar(pregunta)} />
        ) : (
          mensajes.map((mensaje) => <Burbuja key={mensaje.id} mensaje={mensaje} datos={datos} alAbrir={alCerrar} />)
        )}
      </div>

      <form
        className="flex shrink-0 items-end gap-2 border-t border-filete p-3"
        onSubmit={(evento) => {
          evento.preventDefault()
          void enviar(texto)
        }}
      >
        <textarea
          ref={campo}
          rows={1}
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          onKeyDown={(evento) => {
            if (evento.key === 'Enter' && !evento.shiftKey) {
              evento.preventDefault()
              void enviar(texto)
            }
          }}
          placeholder="Pregúntale algo sobre las ponencias"
          className="max-h-32 min-h-12 flex-1 resize-none rounded-[24px] bg-panel px-5 py-3 text-[15px] leading-6 text-texto outline-none placeholder:text-texto-tenue"
        />
        <button
          type="submit"
          disabled={texto.trim() === '' || pensando}
          aria-label="Enviar"
          className="flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-full bg-acento text-acento-contraste transition-[transform,opacity] hover:scale-105 disabled:cursor-default disabled:opacity-30 disabled:hover:scale-100"
        >
          <Icono nombre="arrow_upward" className="text-2xl" />
        </button>
      </form>
    </div>
  )
}

function Bienvenida({ evento, alElegir }: { evento: string; alElegir: (pregunta: string) => void }): ReactElement {
  return (
    <div className="entrar-escalonado flex flex-1 flex-col items-center justify-center gap-5 text-center">
      <span className="relative flex size-28 items-center justify-center">
        <span className="menti-halo absolute inset-0 rounded-full bg-[var(--mind-tonal)]" />
        <span className="menti-flota relative">
          <LogoDeMenti tamano={72} />
        </span>
      </span>
      <span className="flex flex-col gap-1">
        <span className="text-[28px] leading-tight font-semibold">Hola, soy Menti</span>
        <span className="text-texto-tenue">Pregúntame lo que quieras sobre {evento}.</span>
      </span>
      <div className="flex w-full flex-col gap-2">
        {SUGERENCIAS.map((sugerencia) => (
          <button
            key={sugerencia}
            type="button"
            onClick={() => alElegir(sugerencia)}
            className="flex cursor-pointer items-center gap-3 rounded-[20px] bg-panel px-4 py-3 text-left text-[15px] transition-colors hover:bg-[var(--mind-variante)]"
          >
            <Icono nombre="north_east" className="text-lg text-texto-tenue" />
            {sugerencia}
          </button>
        ))}
      </div>
    </div>
  )
}

function Burbuja({ mensaje, datos, alAbrir }: { mensaje: Mensaje; datos: DatosDelEvento; alAbrir: () => void }): ReactElement {
  if (mensaje.rol === 'persona') {
    return (
      <div className="entrar-escalonado flex justify-end">
        <p className="max-w-[80%] rounded-[22px] rounded-br-[8px] bg-acento px-4 py-2.5 text-[15px] leading-relaxed text-acento-contraste">{mensaje.texto}</p>
      </div>
    )
  }

  return (
    <div className="flex gap-3">
      <span className="shrink-0 pt-0.5">
        <LogoDeMenti tamano={30} pensando={mensaje.estado === 'pensando'} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {mensaje.estado === 'pensando' ? <Pensando /> : <RespuestaDeMenti id={mensaje.id} respuesta={mensaje.respuesta} nueva={mensaje.nueva} datos={datos} alAbrir={alAbrir} />}
      </div>
    </div>
  )
}

function Pensando(): ReactElement {
  const [indice, setIndice] = useState(0)
  useEffect(() => {
    const temporizador = window.setInterval(() => setIndice((actual) => (actual + 1) % ESPERAS.length), 900)
    return () => window.clearInterval(temporizador)
  }, [])
  return (
    <div className="flex flex-col gap-2 pt-1">
      <span key={indice} className="menti-brillo entrar-escalonado text-[15px] font-medium">
        <span>{ESPERAS[indice]}</span>
      </span>
      <span className="flex flex-col gap-1.5">
        {[88, 72, 54].map((ancho, posicion) => (
          <span key={ancho} className="h-2.5 animate-pulse rounded-full bg-panel" style={{ width: `${ancho}%`, animationDelay: `${posicion * 120}ms` }} />
        ))}
      </span>
    </div>
  )
}

/* La respuesta se escribe palabra a palabra la primera vez; después aparece completa. */
function RespuestaDeMenti({
  id,
  respuesta,
  nueva,
  datos,
  alAbrir,
}: {
  id: string
  respuesta: Respuesta
  nueva: boolean
  datos: DatosDelEvento
  alAbrir: () => void
}): ReactElement {
  const palabras = respuesta.texto.split(' ')
  const [visibles, setVisibles] = useState(nueva ? 0 : palabras.length)
  const [sonando, setSonando] = useState<{ evidencia: Evidencia; ancla: HTMLElement } | null>(null)
  const navegar = useNavigate()
  const escrita = visibles >= palabras.length

  useEffect(() => {
    if (escrita) {
      if (nueva) {
        marcarLeida(id)
      }
      return
    }
    const temporizador = window.setTimeout(() => setVisibles((actual) => Math.min(palabras.length, actual + 2)), 28)
    return () => window.clearTimeout(temporizador)
  }, [visibles, escrita, nueva, id, palabras.length])

  const escuchar = (fragmento: Fragmento, ancla: HTMLElement): void =>
    setSonando({
      evidencia: {
        clave: `${fragmento.idConferencia}-${fragmento.segundo}`,
        idConferencia: fragmento.idConferencia,
        ponente: fragmento.ponente,
        segundo: fragmento.segundo,
        texto: fragmento.texto,
        verificada: true,
      },
      ancla,
    })

  const abrir = (idConferencia: string): void => {
    alAbrir()
    void navegar(`/ponencias?ver=${idConferencia}&pestana=transcripcion`)
  }

  return (
    <>
      <p className="text-[15px] leading-relaxed whitespace-pre-line">
        {palabras.slice(0, visibles).join(' ')}
        {escrita ? null : <span className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 animate-pulse bg-texto" />}
      </p>

      {escrita && respuesta.puntos !== undefined && respuesta.puntos.length > 0 ? (
        <ol className="entrar-escalonado flex flex-col gap-2">
          {respuesta.puntos.map((punto, indice) => (
            <li key={punto} className="flex gap-3 rounded-[18px] bg-panel px-4 py-3 text-sm leading-relaxed">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-acento text-xs font-semibold text-acento-contraste">
                {indice + 1}
              </span>
              {punto}
            </li>
          ))}
        </ol>
      ) : null}

      {escrita && respuesta.fragmentos.length > 0 ? (
        <ul className="entrar-escalonado flex flex-col gap-2">
          {respuesta.fragmentos.map((fragmento) => (
            <li key={`${fragmento.idConferencia}-${fragmento.segundo}`} className="flex flex-col gap-2 rounded-[18px] bg-panel p-3">
              {fragmento.etiqueta === undefined ? null : (
                <span className={`w-fit rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${ETIQUETAS[fragmento.etiqueta].tono}`}>
                  {ETIQUETAS[fragmento.etiqueta].texto}
                </span>
              )}
              <p className="line-clamp-4 text-[14px] leading-relaxed">«{fragmento.texto}»</p>
              <div className="flex items-center gap-2">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-xs font-semibold">
                    {fragmento.ponente} · min. {minuto(fragmento.segundo)}
                  </span>
                  <span className="truncate text-xs text-texto-tenue">{fragmento.ponencia}</span>
                </span>
                {fragmento.contrastar === undefined ? null : (
                  <a
                    href={fragmento.contrastar}
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-8 shrink-0 items-center gap-1 rounded-full bg-fondo px-3 text-xs font-medium transition-colors hover:bg-[var(--mind-variante)]"
                  >
                    <Icono nombre="travel_explore" className="text-base" /> Contrastar
                  </a>
                )}
                <button
                  type="button"
                  aria-label="Escuchar"
                  onClick={(evento) => escuchar(fragmento, evento.currentTarget)}
                  className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-acento text-acento-contraste transition-transform hover:scale-110"
                >
                  <Icono nombre="play_arrow" className="text-lg" />
                </button>
                <button
                  type="button"
                  aria-label="Abrir la ponencia"
                  onClick={() => abrir(fragmento.idConferencia)}
                  className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-fondo transition-colors hover:bg-[var(--mind-variante)]"
                >
                  <Icono nombre="arrow_outward" className="text-lg" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {escrita && respuesta.sesiones.length > 0 ? (
        <ul className="entrar-escalonado flex flex-col gap-1.5">
          {respuesta.sesiones.map((sesion) => (
            <li key={sesion.id}>
              <button
                type="button"
                onClick={() => abrir(sesion.id)}
                className="flex w-full cursor-pointer items-center gap-3 rounded-[18px] bg-panel px-4 py-2.5 text-left transition-colors hover:bg-[var(--mind-variante)]"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{sesion.titulo}</span>
                  <span className="truncate text-xs text-texto-tenue">{sesion.detalle}</span>
                </span>
                <Icono nombre="arrow_outward" className="text-lg" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {sonando === null ? null : (
        <ReproductorDeCita
          key={sonando.evidencia.clave}
          evidencia={sonando.evidencia}
          idDueno={datos.ponencias.find((ponencia) => ponencia.id === sonando.evidencia.idConferencia)?.idDueno ?? ''}
          ancla={sonando.ancla}
          alCerrar={() => setSonando(null)}
        />
      )}
    </>
  )
}
