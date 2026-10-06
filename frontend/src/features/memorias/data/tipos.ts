/*
  Tipos del dominio de memorias (F5). Solo declaraciones: la lógica vive en
  `../mapeo.ts` y `../generarMemoria.ts`, los datos de ejemplo en
  `memorias.fixture.ts`.

  Una `Memoria` guardada es un registro liviano, no el documento congelado:
  referencia a qué conferencia y qué plantilla se generó, y el documento se
  vuelve a generar al vuelo cada vez que se abre (ver `generarMemoria.ts`) —
  consistente con `PLAN.md` sección 1.3 ("el entregable A es una
  vista/exportación derivada, no un proceso paralelo").

  `idDueno` es quien la generó (B11): una memoria es privada a esa cuenta, a
  diferencia de una plantilla, que es del grupo. Compartir el contenido de
  origen sigue siendo cosa de `comparticiones` sobre la conferencia, no de
  este campo.
*/
/**
 * En qué punto va su redacción, igual que `estado` en una conferencia.
 *
 * Redactar son minutos y hasta cuarenta llamadas al modelo (rastreo de la
 * transcripción más una por diapositiva adjuntada como imagen), así que el
 * backend responde 202 y escribe aquí cuando acaba. La tarjeta existe desde
 * el primer momento diciendo `generando`, y cerrar el panel o cambiar de
 * pantalla no interrumpe nada.
 *
 * Las memorias de antes de esto, y las que se crean sin backend, nacen
 * `lista`: su contenido ya está.
 */
export type EstadoDeMemoria = 'generando' | 'lista' | 'fallida'

export type Memoria = {
  readonly id: string
  readonly idConferencia: string
  readonly idPlantilla: string
  readonly idDueno: string
  readonly nombre: string
  readonly generadaEl: string
  readonly estado: EstadoDeMemoria
  /**
   * Lo que la IA escribió en cada hueco, por id de marcador.
   *
   * Se guarda porque regenerar al abrir, que era como funcionaba cuando los
   * huecos se llenaban copiando datos, ahora sería volver a pagar la llamada
   * al modelo en cada visita y obtener un texto distinto cada vez. Ausente en
   * las memorias hechas antes de la redacción con IA y cuando no hay backend.
   */
  readonly secciones?: Readonly<Record<string, string | null>>
}
