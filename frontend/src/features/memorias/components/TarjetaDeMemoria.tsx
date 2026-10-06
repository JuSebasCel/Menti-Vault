import type { MouseEvent, ReactElement, ReactNode } from 'react'
import { useRef } from 'react'
import { recordarOrigenDeApertura, useAterrizarDesdeCierre } from '@/shared/ui'
import { Link } from 'react-router'
import { formatearFecha } from '@/features/conferencias/data'
import type { Memoria } from '../data'

/*
  El mismo contenido, navegable o no. Se usa un `div` en vez de un `Link`
  deshabilitado porque un ancla sin destino sigue recibiendo el foco y el
  teclado, y anunciaría a un lector de pantalla un enlace que no lleva a
  ninguna parte.
*/
function Enlace({
  to,
  desactivado,
  onClick,
  className,
  children,
}: {
  to: string
  desactivado: boolean
  onClick: (evento: MouseEvent<HTMLAnchorElement>) => void
  className: string
  children: ReactNode
}): ReactElement {
  if (desactivado) {
    return <div className={className}>{children}</div>
  }

  return (
    <Link to={to} onClick={onClick} className={className}>
      {children}
    </Link>
  )
}

export type PropsTarjetaDeMemoria = {
  memoria: Memoria
  nombreConferencia: string
  nombrePlantilla: string
  alEliminar: () => void
  /**
   * `tarjeta` apila los datos en una grilla; `fila` los pone en una línea
   * para poder barrer muchos de un vistazo. Es la misma información: cambia
   * cuánto espacio vertical ocupa cada una.
   */
  variante?: 'tarjeta' | 'fila'
}

