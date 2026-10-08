import { useSession } from '@/features/auth/session'
import { useConsultaCacheada } from '@/shared/cache/useConsultaCacheada'
import type { ValorDeConsultaCacheada } from '@/shared/cache/useConsultaCacheada'
import { useEventoElegido } from './eventoElegido'
import { cargarEvento, nombreDelEventoPrincipal } from './repositorio'
import type { DatosDelEvento } from './tipos'

export const CLAVE_DEL_EVENTO = 'evento-principal'

/*
  El evento con el que se trabaja, compartido por todas las pantallas del
  shell a través de la caché: cambiar de sección no vuelve a pedirlo, y
  `invalidar()` tras una escritura lo refresca en todas a la vez.
*/
export function useEvento(): ValorDeConsultaCacheada<DatosDelEvento | null> {
  const { usuario } = useSession()
  const elegido = useEventoElegido()

  return useConsultaCacheada(usuario === null ? null : `${CLAVE_DEL_EVENTO}:${usuario.id}:${elegido ?? ''}`, async () => {
    if (elegido !== null) {
      const datos = await cargarEvento(elegido)
      if (!datos.ok || datos.datos !== null) {
        return datos
      }
    }
    const nombre = await nombreDelEventoPrincipal()
    if (!nombre.ok) {
      return nombre
    }
    if (nombre.datos === null) {
      return { ok: true, datos: null }
    }
    return cargarEvento(nombre.datos)
  })
}
