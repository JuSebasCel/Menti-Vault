import type { ReactElement } from 'react'

/*
  El logo de Menti: una burbuja de conversación de esquinas suaves con cinco
  barras de voz dentro. Las barras dibujan una M —altas a los lados, más
  bajas hacia el centro—, así que se lee a la vez como "Menti" y como "lo
  que se dijo", que es de lo que está hecho: transcripciones.

  Reemplaza a la M trazada dentro de un globo, que a 30 px se confundía con
  el ícono de la app y no decía nada de por qué Menti sabe lo que sabe.

  Pensando, las barras se mueven como una voz y el destello late; quieto,
  solo el destello respira de vez en cuando.
*/
const BARRAS = [
  { x: 10.5, alto: 15 },
  { x: 15.25, alto: 9.5 },
  { x: 20, alto: 6 },
  { x: 24.75, alto: 9.5 },
  { x: 29.5, alto: 15 },
] as const

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
        d="M15.5 3.5h9c6.9 0 12 5.1 12 12v5.5c0 6.9-5.1 12-12 12h-8.2l-6.1 4.2c-.9.6-2.1-.1-1.9-1.2l.7-4C5.6 30 3.5 26.2 3.5 21V15.5c0-6.9 5.1-12 12-12Z"
        className="fill-[var(--bitacora-acento)]"
      />
      {BARRAS.map((barra, indice) => (
        <rect
          key={barra.x}
          className="menti-barra fill-[var(--bitacora-acento-contraste)]"
          style={{ animationDelay: `${indice * 110}ms` }}
          x={barra.x - 1.6}
          y={18.25 - barra.alto / 2}
          width="3.2"
          height={barra.alto}
          rx="1.6"
        />
      ))}
      <path
        className="menti-destello fill-[var(--bitacora-acento-contraste)]"
        d="M29.5 5.6c.25 1.25.75 1.75 2 2-1.25.25-1.75.75-2 2-.25-1.25-.75-1.75-2-2 1.25-.25 1.75-.75 2-2Z"
      />
    </svg>
  )
}
