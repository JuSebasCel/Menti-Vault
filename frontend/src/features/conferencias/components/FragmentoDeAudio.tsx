import type { MouseEvent, ReactElement } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { formatearTimestamp } from '../data'
import { urlDelAudio } from '../repositorio'

/*
  El tramo de audio de una ficha, con lo que se dijo alrededor.

  Suena desde unos segundos antes de la ficha hasta unos segundos después:
  la ficha sola dura en promedio siete segundos, y siete segundos sueltos no
  dejan oír de qué se venía hablando ni cómo siguió. La ficha queda marcada
  dentro de la onda —sus barras en el acento, las del contexto más tenues—,
  así que se ve qué parte es la ficha sin perder el alrededor.

  La onda no es la del audio: calcularla exigiría descargar y decodificar el
  archivo entero para dibujar veinte segundos. Es una silueta estable —la
  misma siempre para la misma ficha, sembrada con su conferencia y su
  minuto— que da al tramo la forma de algo que suena. Entra creciendo, la
  barra que suena late, y el avance se mueve cuadro a cuadro y no a los
  saltos de cuatro por segundo de `timeupdate`.

  El audio no se pide hasta el primer play: la mayoría de las fichas se leen
  sin escucharse. `preload="none"` por lo mismo.
*/
export type PropsFragmentoDeAudio = {
  idDueno: string
  idConferencia: string
  inicio: number
  fin: number
}

type Estado = 'quieto' | 'cargando' | 'sonando' | 'sin-audio'

/* Cuánto contexto se oye antes y después de la ficha. */
const CONTEXTO_S = 8
const BARRAS = 64

/* Un generador pseudoaleatorio con semilla: la misma ficha, la misma onda. */
function alturasDeOnda(semilla: string): number[] {
  let estado = 0
  for (const caracter of semilla) {
    estado = (estado * 31 + caracter.charCodeAt(0)) | 0
  }

  const crudas = Array.from({ length: BARRAS }, () => {
    estado = (estado + 0x6d2b79f5) | 0
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado)
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  })

  /* Suavizada con sus vecinas, para que parezca habla y no ruido. */
  return crudas.map((_, indice) => {
    const vecinas = [crudas[indice - 1], crudas[indice], crudas[indice + 1]].filter(
      (valor): valor is number => valor !== undefined,
    )
    const media = vecinas.reduce((suma, valor) => suma + valor, 0) / vecinas.length
    return 0.22 + media * 0.78
  })
}

