import { useEffect, useSyncExternalStore } from 'react'

/*
  Cómo se ve la app: el color del acento y el tamaño del dock.

  El acento es lo único con color en una interfaz monocroma —el botón
  principal, la sección activa, la pastilla elegida—, así que cambiarlo la
  reviste entera sin tocar el resto de la paleta. Por defecto no hay color:
  blanco sobre negro (o negro sobre claro), que es la decisión de diseño del
  producto; los demás son para quien la quiera suya.

  Va por `data-acento` y `data-dock` en la raíz del documento, igual que el
  tema (`ProveedorDeTema`), y los valores concretos viven en `index.css`
  junto al resto de los tokens: así un color nuevo se añade escribiendo CSS,
  sin tocar este archivo ni pasar colores por props.

  Se guarda en `localStorage` y no en la cuenta, como el tema y como el dock
  plegado: es una preferencia de este equipo —de esta pantalla, de esta luz—
  y no algo que deba seguir a la persona a otro computador.
*/

export type Acento = 'monocromo' | 'azul' | 'verde' | 'ambar' | 'violeta' | 'turquesa'
export type TamanoDelDock = 'normal' | 'compacto'

export type Apariencia = {
  readonly acento: Acento
  readonly dock: TamanoDelDock
}

export const ACENTOS: readonly { valor: Acento; etiqueta: string; muestra: string }[] = [
  { valor: 'monocromo', etiqueta: 'Sin color', muestra: 'var(--bitacora-texto)' },
  { valor: 'azul', etiqueta: 'Azul', muestra: 'oklch(0.55 0.17 258)' },
  { valor: 'verde', etiqueta: 'Verde', muestra: 'oklch(0.58 0.14 155)' },
  { valor: 'ambar', etiqueta: 'Ámbar', muestra: 'oklch(0.72 0.15 75)' },
  { valor: 'violeta', etiqueta: 'Violeta', muestra: 'oklch(0.55 0.19 300)' },
  { valor: 'turquesa', etiqueta: 'Turquesa', muestra: 'oklch(0.62 0.12 200)' },
]

const POR_DEFECTO: Apariencia = { acento: 'monocromo', dock: 'normal' }
const CLAVE = 'menti-vault:apariencia'

let actual: Apariencia = POR_DEFECTO
const oyentes = new Set<() => void>()

function leerGuardada(): Apariencia {
  try {
    const crudo = localStorage.getItem(CLAVE)
    const guardada: unknown = crudo === null ? null : JSON.parse(crudo)

    if (typeof guardada !== 'object' || guardada === null) {
      return POR_DEFECTO
    }

    const { acento, dock } = guardada as Partial<Apariencia>

    return {
      acento: ACENTOS.some((candidato) => candidato.valor === acento) ? (acento as Acento) : 'monocromo',
      dock: dock === 'compacto' ? 'compacto' : 'normal',
    }
  } catch {
    return POR_DEFECTO
  }
}

/* Escribe en la raíz del documento. Con los valores por defecto no deja atributo: el CSS ya es eso. */
function aplicar(apariencia: Apariencia): void {
  const raiz = document.documentElement

  if (apariencia.acento === 'monocromo') {
    delete raiz.dataset.acento
  } else {
    raiz.dataset.acento = apariencia.acento
  }

  if (apariencia.dock === 'normal') {
    delete raiz.dataset.dock
  } else {
    raiz.dataset.dock = apariencia.dock
  }
}

function publicar(siguiente: Apariencia): void {
  actual = siguiente
  aplicar(siguiente)
  oyentes.forEach((oyente) => oyente())

  try {
    localStorage.setItem(CLAVE, JSON.stringify(siguiente))
  } catch {
    /* Sin almacenamiento vale para esta visita, que es mejor que no poder cambiarlo. */
  }
}

let leida = false

export function useApariencia(): Apariencia {
  useEffect(() => {
    if (!leida) {
      leida = true
      publicar(leerGuardada())
    }
  }, [])

  return useSyncExternalStore(
    (oyente) => {
      oyentes.add(oyente)
      return () => oyentes.delete(oyente)
    },
    () => actual,
  )
}

export function cambiarApariencia(cambio: Partial<Apariencia>): void {
  publicar({ ...actual, ...cambio })
}

/*
  Se aplica antes del primer render, desde `main.tsx`: con un efecto, la app
  pintaba un cuadro con el acento de fábrica y después cambiaba, que es el
  mismo parpadeo que el tema evita con `useLayoutEffect`.
*/
export function aplicarAparienciaGuardada(): void {
  leida = true
  actual = leerGuardada()
  aplicar(actual)
}
