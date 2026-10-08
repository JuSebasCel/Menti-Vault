import type { ButtonHTMLAttributes, ReactElement, ReactNode } from 'react'
import { forwardRef } from 'react'
import { CLASES_DE_PILDORA } from '@/shared/ui'
import type { ColorDePildora } from '@/shared/ui'

/*
  Las piezas del dialecto Melon Mind, medidas en la referencia
  (`planes/referencia-melonmind-mind.md`): encabezado de página con las
  acciones a la derecha, tarjetas bento de radio 24, cifras protagonistas y
  botones en píldora. Viven aquí y no en `shared/ui` mientras el lenguaje no
  esté aprobado: cuando lo esté, se mudan.
*/

export function Icono({ nombre, relleno = true, className = '' }: { nombre: string; relleno?: boolean; className?: string }): ReactElement {
  return (
    <span aria-hidden="true" className={`material-symbols-rounded ${relleno ? 'icono-relleno' : 'icono-contorno'} ${className}`}>
      {nombre}
    </span>
  )
}

export function EncabezadoDePagina({ titulo, children }: { titulo: string; children?: ReactNode }): ReactElement {
  return (
    <header className="flex h-10 shrink-0 items-center justify-between gap-4">
      <h1 className="text-2xl leading-none font-normal text-texto">{titulo}</h1>
      <div className="flex items-center gap-2">{children}</div>
    </header>
  )
}

type PropsBoton = ButtonHTMLAttributes<HTMLButtonElement> & { icono?: string; variante?: 'primario' | 'secundario' | 'tenue' }

/* Primario negro, secundario con filete, tenue sobre el gris de los chips. 40px de alto en los tres. */
export const BotonMind = forwardRef<HTMLButtonElement, PropsBoton>(function BotonMind(
  { icono, variante = 'primario', className = '', children, ...resto },
  ref,
) {
  const estilo =
    variante === 'primario'
      ? 'bg-acento text-acento-contraste hover:opacity-85'
      : variante === 'secundario'
        ? 'tarjeta-borde bg-fondo text-texto hover:bg-panel'
        : 'bg-acento-tenue text-texto hover:bg-filete'

  return (
    <button
      ref={ref}
      type="button"
      className={`flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-full ${icono === undefined ? 'px-6' : 'pr-6 pl-4'} text-sm font-medium transition-[opacity,background-color] disabled:cursor-default disabled:opacity-40 ${estilo} ${className}`}
      {...resto}
    >
      {icono === undefined ? null : <Icono nombre={icono} className="text-lg" />}
      {children}
    </button>
  )
})

export function Tarjeta({
  children,
  variante = 'borde',
  className = '',
}: {
  children: ReactNode
  variante?: 'borde' | 'rellena'
  className?: string
}): ReactElement {
  return (
    <section className={`rounded-[24px] p-6 ${variante === 'rellena' ? 'bg-panel' : 'tarjeta-borde bg-fondo'} ${className}`}>
      {children}
    </section>
  )
}

/* El dato protagonista de una tarjeta: rótulo a 16/500 al 80 % y la cifra a 45/600 sin interlineado. */
export function Cifra({ rotulo, valor, detalle }: { rotulo: string; valor: ReactNode; detalle?: ReactNode }): ReactElement {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-base leading-none font-medium text-texto opacity-80">{rotulo}</span>
      <span className="text-[45px] leading-none font-semibold text-texto">{valor}</span>
      {detalle === undefined ? null : <span className="text-sm text-texto-tenue">{detalle}</span>}
    </div>
  )
}

export function Estado({ etiqueta, color }: { etiqueta: string; color: ColorDePildora }): ReactElement {
  return (
    <span className={`inline-flex h-7 shrink-0 items-center rounded-full px-3 text-[13px] whitespace-nowrap ${CLASES_DE_PILDORA[color]}`}>
      {etiqueta}
    </span>
  )
}

export function Chip({ elegido, children, onClick }: { elegido: boolean; children: ReactNode; onClick: () => void }): ReactElement {
  return (
    <button type="button" className="chip-mind" data-elegido={elegido} aria-pressed={elegido} onClick={onClick}>
      {children}
    </button>
  )
}

export function Avatar({ texto, grande = false }: { texto: string; grande?: boolean }): ReactElement {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-acento-tenue font-semibold text-texto ${grande ? 'size-16 text-[28px]' : 'size-9 text-sm'}`}
    >
      {texto}
    </span>
  )
}

export function Vacio({ icono, texto }: { icono: string; texto: string }): ReactElement {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-texto-tenue">
      <Icono nombre={icono} className="text-[56px]" />
      <p className="text-2xl font-medium">{texto}</p>
    </div>
  )
}

/* Rótulo y valor de una ficha de datos, como en el detalle de la referencia. */
export function Dato({ rotulo, children }: { rotulo: string; children: ReactNode }): ReactElement {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-texto-tenue">{rotulo}</span>
      <span className="text-base text-texto">{children}</span>
    </div>
  )
}
