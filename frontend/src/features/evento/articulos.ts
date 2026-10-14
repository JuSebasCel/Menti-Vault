import { pedirAlBackend } from '@/shared/api/backend'
import type { ResultadoDeConsulta } from '@/shared/supabase/consultas'
import { autorizanTodos } from './formato'
import type { DatosDelEvento, Ponencia } from './tipos'

/*
  Los tres pasos de un artículo en el backend. Cada uno responde al momento
  (202) y sigue en segundo plano; el avance se lee de la fila con
  `leerProduccion`.
*/

type PasoAceptado = { id: string; estado: string }

/*
  Las ponencias que pueden entrar en un artículo: transcritas, y con todos
  sus ponentes de acuerdo en las dos cosas que el artículo hace con su voz,
  citarla en una publicación académica y pasarla por un modelo de terceros.
*/
export function ponenciasCitables(datos: DatosDelEvento): readonly Ponencia[] {
  return datos.ponencias.filter(
    (ponencia) =>
      ponencia.tieneTranscripcion &&
      autorizanTodos(ponencia.ponente, datos.ponentes, 'produccion_academica') &&
      autorizanTodos(ponencia.ponente, datos.ponentes, 'ia_de_terceros'),
  )
}

export function pedirEnfoques(id: string, ponencias: readonly Ponencia[]): Promise<ResultadoDeConsulta<PasoAceptado>> {
  return pedirAlBackend(`/articulos/${id}/enfoques`, {
    ponencias: ponencias.map((ponencia) => ({ id_conferencia: ponencia.id, titulo: ponencia.titulo, ponente: ponencia.ponente })),
  })
}

export function pedirEsquema(id: string, enfoque: number): Promise<ResultadoDeConsulta<PasoAceptado>> {
  return pedirAlBackend(`/articulos/${id}/esquema`, { enfoque })
}

export function pedirRedaccion(id: string): Promise<ResultadoDeConsulta<PasoAceptado>> {
  return pedirAlBackend(`/articulos/${id}/redactar`, {})
}
