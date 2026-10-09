import { useSyncExternalStore } from 'react'
import { mensajeDeError } from '@/shared/errors'
import type { Conferencia } from '../data'
import { eliminarConferencia, solicitarProcesamiento, subirArchivoDeConferencia } from '../repositorio'

/*
  Lo que una conferencia está haciendo en este navegador y la base todavía no
  sabe.

  Cargar una conferencia eran tres esperas seguidas con el modal abierto:
  crear la fila, subir el archivo y pedir el análisis. La tercera era la
  peor: en el plan gratuito de Render el backend se duerme, y la petición
  podía tardar un minuto entero en contestar mientras el botón decía
  "Cargando…". Ahora el modal solo espera a la fila —lo único sin lo que no
  hay tarjeta que enseñar— y lo demás sigue aquí, fuera de cualquier
  componente, para que cerrar el modal o cambiar de pantalla no lo corte.

  Pasa lo mismo con "Analizar ahora": la tarjeta dice "Analizando…" en el
  acto, y no cuando el backend termine de despertar. Si la petición falla,
  lo dice la propia tarjeta con el motivo, en vez de quedarse en silencio.

  Es un almacén de módulo con `useSyncExternalStore` y no un contexto: no
  hay nada que configurar por árbol, y así lo pueden usar el modal y el
  archivo sin que ninguno de los dos tenga que envolver al otro.
*/

export type TareaEnSegundoPlano =
  /** Sacando el audio de un video en el navegador, antes de subirlo; `avance` va de 0 a 1. */
  | { readonly fase: 'extrayendo'; readonly avance: number }
  | { readonly fase: 'subiendo' }
  /** Pedido al backend; la base sigue diciendo `en-cola` hasta que el análisis arranque. */
  | { readonly fase: 'iniciando'; readonly desde: number }
  | { readonly fase: 'error'; readonly mensaje: string }

/*
  Cuánto se sigue diciendo "Analizando…" después de que el backend aceptara,
  si la base no llega a decir `procesando`. El análisis marca ese estado en
  los primeros segundos; si pasado este tiempo la fila sigue igual, algo se
  perdió por el camino y lo honesto es volver a enseñar lo que dice la base.
*/
const PLAZO_DE_ARRANQUE_MS = 90_000
const PLAZO_DEL_FALLO_MS = 15_000

/*
  Una subida que falla borra su conferencia, así que no queda tarjeta donde
  decirlo. El aviso vive aparte hasta que alguien lo cierre.
*/
export type AvisoDeCarga = { readonly id: string; readonly texto: string }

let tareas: ReadonlyMap<string, TareaEnSegundoPlano> = new Map()
let avisos: readonly AvisoDeCarga[] = []
const oyentes = new Set<() => void>()

function publicar(siguiente: ReadonlyMap<string, TareaEnSegundoPlano>): void {
  tareas = siguiente
  oyentes.forEach((oyente) => oyente())
}

function publicarAvisos(siguientes: readonly AvisoDeCarga[]): void {
  avisos = siguientes
  oyentes.forEach((oyente) => oyente())
}

export function useAvisosDeCarga(): readonly AvisoDeCarga[] {
  return useSyncExternalStore(suscribir, () => avisos)
}

export function descartarAviso(id: string): void {
  publicarAvisos(avisos.filter((aviso) => aviso.id !== id))
}

function poner(idConferencia: string, tarea: TareaEnSegundoPlano | null): void {
  const siguiente = new Map(tareas)

  if (tarea === null) {
    siguiente.delete(idConferencia)
  } else {
    siguiente.set(idConferencia, tarea)
  }

  publicar(siguiente)
}

function suscribir(oyente: () => void): () => void {
  oyentes.add(oyente)
  return () => oyentes.delete(oyente)
}

export function useTareasEnSegundoPlano(): ReadonlyMap<string, TareaEnSegundoPlano> {
  return useSyncExternalStore(suscribir, () => tareas)
}

