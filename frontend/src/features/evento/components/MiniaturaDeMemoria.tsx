import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { direccionDeArchivo } from '../repositorio'

/*
  La primera página real de una memoria, generada una vez y guardada junto a
  su PDF (`miniatura.png`): un dibujo genérico de "documento" no distinguía
  una memoria de otra. Entra con un fundido al cargar para no saltar.
*/
function rutaDeMiniatura(rutaPdf: string): string {
  return `${rutaPdf.slice(0, rutaPdf.lastIndexOf('/'))}/miniatura.png`
}

export function Miniatura({ rutaPdf, titulo }: { rutaPdf: string; titulo: string }): ReactElement {
  const [url, setUrl] = useState<string | null>(null)
  const [cargada, setCargada] = useState(false)

  useEffect(() => {
    void direccionDeArchivo(rutaDeMiniatura(rutaPdf)).then(setUrl)
  }, [rutaPdf])

  return (
    <span className={`block aspect-[3/4] overflow-hidden rounded-[16px] bg-panel shadow-[0_0_0_1px_var(--bitacora-filete)] ${cargada ? '' : 'animate-pulse'}`}>
      {url === null ? null : (
        <img
          src={url}
          alt={`Primera página de ${titulo}`}
          onLoad={() => setCargada(true)}
          className={`size-full object-cover object-top transition-opacity duration-500 ${cargada ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
    </span>
  )
}

