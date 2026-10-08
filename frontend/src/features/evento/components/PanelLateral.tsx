import type { ReactElement, ReactNode } from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icono } from './piezas'

/*
  El detalle de un registro: un panel a la derecha que nace del botón que lo
  abrió, con la lista todavía a la vista detrás.

  Medido en la referencia: arranca con la caja del botón, desenfocado (8px) y
  transparente, y llega a su sitio en unos 400ms con una cola larga, sin
  rebote. Al cerrar hace el camino de vuelta. Va con la API de animaciones y
  no con transiciones CSS porque el punto de partida depende de dónde estaba
  el botón, que solo se conoce al abrir.

  Se cierra con Escape o pulsando fuera, como el Modal del sistema. Se monta
  con `createPortal` por la misma razón que el Modal: un ancestro con
  `position: sticky` o `transform` le cambiaría el contexto de `fixed`.
*/
export type PropsPanelLateral = {
  abierto: boolean
  alCerrar: () => void
  /** La caja del elemento que lo abrió: de ahí nace y ahí vuelve. */
  origen: DOMRect | null
  titulo: string
  children: ReactNode
}

const DURACION_ABRIR = 420
const DURACION_CERRAR = 320
const CURVA = 'cubic-bezier(0.2, 0.9, 0.1, 1)'

function desde(origen: DOMRect | null, caja: DOMRect): Keyframe {
  if (origen === null || origen.width === 0) {
    return { transform: 'translateX(24px)', opacity: 0, filter: 'blur(8px)' }
  }
  const x = origen.left - caja.left
  const y = origen.top - caja.top
  return {
    transform: `translate(${x}px, ${y}px) scale(${origen.width / caja.width}, ${origen.height / caja.height})`,
    opacity: 0,
    filter: 'blur(8px)',
  }
}

export function PanelLateral({ abierto, alCerrar, origen, titulo, children }: PropsPanelLateral): ReactElement | null {
  const [montado, setMontado] = useState(abierto)
  const ventana = useRef<HTMLDivElement>(null)
  const velo = useRef<HTMLDivElement>(null)
  /* El origen se congela al abrir: si el botón se vuelve a montar, el cierre sigue sabiendo a dónde volver. */
  const origenAlAbrir = useRef<DOMRect | null>(null)

  useEffect(() => {
    if (abierto) {
      origenAlAbrir.current = origen
      setMontado(true)
    }
  }, [abierto, origen])

  useLayoutEffect(() => {
    const caja = ventana.current
    if (!montado || caja === null) {
      return
    }
    const rect = caja.getBoundingClientRect()
    const reducido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

    if (abierto) {
      caja.animate([desde(origenAlAbrir.current, rect), { transform: 'none', opacity: 1, filter: 'blur(0)' }], {
        duration: reducido ? 0 : DURACION_ABRIR,
        easing: CURVA,
        fill: 'both',
      })
      velo.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reducido ? 0 : 250, fill: 'both' })
      return
    }

    const salida = caja.animate([{ transform: 'none', opacity: 1, filter: 'blur(0)' }, desde(origenAlAbrir.current, rect)], {
      duration: reducido ? 0 : DURACION_CERRAR,
      easing: 'cubic-bezier(0.4, 0, 0.6, 1)',
      fill: 'both',
    })
    velo.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reducido ? 0 : DURACION_CERRAR, fill: 'both' })
    salida.onfinish = () => setMontado(false)
  }, [abierto, montado])

  useEffect(() => {
    if (!abierto) {
      return
    }
    const alPulsar = (evento: KeyboardEvent): void => {
      if (evento.key === 'Escape') {
        alCerrar()
      }
    }
    window.addEventListener('keydown', alPulsar)
    return () => window.removeEventListener('keydown', alPulsar)
  }, [abierto, alCerrar])

  if (!montado) {
    return null
  }

  return createPortal(
    <div className="fixed inset-0 z-40">
      <div ref={velo} className="absolute inset-0 bg-black/10" onClick={alCerrar} aria-hidden="true" />
      <div
        ref={ventana}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        style={{ transformOrigin: 'top left' }}
        className="absolute top-2 right-2 bottom-2 flex w-[min(800px,calc(100vw-260px))] flex-col overflow-hidden rounded-[32px] bg-fondo shadow-[0_0_0_1px_var(--bitacora-filete)]"
      >
        <div className="flex shrink-0 items-center px-4 pt-4">
          <button
            type="button"
            onClick={alCerrar}
            aria-label="Cerrar"
            className="flex size-10 cursor-pointer items-center justify-center rounded-full bg-acento-tenue text-texto transition-colors hover:bg-filete"
          >
            <Icono nombre="close" className="text-xl" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
