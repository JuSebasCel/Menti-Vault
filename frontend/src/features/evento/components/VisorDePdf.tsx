import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { direccionDeArchivo } from '../repositorio'
import { Icono, Tarjeta } from './piezas'

/*
  Una memoria tal como se entrega: el PDF real, en el visor del navegador
  (página N de M, zoom, miniaturas), con la descarga del PDF y del Word a mano.
  Es la misma decisión que ya se tomó para las memorias generadas: un visor
  propio repaginaría distinto que el documento de verdad.
*/
export function VisorDePdf({ ruta, rutaDocx, titulo }: { ruta: string; rutaDocx: string | null; titulo: string }): ReactElement {
  const [pdf, setPdf] = useState<string | null>(null)
  const [docx, setDocx] = useState<string | null>(null)

  useEffect(() => {
    void direccionDeArchivo(ruta).then(setPdf)
    if (rutaDocx !== null) {
      void direccionDeArchivo(rutaDocx).then(setDocx)
    }
  }, [ruta, rutaDocx])

  return (
    <Tarjeta className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-3 px-2">
        <span className="truncate font-medium">{titulo}</span>
        <div className="flex shrink-0 gap-2">
          {pdf === null ? null : (
            <a
              href={pdf}
              target="_blank"
              rel="noreferrer"
              className="flex h-9 items-center gap-1.5 rounded-full bg-acento-tenue px-4 text-sm font-medium transition-colors hover:bg-filete"
            >
              <Icono nombre="picture_as_pdf" className="text-lg" /> PDF
            </a>
          )}
          {docx === null ? null : (
            <a
              href={docx}
              className="flex h-9 items-center gap-1.5 rounded-full bg-acento-tenue px-4 text-sm font-medium transition-colors hover:bg-filete"
            >
              <Icono nombre="description" className="text-lg" /> Word
            </a>
          )}
        </div>
      </div>
      {pdf === null ? (
        <div className="h-[64vh] animate-pulse rounded-2xl bg-panel" />
      ) : (
        <iframe src={`${pdf}#view=FitH`} title={titulo} className="h-[64vh] w-full rounded-2xl bg-white" />
      )}
    </Tarjeta>
  )
}
