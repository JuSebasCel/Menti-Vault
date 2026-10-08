import type { ReactElement } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  EXTENSIONES_DE_APOYO,
  direccionDe,
  eliminarMaterialDeApoyo,
  listarArchivos,
  subirMaterialDeApoyo,
} from '@/features/almacen/repositorio'
import type { ArchivoDelAlmacen } from '@/features/almacen/repositorio'
import { nombreParaAlmacenamiento } from '@/features/conferencias/repositorio/repositorio'
import { BotonMind, Icono, Tarjeta } from './piezas'

/*
  El material que acompaña a una ponencia: diapositivas, documentos, fotos
  de la pizarra. Entra a la memoria junto con la transcripción, porque parte
  de una charla no se dice sino que se muestra —un teléfono de contacto, una
  cifra, una bibliografía en la última lámina— y sin esto la memoria sale
  sin ello.

  Reusa el almacén que ya existe: misma carpeta `apoyo/` de la conferencia y
  mismas reglas de Storage. El nombre se pasa a ASCII antes de subir, porque
  una tilde en la clave devuelve 400.
*/
const ICONO: Record<ArchivoDelAlmacen['tipo'], string> = {
  pdf: 'picture_as_pdf',
  pptx: 'slideshow',
  docx: 'description',
  imagen: 'image',
  texto: 'notes',
  audio: 'graphic_eq',
  'transcripcion-automatica': 'subtitles',
  otro: 'draft',
}

export function MaterialDeApoyo({ idDueno, idConferencia }: { idDueno: string; idConferencia: string }): ReactElement {
  const [archivos, setArchivos] = useState<readonly ArchivoDelAlmacen[] | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const entrada = useRef<HTMLInputElement>(null)

  const cargar = useCallback(async (): Promise<void> => {
    const resultado = await listarArchivos(idDueno, idConferencia)
    setArchivos(resultado.ok ? resultado.datos.filter((archivo) => archivo.esApoyo === true) : [])
  }, [idDueno, idConferencia])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const subir = async (elegidos: FileList): Promise<void> => {
    setSubiendo(true)
    setError(null)
    for (const archivo of [...elegidos]) {
      const renombrado = new File([archivo], nombreParaAlmacenamiento(archivo.name), { type: archivo.type })
      const resultado = await subirMaterialDeApoyo(idDueno, idConferencia, renombrado)
      if (!resultado.ok) {
        setError(`No se pudo subir «${archivo.name}».`)
      }
    }
    setSubiendo(false)
    await cargar()
  }

  return (
    <Tarjeta className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-2xl">Material de apoyo</span>
        <BotonMind icono="upload" disabled={subiendo} onClick={() => entrada.current?.click()}>
          {subiendo ? 'Subiendo…' : 'Añadir'}
        </BotonMind>
        <input
          ref={entrada}
          type="file"
          multiple
          hidden
          accept={EXTENSIONES_DE_APOYO.join(',')}
          onChange={(evento) => {
            if (evento.target.files !== null && evento.target.files.length > 0) {
              void subir(evento.target.files)
            }
            evento.target.value = ''
          }}
        />
      </div>
      <p className="text-sm text-texto-tenue">Diapositivas y documentos de la charla. Se leen al redactar la memoria.</p>

      {archivos === null ? (
        <div className="h-24 animate-pulse rounded-2xl bg-panel" />
      ) : archivos.length === 0 ? (
        <button
          type="button"
          onClick={() => entrada.current?.click()}
          className="flex cursor-pointer flex-col items-center gap-2 rounded-[20px] border-2 border-dashed border-filete-fuerte px-6 py-10 text-texto-tenue transition-colors hover:bg-panel"
        >
          <Icono nombre="upload_file" className="text-4xl" />
          <span>PDF, PowerPoint, Word o imágenes</span>
        </button>
      ) : (
        <ul className="flex flex-col gap-2">
          {archivos.map((archivo) => (
            <li key={archivo.ruta} className="flex items-center gap-3 rounded-2xl bg-panel py-2 pr-2 pl-4">
              <Icono nombre={ICONO[archivo.tipo]} className="text-xl" />
              <span className="min-w-0 flex-1 truncate">{archivo.nombre}</span>
              <span className="text-sm text-texto-tenue">{Math.max(1, Math.round(archivo.bytes / 1024))} KB</span>
              <button
                type="button"
                aria-label={`Abrir ${archivo.nombre}`}
                onClick={() => void direccionDe(archivo.ruta).then((url) => url !== null && window.open(url, '_blank', 'noopener'))}
                className="flex size-9 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-[var(--mind-variante)]"
              >
                <Icono nombre="open_in_new" className="text-lg" />
              </button>
              <button
                type="button"
                aria-label={`Quitar ${archivo.nombre}`}
                onClick={() => void eliminarMaterialDeApoyo(archivo.ruta).then(cargar)}
                className="flex size-9 cursor-pointer items-center justify-center rounded-full text-texto-tenue transition-colors hover:bg-[var(--mind-variante)] hover:text-texto"
              >
                <Icono nombre="close" className="text-lg" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error === null ? null : <p className="rounded-2xl bg-[var(--tono-rojo)] px-4 py-3 text-sm [color:var(--tono-rojo-texto)]">{error}</p>}
    </Tarjeta>
  )
}