/*
  Tarjeta del listado de memorias. La superficie (`bg-fondo`) ya separa cada
  tarjeta en reposo, sin sombra: en este sistema la separación la da el tono,
  no una elevación. El hover solo lleva el título al color de acento.

  La barra de "generando" vive aquí, no en el panel que la creó: al enviar
  el panel, la memoria queda guardada y su tarjeta aparece de inmediato en el
  listado — mismo criterio que una conferencia recién cargada aparece
  "Procesando" en el dashboard (F3), en vez de bloquear el panel hasta que
  termine.

  La barra no tiene porcentaje, y es a propósito: la redacción son varias
  llamadas al modelo cuyo número depende de cuánto haya que rastrear, así que
  cualquier cifra sería inventada. Un barrido dice "esto sigue andando", que
  es lo único que se sabe de verdad. La anterior era una cuenta de 2,5
  segundos que llegaba al 100 % mientras el backend seguía trabajando.
*/
export function TarjetaDeMemoria({
  memoria,
  nombreConferencia,
  nombrePlantilla,
  alEliminar,
  variante = 'tarjeta',
}: PropsTarjetaDeMemoria): ReactElement {
  const esFila = variante === 'fila'
  const tarjeta = useRef<HTMLDivElement>(null)
  /* Al volver del detalle, la tarjeta se recompone desde donde estaba la pantalla. */
  useAterrizarDesdeCierre(tarjeta, memoria.id)
  const generando = memoria.estado === 'generando'
  const fallida = memoria.estado === 'fallida'

  function alPulsarEliminar(): void {
    if (window.confirm(`¿Eliminar la memoria «${memoria.nombre}»? Esta acción no se puede deshacer.`)) {
      alEliminar()
    }
  }

  return (
    /*
      Radio de 24px y superficie llena, sin sombra: en el sistema nuevo la
      separación la da el tono de la superficie, no una elevación. Y con más
      aire dentro (p-6), que es lo que hace que la tarjeta se lea como un
      objeto y no como una fila apretada.
    */
    /*
      Se fue la barra de acento del borde izquierdo: con la tarjeta ya
      redondeada a 24px, una línea recta pegada al canto se veía como un
      resto del sistema anterior. El hover se marca en el título, que es lo
      que se va a pulsar.
    */
    <div
      ref={tarjeta}
      data-memoria={memoria.id}
      /*
        `bg-fondo` y no `bg-panel`: el panel que las contiene pasó a ser gris,
        y una tarjeta del mismo tono sobre él deja de leerse como tarjeta.
        Aquí la jerarquía es al revés que en el archivo — la superficie que
        contiene es la clara y la que se apoya, la oscura.
      */
      className={`group relative rounded-[24px] bg-fondo ${
        esFila ? 'flex items-center gap-4 py-3 pr-14 pl-4' : 'flex flex-col gap-3 p-6'
      }`}
    >
      {/*
        Abrir una memoria la hace crecer hasta su pantalla, y volver la
        devuelve a su sitio en el listado: el mismo recorrido de las
        plantillas (`shared/ui/crecerDesde.ts`). Sin esto, el detalle
        aparecía de golpe y costaba saber de cuál de las tarjetas venía.
      */}
      {/*
        Mientras se genera no se puede abrir: el detalle arma el documento con
        las secciones de la fila, y una memoria sin ellas todavía se vería
        llena de los datos de ejemplo de la plantilla. Parecería terminada y
        mal escrita, en vez de a medias.
      */}
      <Enlace
        to={`/memorias/${memoria.id}`}
        desactivado={generando}
        onClick={(evento) => recordarOrigenDeApertura(evento.currentTarget.closest('[data-memoria]'))}
        className={esFila ? 'flex min-w-0 flex-1 items-center gap-4' : 'flex flex-col gap-3'}
      >
        <div className={esFila ? 'flex min-w-0 flex-1 items-center gap-3' : 'flex items-center gap-3'}>
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ilustracion text-2xl">
            <span aria-hidden="true" className="material-symbols-rounded icono-relleno text-ilustracion-texto">
              description
            </span>
          </span>
          <span className="font-titulo truncate text-lg font-semibold text-texto transition-colors group-hover:text-acento">
            {memoria.nombre}
          </span>
        </div>

        {/*
          La fecha dejó de ir en monoespaciada: `.coordenada` existe para
          coordenadas de trazabilidad —minutos exactos de un audio— donde los
          dígitos tabulares se alinean columna a columna. Una fecha suelta en
          una tarjeta no gana nada con eso, y sí desentona.
        */}
        <div
          className={`text-sm text-texto-tenue ${
            esFila ? 'hidden min-w-0 shrink-0 items-center gap-3 sm:flex' : 'flex flex-col gap-0.5'
          }`}
        >
          <span className="truncate">{nombreConferencia}</span>
          {esFila ? <span aria-hidden="true">·</span> : null}
          <span className="truncate">{nombrePlantilla}</span>
          {generando ? null : <span className="shrink-0">{formatearFecha(memoria.generadaEl.slice(0, 10))}</span>}
        </div>

        {generando && !esFila ? (
          <div className="flex flex-col gap-1.5 pt-0.5">
            {/* Sin `aria-valuenow`: un progressbar sin valor es la forma de decir "en marcha, sin saber cuánto". */}
            <div
              role="progressbar"
              aria-label={`Generando «${memoria.nombre}»`}
              className="barrido-de-carga relative h-1 w-full overflow-hidden rounded-full bg-acento-tenue"
            />
            <span className="text-xs text-texto-tenue">Generando…</span>
          </div>
        ) : null}

        {fallida && !esFila ? (
          <span className="pt-0.5 text-xs text-texto-tenue">
            No se pudo redactar. Genérala de nuevo para volver a intentarlo.
          </span>
        ) : null}
      </Enlace>

      <button
        type="button"
        onClick={alPulsarEliminar}
        aria-label={`Eliminar «${memoria.nombre}»`}
        className={`absolute right-4 z-10 flex size-9 cursor-pointer items-center justify-center rounded-full text-lg text-texto-tenue opacity-0 transition-colors hover:text-error focus-visible:opacity-100 group-hover:opacity-100 ${
          esFila ? 'top-1/2 -translate-y-1/2' : 'top-4'
        }`}
      >
        <span aria-hidden="true" className="material-symbols-rounded icono-contorno">
          delete
        </span>
      </button>
    </div>
  )
}
