import { useId } from 'react'
import type { ReactElement } from 'react'

/*
  La marca de Menti Vault: la "M" con el trazo redondeado de la píldora del
  dock, recortada en un cuadrado de esquinas suaves. Es la misma figura que
  `public/favicon.svg` y que lleva dentro el logo de Menti, para que la
  pestaña, el acceso y el chat se lean como un mismo producto.

  Reemplaza al dial de caja fuerte: a tamaño de pestaña el dial se volvía un
  círculo con un punto y no se distinguía de cualquier otra app.

  Monocromo: el cuadrado toma el color del texto (`currentColor`) y la M es
  un hueco, así que funciona igual en claro y en oscuro. El `mask` necesita
  un id único: con dos logos en la misma página y un id fijo, el segundo
  usaría la máscara del primero.
*/
export function MarcaDeMenti({ tamano = 32, className }: { tamano?: number; className?: string }): ReactElement {
  const idDeMascara = useId()

  return (
    <svg viewBox="0 0 32 32" width={tamano} height={tamano} aria-hidden="true" className={className}>
      <defs>
        <mask id={idDeMascara}>
          <rect width="32" height="32" rx="10" fill="white" />
          <path
            d="M9.5 22 V10.5 L16 17 L22.5 10.5 V22"
            fill="none"
            stroke="black"
            strokeWidth="3.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </mask>
      </defs>
      <rect width="32" height="32" rx="10" fill="currentColor" mask={`url(#${idDeMascara})`} />
    </svg>
  )
}

/** Marca y nombre juntos, para las pantallas donde el producto se presenta: el acceso y el aviso de escritorio. */
export function Logo({ tamano = 32 }: { tamano?: number }): ReactElement {
  return (
    <span className="inline-flex items-center gap-2.5 text-texto">
      <MarcaDeMenti tamano={tamano} />
      <span className="text-[22px] leading-none font-semibold tracking-tight">Menti Vault</span>
    </span>
  )
}
