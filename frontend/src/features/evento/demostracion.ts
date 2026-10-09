import { useSyncExternalStore } from 'react'

/*
  Modo demostración: los flujos de creación (subir una grabación, crear una
  sesión, agregar un ponente, añadir una pieza, crear un evento) se recorren
  enteros y terminan bien, pero no escriben nada. Sirve para enseñar el
  producto con los datos del evento real sin dejar sesiones ni ponentes de
  prueba colgados de él.

  Solo afecta a lo que crea. Editar, borrar y subir fotos siguen siendo de
  verdad: son los cambios que quien presenta quiere ver reflejados.

  Viene encendido y se recuerda en este navegador. Solo la administración
  puede apagarlo en Ajustes: para cualquier otra cuenta —la de presentar,
  sobre todo— está siempre puesto, y mientras no se sabe quién es, también,
  porque equivocarse hacia ese lado no escribe nada.
*/
const CLAVE = 'menti-modo-demostracion'
const oyentes = new Set<() => void>()

function leer(): boolean {
  try {
    return window.localStorage.getItem(CLAVE) !== 'no'
  } catch {
    return true
  }
}

let elegido = typeof window === 'undefined' ? true : leer()
let puedeElegir = false
let activo = true

function recalcular(): void {
  const siguiente = puedeElegir ? elegido : true
  if (siguiente !== activo) {
    activo = siguiente
    oyentes.forEach((oyente) => oyente())
  }
}

export function enDemostracion(): boolean {
  return activo
}

export function permitirElegirDemostracion(permitido: boolean): void {
  puedeElegir = permitido
  recalcular()
}

export function cambiarDemostracion(siguiente: boolean): void {
  if (!puedeElegir) {
    return
  }
  elegido = siguiente
  try {
    window.localStorage.setItem(CLAVE, siguiente ? 'si' : 'no')
  } catch {
    // Sin almacenamiento se recuerda solo mientras dure la pestaña.
  }
  recalcular()
}

export function useDemostracion(): boolean {
  return useSyncExternalStore(
    (oyente) => {
      oyentes.add(oyente)
      return () => oyentes.delete(oyente)
    },
    () => activo,
  )
}

/* Una espera corta, para que el flujo se sienta como el de verdad y no salte al final. */
export function esperaDeDemostracion(milisegundos = 900): Promise<void> {
  return new Promise((resolver) => window.setTimeout(resolver, milisegundos))
}
