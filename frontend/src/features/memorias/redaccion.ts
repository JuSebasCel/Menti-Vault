import type { ExtensionDeCampo, FormatoDeMarcador, ModoDeCampo, Plantilla } from '@/features/plantillas/data'
import { nombreDeMarcador } from '@/features/plantillas/plantillas'
import { pedirAlBackend, pedirArchivoAlBackend } from '@/shared/api/backend'
import type { ResultadoDeConsulta } from '@/shared/supabase/consultas'

/*
  Lo que la IA escribe en una memoria, y cómo se le pide.

  El backend redacta (`POST /memorias/redactar`) y convierte a PDF (`POST
  /memorias/pdf`); el llenado del `.docx` queda en el navegador, con la misma
  librería que ya reconocía los marcadores. Este archivo es la frontera entre
  los dos: qué se manda, qué vuelve, y qué se hace con los huecos vacíos.
*/

/**
 * Texto por marcador. `null` no es un fallo: es que la charla no dio
 * material para ese hueco, y la plantilla decide qué hacer entonces.
 */
export type SeccionesRedactadas = Readonly<Record<string, string | null>>

export type HuecoParaRedactar = {
  readonly id: string
  readonly nombre: string
  readonly instruccion: string
  readonly formato: FormatoDeMarcador
  readonly modo: ModoDeCampo
  readonly extension: ExtensionDeCampo
  /** Si viene, la respuesta tiene que ser una de estas, copiada igual. */
  readonly opciones?: readonly string[]
}

/*
  Solo los marcadores simples se redactan. Los tramos `[[SI: …]]` y
  `[[REPETIR: …]]` los escribió quien diseñó la plantilla; lo único que se
  decide sobre ellos es si aparecen, y eso no es trabajo de la IA.
*/
export function huecosDePlantilla(plantilla: Plantilla): readonly HuecoParaRedactar[] {
  if (plantilla.origen !== 'docx') {
    return []
  }

  return plantilla.marcadores.flatMap((marcador) =>
    marcador.tipo === 'simple'
      ? [
          {
            id: marcador.id,
            nombre: nombreDeMarcador(marcador.textoOriginal),
            instruccion: marcador.instruccion ?? '',
            /* Una cita no se presenta en viñetas: el formato solo manda en lo redactado. */
            formato: marcador.modo === 'cita' ? 'parrafo' : marcador.formato,
            modo: marcador.modo ?? 'redactar',
            extension: marcador.extension ?? 'media',
            ...(marcador.opciones === undefined || marcador.opciones.length === 0
              ? {}
              : { opciones: marcador.opciones }),
          },
        ]
      : [],
  )
}

/*
  Los huecos que se quedaron sin material y cuya plantilla pidió avisar.

  Es lo único de la memoria que la persona tiene que mirar antes de mandarla:
  el resto está escrito, estos no, y quien diseñó la plantilla dijo que quería
  enterarse. Los de "dejar en blanco" o "quitar el renglón" no se avisan: ya
  se decidió qué hacer con ellos.
*/
export function huecosPorRevisar(plantilla: Plantilla, secciones: SeccionesRedactadas): readonly string[] {
  if (plantilla.origen !== 'docx') {
    return []
  }

  return plantilla.marcadores.flatMap((marcador) =>
    marcador.tipo === 'simple' && marcador.siVacio === 'avisar' && secciones[marcador.id] === null
      ? [nombreDeMarcador(marcador.textoOriginal)]
      : [],
  )
}

/*
  Pide la redacción y no espera el texto: el backend responde 202 y escribe
  las secciones en la propia fila cuando acaba (ver el encabezado de
  `api/memorias.py`). Lo que vuelve aquí es solo si la petición se aceptó.

  Antes esto devolvía las secciones y quien llamaba se quedaba esperando. Era
  una llamada al modelo cuando se escribió; hoy son el rastreo de la
  transcripción y una lectura por diapositiva, o sea minutos, y la interfaz
  se quedaba quieta todo ese rato.
*/
export async function pedirRedaccion(
  idConferencia: string,
  idMemoria: string,
  huecos: readonly HuecoParaRedactar[],
  tono = '',
): Promise<ResultadoDeConsulta<null>> {
  const resultado = await pedirAlBackend<{ estado: string }>('/memorias/redactar', {
    id_conferencia: idConferencia,
    id_memoria: idMemoria,
    huecos,
    tono,
  })

  return resultado.ok ? { ok: true, datos: null } : resultado
}

export function convertirAPdf(docx: Blob): Promise<ResultadoDeConsulta<Blob>> {
  return pedirArchivoAlBackend('/memorias/pdf', docx)
}
