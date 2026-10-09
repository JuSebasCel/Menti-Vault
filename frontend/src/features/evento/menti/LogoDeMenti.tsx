import type { ReactElement } from 'react'

/*
  El logo de Menti: una burbuja de conversación con la "M" de la marca y un
  destello en la esquina. La M es el mismo trazo del ícono de la app, para
  que Menti se lea como parte del producto y no como un widget ajeno.

  Pensando, la M se dibuja una y otra vez y el destello late: es la señal de
  que está leyendo, más honesta que tres puntos genéricos.
*/
export function LogoDeMenti({ tamano = 40, pensando = false }: { tamano?: number; pensando?: boolean }): ReactElement {
  return (
    <svg
      width={tamano}
      height={tamano}
      viewBox="0 0 40 40"
      aria-hidden="true"
      className={pensando ? 'menti-pensando' : 'menti-quieto'}
    >
      <path
        d="M20 3.5c9.4 0 16.5 6.6 16.5 15.6S29.4 34.6 20 34.6c-2 0-3.9-.3-5.7-.9L7.6 36.6c-.9.4-1.8-.4-1.5-1.3l1.6-5C5 27.6 3.5 23.6 3.5 19.1 3.5 10.1 10.6 3.5 20 3.5Z"
        className="fill-[var(--bitacora-acento)]"
      />
      <path
        className="menti-trazo stroke-[var(--bitacora-acento-contraste)]"
        d="M12.8 24V14.4L20 21.2 27.2 14.4V24"
        fill="none"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={100}
      />
      <path
        className="menti-destello fill-[var(--bitacora-acento-contraste)]"
        d="M31 6.2c.3 1.6 1 2.3 2.6 2.6-1.6.3-2.3 1-2.6 2.6-.3-1.6-1-2.3-2.6-2.6 1.6-.3 2.3-1 2.6-2.6Z"
      />
    </svg>
  )
}
