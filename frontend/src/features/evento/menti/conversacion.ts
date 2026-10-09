import { useSyncExternalStore } from 'react'
import { olvidarConversacion } from './motor'
import type { Respuesta } from './motor'

/*
  La conversación con Menti, en un almacén de módulo y no en el estado del
  panel: así sobrevive a cerrarlo y volverlo a abrir, y se pierde al recargar
  la página o al pedir una conversación nueva, que es exactamente lo que se
  quiere. No se guarda en ningún otro sitio.
*/
export type Mensaje =
  | { readonly id: string; readonly rol: 'persona'; readonly texto: string }
  | { readonly id: string; readonly rol: 'menti'; readonly estado: 'pensando' }
  | { readonly id: string; readonly rol: 'menti'; readonly estado: 'listo'; readonly respuesta: Respuesta; readonly nueva: boolean }

let mensajes: readonly Mensaje[] = []
const oyentes = new Set<() => void>()

function publicar(siguientes: readonly Mensaje[]): void {
  mensajes = siguientes
  oyentes.forEach((oyente) => oyente())
}

export function useConversacion(): readonly Mensaje[] {
  return useSyncExternalStore(
    (oyente) => {
      oyentes.add(oyente)
      return () => oyentes.delete(oyente)
    },
    () => mensajes,
  )
}

export function agregarPregunta(texto: string): string {
  const idRespuesta = `m-${Date.now()}`
  publicar([...mensajes, { id: `p-${Date.now()}`, rol: 'persona', texto }, { id: idRespuesta, rol: 'menti', estado: 'pensando' }])
  return idRespuesta
}

export function completarRespuesta(id: string, respuesta: Respuesta): void {
  publicar(mensajes.map((mensaje) => (mensaje.id === id ? { id, rol: 'menti', estado: 'listo', respuesta, nueva: true } : mensaje)))
}

/* Una respuesta solo se escribe animada la primera vez; al reabrir el panel ya está escrita. */
export function marcarLeida(id: string): void {
  publicar(mensajes.map((mensaje) => (mensaje.id === id && mensaje.rol === 'menti' && mensaje.estado === 'listo' ? { ...mensaje, nueva: false } : mensaje)))
}

export function nuevaConversacion(): void {
  olvidarConversacion()
  publicar([])
}
