import { supabase } from '@/shared/supabase/cliente'
import { codigoDeErrorDeSupabase, resultadoDeLista } from '@/shared/supabase/consultas'
import type { ResultadoDeConsulta } from '@/shared/supabase/consultas'
import type { Memoria } from './data'

/*
  Único punto del dominio de memorias que habla con Supabase (B6). Mismo
  contrato que `plantillas/repositorio.ts`: funciones asíncronas planas que
  devuelven `ResultadoDeConsulta`, y ninguna pantalla toca `supabase.from`.

  Se guarda la referencia —`id_conferencia` + `id_plantilla` + nombre— y,
  desde la redacción con IA, el texto que el modelo escribió en cada hueco
  (`secciones`). El documento no: el `.docx` se sigue armando al abrir, a partir
  de esos textos y de la plantilla, así que una plantilla corregida en Word se
  nota en las memorias ya hechas.

  Antes no se guardaba ni el texto, para que la memoria reflejara siempre las
  fichas de hoy. Con la IA de por medio eso habría significado pagar una
  llamada al modelo en cada apertura y leer un texto distinto cada vez; si las
  fichas cambian, la memoria se vuelve a generar a propósito.

  El único `update` es el del estado: la fila nace `generando` y el backend
  la deja `lista` con sus secciones cuando termina (o `fallida`). El texto no
  se edita a mano; lo que se actualiza es en qué punto va su redacción.
*/

const TABLA = 'memorias'

/** Forma de una fila de `memorias` tal como la devuelve PostgREST (columnas en snake_case). */
type FilaDeMemoria = {
  readonly id: string
  readonly id_conferencia: string
  readonly id_plantilla: string
  readonly id_dueno: string
  readonly nombre: string
  readonly generada_el: string
  readonly estado?: string | null
  readonly secciones?: Record<string, string | null> | null
}

function memoriaDesdeFila(fila: FilaDeMemoria): Memoria {
  const memoria: Memoria = {
    id: fila.id,
    idConferencia: fila.id_conferencia,
    idPlantilla: fila.id_plantilla,
    idDueno: fila.id_dueno,
    nombre: fila.nombre,
    generadaEl: fila.generada_el,
    /* Las filas de antes de la columna no traen estado, y su contenido ya está escrito. */
    estado: fila.estado === 'generando' || fila.estado === 'fallida' ? fila.estado : 'lista',
  }

  /* Opcional en el dominio: se omite en vez de viajar como nulo. */
  return fila.secciones == null ? memoria : { ...memoria, secciones: fila.secciones }
}

function filaDesdeMemoria(memoria: Memoria): Record<string, unknown> {
  return {
    id: memoria.id,
    id_conferencia: memoria.idConferencia,
    id_plantilla: memoria.idPlantilla,
    id_dueno: memoria.idDueno,
    nombre: memoria.nombre,
    generada_el: memoria.generadaEl,
    estado: memoria.estado,
    secciones: memoria.secciones ?? null,
  }
}

/** De la más reciente a la más antigua. RLS ya acota a las memorias de quien pregunta (B11). */
export async function listarMemorias(): Promise<ResultadoDeConsulta<readonly Memoria[]>> {
  const respuesta = await supabase.from(TABLA).select('*').order('generada_el', { ascending: false })

  const resultado = resultadoDeLista<FilaDeMemoria>(respuesta)

  return resultado.ok ? { ok: true, datos: resultado.datos.map(memoriaDesdeFila) } : resultado
}

/*
  Un fallo de llave foránea aquí (la conferencia o la plantilla elegida ya no
  existen) llega traducido como `DATOS_SIN_PERMISO` por la capa compartida, que
  es el desenlace correcto de cara a quien lo ve: la fila referenciada no está
  a su alcance, y distinguir "no existe" de "no es tuya" convertiría el panel
  en una forma de averiguar qué cargó otra persona.
*/
export async function crearMemoria(memoria: Memoria): Promise<ResultadoDeConsulta<Memoria>> {
  const { error } = await supabase.from(TABLA).insert(filaDesdeMemoria(memoria))

  return error === null ? { ok: true, datos: memoria } : { ok: false, codigo: codigoDeErrorDeSupabase(error) }
}

export async function eliminarMemoria(id: string): Promise<ResultadoDeConsulta<null>> {
  const { error } = await supabase.from(TABLA).delete().eq('id', id)

  return error === null ? { ok: true, datos: null } : { ok: false, codigo: codigoDeErrorDeSupabase(error) }
}

/*
  Que una redacción falle no puede dejar la fila diciendo `generando`: la
  interfaz la consultaría sin fin. El backend ya lo hace cuando el fallo es
  suyo; esto cubre el caso en que la petición no llegó a aceptarse —sin API
  key, sin red, el servidor dormido— y por tanto nadie más va a tocar la fila.
*/
export async function marcarMemoriaFallida(id: string): Promise<ResultadoDeConsulta<null>> {
  const { error } = await supabase.from(TABLA).update({ estado: 'fallida' }).eq('id', id)

  return error === null ? { ok: true, datos: null } : { ok: false, codigo: codigoDeErrorDeSupabase(error) }
}
