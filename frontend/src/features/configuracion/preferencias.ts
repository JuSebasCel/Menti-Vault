import { useEffect, useSyncExternalStore } from 'react'
import { useSession } from '@/features/auth/session'
import { supabase } from '@/shared/supabase/cliente'

/*
  Preferencias de la persona, guardadas en los metadatos de su cuenta.

  Van en `user_metadata` de Supabase y no en `localStorage` ni en una tabla:
  en el navegador se quedarían en un solo equipo, y una tabla nueva sería una
  migración y una política de RLS para guardar un par de interruptores que
  ya tienen un sitio natural —la propia cuenta—, que la sesión trae consigo.

  Cada preferencia tiene un valor por defecto, y ese es el que se usa hasta
  que la cuenta diga otra cosa: nunca se espera a leerla para dejar hacer.
*/

export type Preferencias = {
  /** Lanzar el análisis en cuanto se carga una conferencia, o dejarla en cola. */
  readonly analizarAlCargar: boolean
  /** Sonar y marcar la pestaña cuando termina un análisis o una memoria. */
  readonly avisarAlTerminar: boolean
  /** El recorrido guiado ya se vio (o se saltó): no volver a abrirlo solo. */
  readonly tutorialVisto: boolean
}

const POR_DEFECTO: Preferencias = {
  analizarAlCargar: true,
  avisarAlTerminar: true,
  tutorialVisto: false,
}

let actuales: Preferencias = POR_DEFECTO
/* De qué cuenta son las que hay en memoria: al cambiar de sesión se vuelven a leer. */
let cargadasDe: string | null = null
/*
  Si ya llegaron las de la cuenta. Casi nadie lo necesita —los valores por
  defecto sirven mientras tanto—, salvo el recorrido guiado: con el valor por
  defecto (`tutorialVisto: false`) se abriría a quien ya lo vio, durante el
  instante que tarda la lectura.
*/
let leidas = false
const oyentesDeLectura = new Set<() => void>()

export function usePreferenciasLeidas(): boolean {
  return useSyncExternalStore(
    (oyente) => {
      oyentesDeLectura.add(oyente)
      return () => oyentesDeLectura.delete(oyente)
    },
    () => leidas,
  )
}
const oyentes = new Set<() => void>()

function publicar(siguientes: Preferencias): void {
  actuales = siguientes
  oyentes.forEach((oyente) => oyente())
}

function suscribir(oyente: () => void): () => void {
  oyentes.add(oyente)
  return () => oyentes.delete(oyente)
}

function desdeMetadatos(metadatos: unknown): Preferencias {
  const guardadas =
    typeof metadatos === 'object' && metadatos !== null
      ? (metadatos as { preferencias?: Partial<Preferencias> }).preferencias
      : undefined

  return { ...POR_DEFECTO, ...(guardadas ?? {}) }
}

async function cargar(idUsuario: string): Promise<void> {
  cargadasDe = idUsuario

  try {
    const respuesta = await supabase.auth.getSession()
    const usuario = respuesta?.data?.session?.user

    publicar(usuario === undefined ? POR_DEFECTO : desdeMetadatos(usuario.user_metadata))
    leidas = usuario !== undefined
  } catch {
    /* Sin sesión legible se quedan las de por defecto, que son válidas. */
  }
  oyentesDeLectura.forEach((oyente) => oyente())
}

export function usePreferencias(): Preferencias {
  const { usuario } = useSession()
  const idUsuario = usuario?.id ?? null

  useEffect(() => {
    if (idUsuario !== null && cargadasDe !== idUsuario) {
      void cargar(idUsuario)
    }
  }, [idUsuario])

  return useSyncExternalStore(suscribir, () => actuales)
}

/** Las preferencias vigentes, para quien las lee fuera de un componente. */
export function preferenciasActuales(): Preferencias {
  return actuales
}

/*
  Se aplica en el acto y se guarda después: el interruptor no puede quedarse
  a medio camino esperando a la red. Si guardar falla, se vuelve a lo que
  había, para no enseñar una preferencia que la cuenta no tiene.
*/
export async function cambiarPreferencia<C extends keyof Preferencias>(
  clave: C,
  valor: Preferencias[C],
): Promise<void> {
  const anteriores = actuales
  const siguientes = { ...actuales, [clave]: valor }
  publicar(siguientes)

  try {
    const { error } = await supabase.auth.updateUser({ data: { preferencias: siguientes } })

    if (error !== null) {
      publicar(anteriores)
    }
  } catch {
    publicar(anteriores)
  }
}
