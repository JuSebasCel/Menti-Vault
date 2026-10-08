import type { ReactElement } from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { urlDelAudio } from '@/features/conferencias/repositorio/repositorio'
import { minuto } from '../formato'
import type { Evidencia } from '../tipos'
import { Icono } from './piezas'

/*
  Escuchar una cita donde se lee: una píldora que aparece junto a la
  referencia que se pulsó, no arriba del artículo, para que quien comprueba
  la cita no pierda el renglón.

  Suena el tramo de la cita con unos segundos de aire antes, y se para sola
  al terminar: lo que se quiere oír es esa frase, no los cuarenta minutos
  siguientes. Se cierra con Escape, pulsando fuera o con su botón.
*/
const ANTES_S = 2
const TRAMO_S = 18
const ANCHO = 340

export function ReproductorDeCita({
  evidencia,
  idDueno,
  ancla,
  alCerrar,
}: {
  evidencia: Evidencia
  idDueno: string
  /** El botón de la cita: el reproductor se queda pegado a él aunque se desplace el texto. */
  ancla: HTMLElement
  alCerrar: () => void
}): ReactElement {
  const audio = useRef<HTMLAudioElement>(null)
  const caja = useRef<HTMLDivElement>(null)
  const [estado, setEstado] = useState<'cargando' | 'sonando' | 'pausa' | 'sin-audio'>('cargando')
  const [avance, setAvance] = useState(0)
  const inicio = Math.max(0, evidencia.segundo - ANTES_S)

  useEffect(() => {
    let vigente = true
    const elemento = audio.current
    void urlDelAudio(idDueno, evidencia.idConferencia).then((url) => {
      if (!vigente || elemento === null) {
        return
      }
      if (url === null) {
        setEstado('sin-audio')
        return
      }
      /*
        El salto al minuto espera a los metadatos: en un .m4a, fijar
        `currentTime` antes de conocer la duración se ignora y la cita
        sonaría desde el principio de la charla.
      */
      elemento.addEventListener(
        'loadedmetadata',
        () => {
          elemento.currentTime = inicio
          void elemento.play().then(
            () => setEstado('sonando'),
            () => setEstado('pausa'),
          )
        },
        { once: true },
      )
      elemento.src = url
      elemento.load()
    })
    return () => {
      vigente = false
      elemento?.pause()
    }
  }, [idDueno, evidencia.idConferencia, inicio])

  /* El avance cuadro a cuadro, y no a los saltos de cuatro por segundo de `timeupdate`. */
  useEffect(() => {
    if (estado !== 'sonando') {
      return
    }
    let cuadro = 0
    const seguir = (): void => {
      const elemento = audio.current
      if (elemento !== null) {
        const transcurrido = elemento.currentTime - inicio
        setAvance(Math.min(1, Math.max(0, transcurrido / TRAMO_S)))
        if (transcurrido >= TRAMO_S) {
          elemento.pause()
          setEstado('pausa')
          return
        }
      }
      cuadro = requestAnimationFrame(seguir)
    }
    cuadro = requestAnimationFrame(seguir)
    return () => cancelAnimationFrame(cuadro)
  }, [estado, inicio])

  useEffect(() => {
    const alPulsar = (evento: KeyboardEvent): void => {
      if (evento.key === 'Escape') {
        alCerrar()
      }
    }
    const alPulsarFuera = (evento: MouseEvent): void => {
      if (!caja.current?.contains(evento.target as Node)) {
        alCerrar()
      }
    }
    window.addEventListener('keydown', alPulsar)
    window.addEventListener('mousedown', alPulsarFuera)
    return () => {
      window.removeEventListener('keydown', alPulsar)
      window.removeEventListener('mousedown', alPulsarFuera)
    }
  }, [alCerrar])

  /*
    Debajo de la cita si cabe; si no, encima. Siempre dentro de la ventana, y
    recolocado al desplazar: el artículo se lee con scroll y una píldora fija
    se quedaba flotando lejos de su cita.
  */
  const [posicion, setPosicion] = useState({ top: 0, left: 0 })
  useLayoutEffect(() => {
    let cuadro = 0
    const colocar = (): void => {
      const caja_ = ancla.getBoundingClientRect()
      const alto = caja.current?.offsetHeight ?? 64
      const abajo = caja_.bottom + 8 + alto <= window.innerHeight - 8
      setPosicion({
        top: abajo ? caja_.bottom + 8 : caja_.top - 8 - alto,
        left: Math.min(Math.max(8, caja_.left + caja_.width / 2 - ANCHO / 2), window.innerWidth - ANCHO - 8),
      })
    }
    const alMover = (): void => {
      cancelAnimationFrame(cuadro)
      cuadro = requestAnimationFrame(colocar)
    }
    colocar()
    window.addEventListener('scroll', alMover, true)
    window.addEventListener('resize', alMover)
    return () => {
      cancelAnimationFrame(cuadro)
      window.removeEventListener('scroll', alMover, true)
      window.removeEventListener('resize', alMover)
    }
  }, [ancla])

  const alternar = (): void => {
    const elemento = audio.current
    if (elemento === null || estado === 'sin-audio') {
      return
    }
    if (estado === 'sonando') {
      elemento.pause()
      setEstado('pausa')
      return
    }
    if (avance >= 1) {
      elemento.currentTime = inicio
      setAvance(0)
    }
    void elemento.play().then(() => setEstado('sonando'))
  }

  return createPortal(
    <div
      ref={caja}
      role="dialog"
      aria-label={`Audio de ${evidencia.ponente}`}
      style={{ top: posicion.top, left: posicion.left, width: ANCHO }}
      className="entrar-escalonado fixed z-50 flex items-center gap-3 rounded-full bg-acento py-2 pr-3 pl-2 text-acento-contraste shadow-[0_12px_32px_-10px_rgb(0_0_0/0.5)]"
    >
      <audio ref={audio} preload="metadata" />
      <button
        type="button"
        onClick={alternar}
        aria-label={estado === 'sonando' ? 'Pausar' : 'Reproducir'}
        disabled={estado === 'sin-audio'}
        className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-acento-contraste text-acento transition-transform hover:scale-105 disabled:opacity-40"
      >
        {estado === 'cargando' ? (
          <span className="size-5 animate-spin rounded-full border-2 border-acento/30 border-t-acento" />
        ) : (
          <Icono nombre={estado === 'sonando' ? 'pause' : 'play_arrow'} className="text-2xl" />
        )}
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex items-baseline justify-between gap-2 text-xs">
          <span className="truncate font-medium">{estado === 'sin-audio' ? 'Sin grabación' : evidencia.ponente}</span>
          <span className="shrink-0 font-mono opacity-70">{minuto(inicio + avance * TRAMO_S)}</span>
        </span>
        <span className="h-1 overflow-hidden rounded-full bg-acento-contraste/25">
          <span className="block h-full rounded-full bg-acento-contraste" style={{ width: `${avance * 100}%` }} />
        </span>
      </div>
      <button
        type="button"
        onClick={alCerrar}
        aria-label="Cerrar"
        className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full opacity-70 transition-opacity hover:opacity-100"
      >
        <Icono nombre="close" className="text-lg" />
      </button>
    </div>,
    document.body,
  )
}
