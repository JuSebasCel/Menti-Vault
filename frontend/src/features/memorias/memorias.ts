import { LARGO_MAXIMO_DE_MEMORIA } from '@/shared/errors'
import type { CodigoError } from '@/shared/errors'
import type { EstadoDeMemoria, Memoria } from './data'

/*
  Operaciones puras sobre una memoria. Mismo contrato que
  `plantillas/plantillas.ts`: nunca lanzan, el fallo viaja como código de
  error. A diferencia de una plantilla, una memoria no se edita después de
  creada — no hay `renombrar`/`actualizar`, solo `crearMemoria`.
*/

export type ResultadoMemoria =
  | { readonly ok: true; readonly memoria: Memoria }
  | { readonly ok: false; readonly codigo: CodigoError }

/*
  El id lo genera el cliente porque la columna es `uuid` y el prefijo `mem-`
  de antes ya no cabe ahí (B6). Es el gemelo del `idNuevo` de
  `plantillas/plantillas.ts`, copiado y no compartido: darle casa en `shared/`
  haría que dos dominios dependieran uno del otro por ocho líneas, y el día
  que uno de los dos necesite otra forma de id, separarlos costaría más que
  esta repetición.
*/
function idNuevo(): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid !== undefined) {
    return uuid
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (caracter) => {
    const azar = Math.floor(Math.random() * 16)
    const valor = caracter === 'x' ? azar : (azar & 0x3) | 0x8
    return valor.toString(16)
  })
}

export function crearMemoria(
  idConferencia: string,
  idPlantilla: string,
  nombre: string,
  idDueno: string,
  secciones?: Readonly<Record<string, string | null>>,
  /* `generando` cuando la va a redactar el backend; `lista` cuando no hay nada que esperar. */
  estado: EstadoDeMemoria = 'lista',
): ResultadoMemoria {
  if (idConferencia.trim().length === 0) {
    return { ok: false, codigo: 'MEM_CONFERENCIA_REQUERIDA' }
  }

  if (idPlantilla.trim().length === 0) {
    return { ok: false, codigo: 'MEM_PLANTILLA_REQUERIDA' }
  }

  const nombreLimpio = nombre.trim()

  if (nombreLimpio.length === 0) {
    return { ok: false, codigo: 'MEM_NOMBRE_REQUERIDO' }
  }

  if (nombreLimpio.length > LARGO_MAXIMO_DE_MEMORIA) {
    return { ok: false, codigo: 'MEM_NOMBRE_MUY_LARGO' }
  }

  return {
    ok: true,
    memoria: {
      id: idNuevo(),
      idConferencia,
      idPlantilla,
      idDueno,
      nombre: nombreLimpio,
      generadaEl: new Date().toISOString(),
      estado,
      ...(secciones === undefined ? {} : { secciones }),
    },
  }
}
