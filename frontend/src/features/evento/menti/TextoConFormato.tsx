import type { ReactElement, ReactNode } from 'react'

/*
  El texto de Menti con el markdown que escribe el modelo: párrafos, listas
  con viñeta o numeradas, títulos cortos, negrita, cursiva y código en línea.
  Sin esto los asteriscos y los "###" se veían tal cual.

  Un intérprete propio y no una librería: el modelo usa siempre ese puñado de
  marcas, y una dependencia de markdown completa —tablas, HTML, enlaces de
  referencia— sería mucho para tan poco. Funciona también con el texto a
  medio escribir: una marca sin cerrar se queda como texto hasta que llega
  su pareja.
*/
export function TextoConFormato({ texto }: { texto: string }): ReactElement {
  const bloques: ReactNode[] = []
  let lista: { ordenada: boolean; elementos: string[] } | null = null

  const cerrarLista = (): void => {
    if (lista === null) {
      return
    }
    const elementos = lista.elementos.map((elemento, indice) => (
      <li key={indice} className="pl-1">
        {enLinea(elemento)}
      </li>
    ))
    bloques.push(
      lista.ordenada ? (
        <ol key={bloques.length} className="flex list-decimal flex-col gap-1 pl-5">
          {elementos}
        </ol>
      ) : (
        <ul key={bloques.length} className="flex list-disc flex-col gap-1 pl-5">
          {elementos}
        </ul>
      ),
    )
    lista = null
  }

  for (const linea of texto.split('\n')) {
    const limpia = linea.trim()
    const vineta = /^[-*•]\s+(.*)$/.exec(limpia)
    const numero = /^\d+[.)]\s+(.*)$/.exec(limpia)
    const titulo = /^#{1,6}\s+(.*)$/.exec(limpia)

    if (vineta !== null || numero !== null) {
      const ordenada = numero !== null
      if (lista !== null && lista.ordenada !== ordenada) {
        cerrarLista()
      }
      lista ??= { ordenada, elementos: [] }
      lista.elementos.push((vineta ?? numero)?.[1] ?? '')
      continue
    }
    cerrarLista()
    if (limpia === '') {
      continue
    }
    if (titulo !== null) {
      bloques.push(
        <p key={bloques.length} className="pt-1 font-semibold">
          {enLinea(titulo[1] ?? '')}
        </p>,
      )
      continue
    }
    bloques.push(<p key={bloques.length}>{enLinea(limpia)}</p>)
  }
  cerrarLista()

  return <div className="flex flex-col gap-2.5 text-[15px] leading-relaxed">{bloques}</div>
}

/* Negrita, cursiva y código dentro de una línea. */
function enLinea(texto: string): ReactNode[] {
  const partes: ReactNode[] = []
  const marcas = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g
  let desde = 0
  for (const coincidencia of texto.matchAll(marcas)) {
    const marca = coincidencia[0]
    const posicion = coincidencia.index ?? 0
    if (posicion > desde) {
      partes.push(texto.slice(desde, posicion))
    }
    if (marca.startsWith('**') || marca.startsWith('__')) {
      partes.push(
        <strong key={posicion} className="font-semibold">
          {marca.slice(2, -2)}
        </strong>,
      )
    } else if (marca.startsWith('`')) {
      partes.push(
        <code key={posicion} className="rounded-md bg-panel px-1.5 py-0.5 font-mono text-[13px]">
          {marca.slice(1, -1)}
        </code>,
      )
    } else {
      partes.push(<em key={posicion}>{marca.slice(1, -1)}</em>)
    }
    desde = posicion + marca.length
  }
  if (desde < texto.length) {
    partes.push(texto.slice(desde))
  }
  return partes
}
