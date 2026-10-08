import type { ReactElement, ReactNode } from 'react'
import { motion, useReducedMotion, type Variants } from 'motion/react'
import { MarcaDeMenti } from '@/shared/ui'
import { LogoDeMenti } from '@/features/evento/menti/LogoDeMenti'

/*
  Marco visual común a las dos pantallas públicas de autenticación, en el
  dialecto de Melon Mind del resto de la app.

  A la izquierda el formulario; a la derecha el producto contado con sus
  propias piezas —un evento con sus autorizaciones, una cita verificada con
  su minuto, Menti respondiendo— en vez de con una frase sobre él. Son
  ilustrativas y no salen de ningún evento real.

  Sin cabecera compacta para pantallas estrechas: la app no se abre en
  móvil (ver `app/SoloEscritorio.tsx`), así que el panel de marca siempre
  está a la vista y lleva el único h1.
*/

const DESCRIPCION = 'Del congreso a la publicación: autorizaciones, memorias, artículos con citas verificadas y redes, en un solo lugar.'

const CONTENEDOR: Variants = {
  oculto: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
}

const ELEMENTO: Variants = {
  oculto: { opacity: 0, y: 14, filter: 'blur(8px)' },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.5, ease: [0.37, 0.35, 0, 1] },
  },
}

export type PropsMarcoDeAcceso = {
  /* Id del título del panel, para dar nombre accesible a la sección. */
  idTitulo: string
  titulo: string
  children: ReactNode
}

export function MarcoDeAcceso({ idTitulo, titulo, children }: PropsMarcoDeAcceso): ReactElement {
  const reducirMovimiento = useReducedMotion()
  const estadoInicial = reducirMovimiento ? 'visible' : 'oculto'

  return (
    <main className="grid h-dvh grid-cols-[1fr_1.05fr] gap-4 overflow-hidden bg-fondo p-4 font-sans text-texto">
      <motion.div
        variants={CONTENEDOR}
        initial={estadoInicial}
        animate="visible"
        className="flex min-h-0 flex-col overflow-y-auto px-6 py-8"
      >
        <motion.div variants={ELEMENTO} className="flex items-center gap-3">
          <MarcaDeMenti tamano={28} />
          <span className="font-['Inter_Variable'] text-lg font-medium">Menti Vault</span>
        </motion.div>

        <div className="flex flex-1 items-center justify-center py-8">
          <motion.section
            variants={ELEMENTO}
            aria-labelledby={idTitulo}
            className="tarjeta-borde w-full max-w-[26rem] rounded-[32px] bg-fondo p-8"
          >
            <h2 id={idTitulo} className="text-[32px] leading-tight font-semibold text-texto">
              {titulo}
            </h2>

            {children}
          </motion.section>
        </div>
      </motion.div>

      <motion.aside
        variants={CONTENEDOR}
        initial={estadoInicial}
        animate="visible"
        className="flex min-h-0 flex-col justify-between gap-8 overflow-hidden rounded-[32px] bg-panel p-12"
      >
        <div>
          <motion.h1 variants={ELEMENTO} className="text-6xl leading-[1.02] font-semibold tracking-tight text-texto">
            Menti Vault
          </motion.h1>
          <motion.p variants={ELEMENTO} className="mt-5 max-w-md text-lg leading-relaxed text-texto-tenue">
            {DESCRIPCION}
          </motion.p>
        </div>

        {/* El producto en tres piezas, como se ven dentro: ilustrativas. */}
        <div className="grid max-w-xl grid-cols-2 gap-2">
          <motion.div variants={ELEMENTO} className="flex flex-col gap-3 rounded-[24px] bg-fondo p-5">
            <span className="text-sm font-medium opacity-80">Ponentes</span>
            <span className="text-[40px] leading-none font-semibold">6 de 8</span>
            <span className="w-fit rounded-full bg-[var(--tono-verde)] px-3 py-1 text-xs font-medium [color:var(--tono-verde-texto)]">
              Autorizaron
            </span>
          </motion.div>
          <motion.div variants={ELEMENTO} className="relative flex flex-col justify-between gap-3 overflow-hidden rounded-[24px] bg-acento p-5 text-acento-contraste">
            <span className="text-sm opacity-70">Memoria general</span>
            <span className="text-2xl leading-tight font-semibold">Lista para entregar</span>
            <span className="material-symbols-rounded icono-relleno absolute -right-3 -bottom-4 text-[96px] opacity-15" aria-hidden="true">
              menu_book
            </span>
          </motion.div>
          <motion.figure variants={ELEMENTO} aria-label="Cita de ejemplo" className="col-span-2 flex flex-col gap-3 rounded-[24px] bg-fondo p-5">
            <blockquote className="text-lg leading-snug font-medium">
              «Se puede delegar la ejecución, pero no la responsabilidad.»{' '}
              <span className="inline-flex translate-y-[-2px] items-center gap-1 rounded-full bg-[var(--tono-azul)] px-2 py-0.5 align-middle text-xs font-normal [color:var(--tono-azul-texto)]">
                <span className="material-symbols-rounded icono-relleno text-sm" aria-hidden="true">graphic_eq</span>
                min. 30:11
              </span>
            </blockquote>
            <figcaption className="text-sm text-texto-tenue">Cada cita de un artículo, verificada contra la grabación.</figcaption>
          </motion.figure>
          <motion.div variants={ELEMENTO} className="col-span-2 flex items-center gap-3 rounded-[24px] bg-fondo p-4">
            <LogoDeMenti tamano={36} />
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-semibold">Menti</span>
              <span className="truncate text-sm text-texto-tenue">Pregúntale al evento quién habló de qué, y escúchalo.</span>
            </span>
          </motion.div>
        </div>
      </motion.aside>
    </main>
  )
}

/*
  Pie del panel: la vía alterna (registrarse o volver al acceso). Se separa del
  formulario con un filete para que no compita con el botón principal.
*/
export function PieDeMarco({ children }: { children: ReactNode }): ReactElement {
  return <p className="mt-6 border-t border-filete pt-5 text-sm text-texto-tenue">{children}</p>
}

/* Enlace de texto dentro del panel. Subrayado siempre visible: no depende del color. */
export const CLASES_ENLACE = 'rounded-md font-medium text-acento underline underline-offset-2'
