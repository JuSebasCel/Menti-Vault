import { useEffect, useSyncExternalStore } from 'react'
import { supabase } from '@/shared/supabase/cliente'

/*
  Si la app está cerrada a los demás (ver la migración `cierre_del_sitio`), y
  si quien mira es de la administración, que es quien la puede cerrar y sigue
  entrando.

  Un almacén de módulo y no un contexto: lo leen la compuerta del armazón y la
  sección de administración, y cuando la administración lo cambia la
  compuerta tiene que enterarse en el acto, sin volver a preguntar a la base.
*/

export type CierreDelSitio = {
  readonly cargando: boolean
  readonly cerrado: boolean
  readonly soyAdministracion: boolean
  /* Una cuenta para presentar: entra con la app cerrada, pero no la abre ni la cierra (migración `cuentas_de_demostracion`). */
  readonly soyDemostracion: boolean
}

let actual: CierreDelSitio = { cargando: true, cerrado: false, soyAdministracion: false, soyDemostracion: false }
const oyentes = new Set<() => void>()

function publicar(siguiente: CierreDelSitio): void {
  actual = siguiente
  oyentes.forEach((oyente) => oyente())
}

function suscribir(oyente: () => void): () => void {
  oyentes.add(oyente)
  return () => oyentes.delete(oyente)
}

/*
  Cualquier fallo al leer cuenta como abierto: un problema de red no puede
  dejar a todo el mundo fuera de la app. Cerrar es una decisión, y solo se
  aplica cuando la base la confirma.
*/
async function leer(idUsuario: string): Promise<void> {
  try {
    const [estado, administracion, demostracion] = await Promise.all([
      supabase.from('estado_del_sitio').select('cerrado').maybeSingle(),
      supabase.from('administradores').select('id_usuario').eq('id_usuario', idUsuario).maybeSingle(),
      supabase.from('cuentas_de_demostracion').select('id_usuario').eq('id_usuario', idUsuario).maybeSingle(),
    ])

    publicar({
      cargando: false,
      cerrado: (estado?.data as { cerrado?: boolean } | null)?.cerrado === true,
      soyAdministracion: administracion?.data !== null && administracion?.data !== undefined,
      soyDemostracion: demostracion?.data !== null && demostracion?.data !== undefined,
    })
  } catch {
    publicar({ cargando: false, cerrado: false, soyAdministracion: false, soyDemostracion: false })
  }
}

/*
  Se vuelve a preguntar cada minuto: si la administración cierra la app con
  gente dentro, les llega sin tener que recargar.
*/
const INTERVALO_MS = 60_000

export function useCierreDelSitio(idUsuario: string): CierreDelSitio {
  useEffect(() => {
    if (idUsuario === '') {
      return
    }

    void leer(idUsuario)
    const intervalo = setInterval(() => void leer(idUsuario), INTERVALO_MS)

    return () => clearInterval(intervalo)
  }, [idUsuario])

  return useSyncExternalStore(suscribir, () => actual)
}

export async function cambiarCierreDelSitio(cerrado: boolean): Promise<{ ok: boolean }> {
  const anterior = actual
  publicar({ ...actual, cerrado })

  const { error } = await supabase
    .from('estado_del_sitio')
    .update({ cerrado, actualizado_el: new Date().toISOString() })
    .eq('id', true)

  if (error !== null) {
    publicar(anterior)
    return { ok: false }
  }

  return { ok: true }
}