export function FragmentoDeAudio({ idDueno, idConferencia, inicio, fin }: PropsFragmentoDeAudio): ReactElement {
  const audio = useRef<HTMLAudioElement>(null)
  const [estado, setEstado] = useState<Estado>('quieto')
  const desde = Math.max(0, inicio - CONTEXTO_S)
  const hasta = Math.max(fin, inicio + 1) + CONTEXTO_S
  const duracion = hasta - desde
  const [posicion, setPosicion] = useState(desde)
  const alturas = useMemo(() => alturasDeOnda(`${idConferencia}:${inicio}`), [idConferencia, inicio])

  /* Otra ficha, otro tramo: se para lo que sonaba y se vuelve al principio. */
  useEffect(() => {
    audio.current?.pause()
    setEstado((anterior) => (anterior === 'sin-audio' ? anterior : 'quieto'))
    setPosicion(desde)
  }, [desde, hasta])

  /* El avance cuadro a cuadro mientras suena; al llegar al final del tramo, se para. */
  useEffect(() => {
    if (estado !== 'sonando') {
      return
    }

    let cuadro = 0
    const avanzar = (): void => {
      const elemento = audio.current
      if (elemento === null) {
        return
      }

      if (elemento.currentTime >= hasta) {
        elemento.pause()
        elemento.currentTime = desde
        setPosicion(desde)
        setEstado('quieto')
        return
      }

      setPosicion(elemento.currentTime)
      cuadro = requestAnimationFrame(avanzar)
    }

    cuadro = requestAnimationFrame(avanzar)
    return () => cancelAnimationFrame(cuadro)
  }, [estado, desde, hasta])

  /* Al desmontar se suelta la fuente: un audio fuera del documento sigue sonando y ya nadie lo puede parar. */
  useEffect(() => {
    const elemento = audio.current
    return () => {
      if (elemento !== null) {
        elemento.pause()
        elemento.removeAttribute('src')
        elemento.load()
      }
    }
  }, [])

  async function alternar(): Promise<void> {
    const elemento = audio.current
    if (elemento === null) {
      return
    }

    if (estado === 'sonando') {
      elemento.pause()
      setEstado('quieto')
      return
    }

    if (estado === 'cargando') {
      return
    }

    if (elemento.src === '') {
      setEstado('cargando')
      const url = await urlDelAudio(idDueno, idConferencia)
      /* Si mientras se pedía la dirección se cerró la ficha, no se arranca en un elemento desmontado. */
      if (!elemento.isConnected) {
        return
      }
      if (url === null) {
        setEstado('sin-audio')
        return
      }
      elemento.src = url
    }

    if (elemento.currentTime < desde || elemento.currentTime >= hasta) {
      elemento.currentTime = desde
    }

    try {
      await elemento.play()
      setEstado('sonando')
    } catch {
      setEstado('sin-audio')
    }
  }

  function saltar(evento: MouseEvent<HTMLDivElement>): void {
    const elemento = audio.current
    if (elemento === null || elemento.src === '') {
      return
    }

    const caja = evento.currentTarget.getBoundingClientRect()
    const proporcion = Math.min(1, Math.max(0, (evento.clientX - caja.left) / caja.width))
    elemento.currentTime = desde + proporcion * duracion
    setPosicion(elemento.currentTime)
  }

  if (estado === 'sin-audio') {
    return (
      <p className="rounded-full bg-acento-tenue px-4 py-2 text-sm text-texto-tenue">
        No hay audio disponible para esta conferencia.
      </p>
    )
  }

  return (
    <div className="flex items-center gap-3 rounded-[24px] bg-acento-tenue py-2 pr-4 pl-2">
      <audio ref={audio} preload="none" onEnded={() => setEstado('quieto')} />

      <button
        type="button"
        onClick={() => void alternar()}
        disabled={estado === 'cargando'}
        aria-label={estado === 'sonando' ? 'Pausar el fragmento' : 'Escuchar el fragmento'}
        className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-acento text-acento-contraste transition-transform active:scale-95 disabled:cursor-wait"
      >
        <span
          aria-hidden="true"
          className={`material-symbols-rounded icono-relleno text-xl ${estado === 'cargando' ? 'animate-spin' : ''}`}
        >
          {estado === 'cargando' ? 'progress_activity' : estado === 'sonando' ? 'pause' : 'play_arrow'}
        </span>
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div
          role="slider"
          aria-label="Posición dentro del fragmento"
          aria-valuemin={Math.round(desde)}
          aria-valuemax={Math.round(hasta)}
          aria-valuenow={Math.round(posicion)}
          tabIndex={-1}
          onClick={saltar}
          className="flex h-10 cursor-pointer items-center gap-[2px]"
        >
          {alturas.map((altura, indice) => {
            const momento = desde + ((indice + 0.5) / BARRAS) * duracion
            const enLaFicha = momento >= inicio && momento <= fin
            const sonada = momento <= posicion
            const sonandoAhora = estado === 'sonando' && Math.abs(momento - posicion) < duracion / BARRAS

            return (
              <span
                key={indice}
                aria-hidden="true"
                style={{ height: `${altura * 100}%`, animationDelay: `${indice * 6}ms` }}
                className={`barra-de-onda min-w-0 flex-1 rounded-full transition-colors duration-150 ${
                  sonandoAhora ? 'barra-sonando' : ''
                } ${
                  sonada
                    ? enLaFicha
                      ? 'bg-acento'
                      : 'bg-acento/45'
                    : enLaFicha
                      ? 'bg-ilustracion-texto/55'
                      : 'bg-texto-tenue/25'
                }`}
              />
            )
          })}
        </div>

        <div className="coordenada flex justify-between text-xs text-texto-tenue">
          <span>{formatearTimestamp(posicion)}</span>
          <span>
            Ficha {formatearTimestamp(inicio)}–{formatearTimestamp(fin)}
          </span>
          <span>{formatearTimestamp(hasta)}</span>
        </div>
      </div>
    </div>
  )
}
