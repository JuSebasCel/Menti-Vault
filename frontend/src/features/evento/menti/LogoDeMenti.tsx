import type { ReactElement } from 'react'

/*
  El logo de Menti: la burbuja de conversación de siempre, ahora con cara.
  Dos ojos que parpadean y una sonrisa en forma de "w" —la M de la marca,
  volteada—, para que Menti se sienta alguien con quien se habla y no un
  buscador con forma de globo.

  La versión de barras de voz se descartó: se leía como un ecualizador, no
  como un asistente, y le quitaba justo lo que le faltaba, que era vida.

  Quieto, parpadea de vez en cuando y el destello respira. Pensando, los ojos
  van de un lado a otro como quien lee, y el destello late.
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
      <g className="menti-ojos fill-[var(--bitacora-acento-contraste)]">
        <ellipse cx="14.6" cy="16.4" rx="2.2" ry="2.9" />
        <ellipse cx="25.4" cy="16.4" rx="2.2" ry="2.9" />
      </g>
      <path
        d="M14.8 22.6c.9 1.9 3.6 1.9 4.4 0 .3-.5.9-.5 1.2 0 .9 1.9 3.6 1.9 4.4 0"
        fill="none"
        className="stroke-[var(--bitacora-acento-contraste)]"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        className="menti-destello fill-[var(--bitacora-acento-contraste)]"
        d="M29.6 6.6c.25 1.3.8 1.85 2.1 2.1-1.3.25-1.85.8-2.1 2.1-.25-1.3-.8-1.85-2.1-2.1 1.3-.25 1.85-.8 2.1-2.1Z"
      />
    </svg>
  )
}
