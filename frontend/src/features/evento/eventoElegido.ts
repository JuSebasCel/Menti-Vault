import { useSyncExternalStore } from 'react'

/*
  Qué evento se está mirando. Una organización puede tener varios, y el que
  se eligió se recuerda entre visitas en este navegador: es una comodidad de
  quien lo usa, no un dato que deba compartirse, así que `localStorage` basta
  y si falla (navegación privada) se vuelve al evento principal.
*/
const CLAVE = 'menti-evento-elegido'
const oyentes = new Set<() => void>()

function leer(): string | null {
  try {
    return window.localStorage.getItem(CLAVE)
  } catch {
    return null
  }
}

let actual = typeof window === 'undefined' ? null : leer()

export function elegirEvento(nombre: string): void {
  actual = nombre
  try {
    window.localStorage.setItem(CLAVE, nombre)
  } catch {
    // Sin almacenamiento se recuerda solo mientras dure la pestaña.
  }
  oyentes.forEach((oyente) => oyente())
}

export function useEventoElegido(): string | null {
  return useSyncExternalStore(
    (oyente) => {
      oyentes.add(oyente)
      return () => oyentes.delete(oyente)
    },
    () => actual,
  )
}
