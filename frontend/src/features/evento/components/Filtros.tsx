import type { ReactElement } from 'react'
import { useRef, useState } from 'react'
import { Modal, SelectorDeOpciones } from '@/shared/ui'
import { BotonMind, Icono } from './piezas'

/*
  Los filtros de una pantalla, arriba y detrás de un botón, como en Melon
  Mind: "Filtros" en la cabecera abre un modal que nace del botón, con
  "Limpiar filtros" y un selector por criterio cuyo botón es el valor
  ("Estado: Todos"). Las filas de chips debajo de las tarjetas empujaban el
  contenido y repetían en cada pantalla una barra distinta.

  El botón cuenta cuántos filtros hay puestos, para que una lista recortada
  no parezca una lista corta.
*/
export type GrupoDeFiltro = {
  readonly clave: string
  readonly rotulo: string
  readonly icono: string
  readonly opciones: readonly { readonly valor: string; readonly etiqueta: string }[]
  readonly valor: string
  /** El valor que significa "sin filtrar"; elegirlo no cuenta como filtro puesto. */
  readonly porDefecto: string
  readonly alCambiar: (valor: string) => void
}

export function Filtros({ grupos }: { grupos: readonly GrupoDeFiltro[] }): ReactElement {
  const [abierto, setAbierto] = useState(false)
  const boton = useRef<HTMLButtonElement>(null)
  const puestos = grupos.filter((grupo) => grupo.valor !== grupo.porDefecto).length

  return (
    <>
      <BotonMind ref={boton} variante="secundario" icono="page_info" onClick={() => setAbierto(true)}>
        Filtros
        {puestos === 0 ? null : (
          <span className="flex size-5 items-center justify-center rounded-full bg-acento text-[11px] font-semibold text-acento-contraste">
            {puestos}
          </span>
        )}
      </BotonMind>

      <Modal abierto={abierto} alCerrar={() => setAbierto(false)} titulo="Filtros" anclaje="disparador" anclaEn={boton} ancho="angosto">
        <div className="flex flex-col gap-4 pb-2">
          <button
            type="button"
            disabled={puestos === 0}
            onClick={() => grupos.forEach((grupo) => grupo.alCambiar(grupo.porDefecto))}
            className="flex h-10 w-fit cursor-pointer items-center gap-2 rounded-full bg-[var(--mind-neutro)] px-4 text-sm font-medium transition-opacity disabled:cursor-default disabled:opacity-40"
          >
            <Icono nombre="filter_list_off" className="text-lg" />
            Limpiar filtros
          </button>
          {grupos.map((grupo) => (
            <SelectorDeOpciones
              key={grupo.clave}
              opciones={grupo.opciones.map((opcion) => ({ valor: opcion.valor, etiqueta: `${grupo.rotulo}: ${opcion.etiqueta}` }))}
              valor={grupo.valor}
              alCambiar={grupo.alCambiar}
              etiquetaAccesible={grupo.rotulo}
              icono={grupo.icono}
              completo
            />
          ))}
        </div>
      </Modal>
    </>
  )
}