/* Quién quiere enterarse de que algo terminó para volver a leer la base. */
let alCambiarLaBase: (() => void) | null = null

export function alTerminarUnaTarea(oyente: (() => void) | null): void {
  alCambiarLaBase = oyente
}

/**
 * Pide el análisis sin hacer esperar a nadie. La tarjeta pasa a "Analizando…"
 * en el acto; si el backend rechaza o no contesta, pasa a error con el motivo.
 */
export async function analizarEnSegundoPlano(idConferencia: string): Promise<void> {
  poner(idConferencia, { fase: 'iniciando', desde: Date.now() })

  const resultado = await solicitarProcesamiento(idConferencia)

  if (!resultado.ok) {
    poner(idConferencia, { fase: 'error', mensaje: mensajeDeError(resultado.codigo) })
    return
  }

  alCambiarLaBase?.()
}

/**
 * Sube el archivo de una conferencia recién creada y, si se pidió, lanza su
 * análisis. Si la subida falla, la conferencia se borra: una fila sin su
 * archivo no se puede analizar nunca.
 */
export async function subirEnSegundoPlano(
  conferencia: Conferencia,
  archivo: File,
  analizar: boolean,
): Promise<void> {
  poner(conferencia.id, { fase: 'subiendo' })

  const subida = await subirArchivoDeConferencia(conferencia.idDueno, conferencia.id, archivo)

  if (!subida.ok) {
    await eliminarConferencia(conferencia.id, conferencia.idDueno)
    poner(conferencia.id, null)
    publicarAvisos([
      ...avisos,
      {
        id: conferencia.id,
        texto: `No se pudo subir «${conferencia.titulo}». ${mensajeDeError(subida.codigo)}`,
      },
    ])
    alCambiarLaBase?.()
    return
  }

  if (analizar) {
    await analizarEnSegundoPlano(conferencia.id)
    return
  }

  poner(conferencia.id, null)
  alCambiarLaBase?.()
}

/*
  Para quien prepara la grabación fuera de este módulo —el asistente de la
  agenda saca el audio de un video y lo sube—: así su avance se ve en la
  misma fila que después dirá "Transcribiendo…", sin un segundo almacén.
*/
export function ponerTarea(idConferencia: string, tarea: TareaEnSegundoPlano | null): void {
  poner(idConferencia, tarea)
}

/** Descarta el aviso de error de una tarjeta, una vez leído. */
export function olvidarTarea(idConferencia: string): void {
  poner(idConferencia, null)
}

/*
  Lo que la tarjeta tiene que enseñar: la tarea local manda mientras la base
  no haya avanzado por su cuenta. En cuanto la fila dice `procesando` o
  `procesada`, la tarea ya no aporta nada y se descarta.
*/
export function estadoParaMostrar(
  conferencia: Pick<Conferencia, 'id' | 'estado'>,
  tarea: TareaEnSegundoPlano | undefined,
): TareaEnSegundoPlano | null {
  if (tarea === undefined) {
    return null
  }

  if (tarea.fase === 'iniciando') {
    const avanzo = conferencia.estado === 'procesando' || conferencia.estado === 'procesada'
    const caduco = Date.now() - tarea.desde > PLAZO_DE_ARRANQUE_MS
    /*
      Un reintento parte de una fila `fallida`, así que ese estado no basta
      para saber que este intento terminó. Si a los quince segundos sigue
      así, el backend ya lo rechazó: un fallo de verdad llega en el acto, y
      una transcripción que arranca marca `procesando` antes.
    */
    const fallo = conferencia.estado === 'fallida' && Date.now() - tarea.desde > PLAZO_DEL_FALLO_MS

    if (avanzo || caduco || fallo) {
      queueMicrotask(() => {
        if (tareas.get(conferencia.id) === tarea) {
          poner(conferencia.id, null)
        }
      })
      return null
    }
  }

  return tarea
}
