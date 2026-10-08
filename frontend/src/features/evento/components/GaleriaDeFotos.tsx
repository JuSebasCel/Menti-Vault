import type { ReactElement } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { direccionDeArchivo, eliminarFoto, listarFotos, subirFoto } from '../repositorio'
import type { Foto } from '../repositorio'
import { BotonMind, Icono, Tarjeta } from './piezas'

/*
  Las fotos de una sesión o del evento: el material que sirve para agradecer
  en redes, separado de las diapositivas. Se suben en lote y se ven en
  cuadrícula; quien las tenga a mano las reconoce de un vistazo.
*/
export function useFotos(carpeta: string): { fotos: readonly Foto[] | null; recargar: () => Promise<void> } {
  const [fotos, setFotos] = useState<readonly Foto[] | null>(null)
  const recargar = useCallback(async (): Promise<void> => setFotos(await listarFotos(carpeta)), [carpeta])
  useEffect(() => {
    void recargar()
  }, [recargar])
  return { fotos, recargar }
}

export function MiniaturaDeFoto({ ruta, className = '' }: { ruta: string; className?: string }): ReactElement {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    void direccionDeArchivo(ruta).then(setUrl)
  }, [ruta])
  return (
    <span className={`block overflow-hidden bg-panel ${url === null ? 'animate-pulse' : ''} ${className}`}>
      {url === null ? null : <img src={url} alt="" className="size-full object-cover" loading="lazy" />}
    </span>
  )
}

export function GaleriaDeFotos({ carpeta, titulo, vacio }: { carpeta: string; titulo: string; vacio: string }): ReactElement {
  const { fotos, recargar } = useFotos(carpeta)
  const [subiendo, setSubiendo] = useState(false)
  const entrada = useRef<HTMLInputElement>(null)

  const subir = async (lista: FileList): Promise<void> => {
    setSubiendo(true)
    for (const archivo of [...lista]) {
      await subirFoto(carpeta, archivo)
    }
    setSubiendo(false)
    await recargar()
  }

  return (
    <Tarjeta className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-2xl">{titulo}</span>
        <BotonMind icono="add_photo_alternate" disabled={subiendo} onClick={() => entrada.current?.click()}>
          {subiendo ? 'Subiendo…' : 'Añadir fotos'}
        </BotonMind>
        <input
          ref={entrada}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          hidden
          onChange={(evento) => {
            if (evento.target.files !== null && evento.target.files.length > 0) {
              void subir(evento.target.files)
            }
            evento.target.value = ''
          }}
        />
      </div>

      {fotos === null ? (
        <div className="h-28 animate-pulse rounded-2xl bg-panel" />
      ) : fotos.length === 0 ? (
        <button
          type="button"
          onClick={() => entrada.current?.click()}
          className="flex cursor-pointer flex-col items-center gap-2 rounded-[20px] border-2 border-dashed border-filete-fuerte px-6 py-8 text-texto-tenue transition-colors hover:bg-panel"
        >
          <Icono nombre="photo_library" className="text-4xl" />
          <span>{vacio}</span>
        </button>
      ) : (
        <ul className="grid grid-cols-4 gap-2">
          {fotos.map((foto) => (
            <li key={foto.ruta} className="group relative">
              <MiniaturaDeFoto ruta={foto.ruta} className="aspect-square rounded-[16px]" />
              <button
                type="button"
                aria-label="Quitar foto"
                onClick={() => void eliminarFoto(foto.ruta).then(recargar)}
                className="absolute top-2 right-2 flex size-8 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                <Icono nombre="close" className="text-lg" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  )
}
