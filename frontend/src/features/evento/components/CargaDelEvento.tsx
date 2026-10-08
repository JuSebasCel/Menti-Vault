import type { ReactElement, ReactNode } from 'react'
import { mensajeDeError } from '@/shared/errors'
import { useEvento } from '../useEvento'
import type { DatosDelEvento } from '../tipos'
import { Vacio } from './piezas'

/*
  Los tres desenlaces de cargar el evento, resueltos una vez para todas las
  pantallas: esperando (esqueleto con la forma del bento, para que la página
  no salte al llegar los datos), fallo con su mensaje, o sin evento todavía.
*/
export function CargaDelEvento({ children }: { children: (datos: DatosDelEvento) => ReactNode }): ReactElement {
  const { datos, cargando, codigoDeError } = useEvento()

  if (cargando) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <div className="h-10 w-48 animate-pulse rounded-full bg-panel" />
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((indice) => (
            <div key={indice} className="h-48 animate-pulse rounded-[24px] bg-panel" />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-[24px] bg-panel" />
      </div>
    )
  }

  if (codigoDeError !== null && datos === undefined) {
    return <Vacio icono="cloud_off" texto={mensajeDeError(codigoDeError)} />
  }

  if (datos === undefined || datos === null) {
    return <Vacio icono="event" texto="Todavía no hay ningún evento" />
  }

  return <>{children(datos)}</>
}
