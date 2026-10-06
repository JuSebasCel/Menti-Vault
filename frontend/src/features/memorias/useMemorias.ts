import { useCallback, useEffect, useState } from 'react'
import { hayBackend } from '@/shared/api/backend'
import type { CodigoError } from '@/shared/errors'
import type { Memoria } from './data'
import { crearMemoria as crearMemoriaPura } from './memorias'
import type { ResultadoMemoria } from './memorias'
import { memoriasRecordadas, recordarMemorias } from './memoriasRecordadas'
import { crearMemoria, eliminarMemoria, listarMemorias, marcarMemoriaFallida } from './repositorio'
import { pedirRedaccion } from './redaccion'
import { preferenciasActuales } from '@/features/configuracion/preferencias'
import { avisarTermino } from '@/shared/avisos/avisoDeTermino'
import type { HuecoParaRedactar } from './redaccion'

/*
  Estado de las memorias del grupo contra Supabase (B6). Mismo reparto que
  `usePlantillas`: las reglas siguen en `memorias.ts` (qué nombre es válido,
  qué campos son obligatorios) y aquí solo vive el estado y la llamada al
  repositorio. Sin `renombrar`/`actualizar`: una memoria no se edita después
  de generarse.

  `cargando` y `codigoDeError` explícitos por lo mismo que en plantillas: la
  lectura es de red, y sin ellos el listado diría "todavía no hay memorias"
  mientras la promesa no resuelve, y no diría nada cuando la lectura falla.

  A diferencia de plantillas, aquí no hay escritura optimista ni guardado
  diferido: generar una memoria es un acto puntual y explícito, no
  autoguardado, así que se espera la confirmación de la base antes de mostrarla
  en el listado. Una memoria que aparece y desaparece porque el insert falló
  sería peor que medio segundo de espera con el panel todavía abierto.

  Lo que no se espera es la redacción. La fila se guarda primero en
  `generando` y la tarjeta aparece en el acto; el backend redacta en segundo
  plano y deja el texto en la fila. Antes se esperaba a la IA y solo entonces
  se guardaba: el panel quedaba quieto varios minutos y, si la persona cerraba
  la pestaña, el trabajo se perdía sin dejar rastro de que había existido.
  Mientras alguna siga en `generando`, se vuelve a leer el listado cada pocos
  segundos — el mismo canal que usan las conferencias con su `estado`.
*/

export type ValorDeMemorias = {
  readonly memorias: readonly Memoria[]
  readonly cargando: boolean
  /** Fallo al leer el listado. El fallo al generar viaja en el resultado de `generar`. */
  readonly codigoDeError: CodigoError | null
  readonly generar: (
    idConferencia: string,
    idPlantilla: string,
    nombre: string,
    huecos?: readonly HuecoParaRedactar[],
  ) => Promise<ResultadoMemoria>
  readonly eliminar: (id: string) => Promise<void>
}

/*
  Cada cuánto se pregunta por una memoria que se está redactando. Lo bastante
  seguido para que terminar se note en el acto, y lo bastante espaciado para
  que una redacción de cinco minutos sean unas decenas de lecturas y no miles.
*/
const INTERVALO_DE_SONDEO_MS = 4000

export function useMemorias(idUsuario: string): ValorDeMemorias {
  /* Con algo recordado no hay nada que esperar: se enseña y se relee detrás (ver `memoriasRecordadas.ts`). */
  const [memorias, setMemorias] = useState<readonly Memoria[]>(() => memoriasRecordadas(idUsuario) ?? [])
  const [cargando, setCargando] = useState(() => memoriasRecordadas(idUsuario) === null)
  const [codigoDeError, setCodigoDeError] = useState<CodigoError | null>(null)

  useEffect(() => {
    let cancelado = false

    if (idUsuario === '') {
      setMemorias([])
      setCargando(false)
      return
    }

    setCargando(memoriasRecordadas(idUsuario) === null)

    listarMemorias().then((resultado) => {
      if (cancelado) {
        return
      }

      if (resultado.ok) {
        setMemorias(resultado.datos)
        setCodigoDeError(null)
      } else {
        setCodigoDeError(resultado.codigo)
      }

      setCargando(false)
    })

    return () => {
      cancelado = true
    }
  }, [idUsuario])

  /* Lo que se ve es lo que se recuerda, también tras generar o borrar una. */
  useEffect(() => {
    if (!cargando && idUsuario !== '') {
      recordarMemorias(idUsuario, memorias)
    }
  }, [memorias, cargando, idUsuario])

  /*
    Mientras alguna memoria se esté redactando, se vuelve a leer el listado.

    La redacción corre en el backend y escribe en la fila: sin volver a
    preguntar, la tarjeta se quedaría diciendo "Generando…" para siempre
    aunque el texto ya estuviera guardado. Se consulta la lista entera y no
    fila por fila porque es una sola petición y son pocas memorias.

    En cuanto ninguna está `generando`, el intervalo se desmonta y no se
    vuelve a preguntar: no hay sondeo de fondo en una pantalla en reposo.
  */
  useEffect(() => {
    if (!memorias.some((memoria) => memoria.estado === 'generando')) {
      return
    }

    const intervalo = setInterval(() => {
      void (async () => {
        const resultado = await listarMemorias()

        if (!resultado.ok) {
          return
        }

        setMemorias((anteriores) => {
          /*
            El aviso se da aquí y no al pedir la redacción: es cuando de
            verdad hay texto que leer. Solo para las que estaban a medias en
            este navegador, para no avisar de una que terminó en otra pestaña.
          */
          const terminadas = resultado.datos.filter(
            (llegada) =>
              llegada.estado === 'lista' &&
              anteriores.some(
                (anterior) => anterior.id === llegada.id && anterior.estado === 'generando',
              ),
          )

          if (terminadas.length > 0 && preferenciasActuales().avisarAlTerminar) {
            avisarTermino(terminadas.length === 1 ? 'Memoria lista' : 'Memorias listas')
          }

          return resultado.datos
        })
      })()
    }, INTERVALO_DE_SONDEO_MS)

    return () => clearInterval(intervalo)
  }, [memorias])

  const generar = useCallback(
    async (
      idConferencia: string,
      idPlantilla: string,
      nombre: string,
      huecos: readonly HuecoParaRedactar[] = [],
      tono = '',
    ): Promise<ResultadoMemoria> => {
      /*
        Se valida ANTES de redactar: un nombre vacío o una conferencia sin
        elegir se sabe sin llamar a nadie, y descubrirlo después de pagar la
        llamada al modelo sería cobrar por un error que se veía en el
        formulario.
      */
      const validada = crearMemoriaPura(idConferencia, idPlantilla, nombre, idUsuario)

      if (!validada.ok) {
        return validada
      }

      /*
        Sin backend (desarrollo sin `VITE_API_URL`) o sin huecos no hay nada
        que redactar, y la memoria nace `lista`: sale como antes, con los
        datos que se podían copiar de la conferencia.
      */
      const vaARedactar = huecos.length > 0 && hayBackend()

      const resultado = crearMemoriaPura(
        idConferencia,
        idPlantilla,
        nombre,
        idUsuario,
        undefined,
        vaARedactar ? 'generando' : 'lista',
      )

      if (!resultado.ok) {
        return resultado
      }

      const guardada = await crearMemoria(resultado.memoria)

      if (!guardada.ok) {
        return { ok: false, codigo: guardada.codigo }
      }

      /* Al principio, no al final: el listado va de la más reciente a la más antigua. */
      setMemorias((anteriores) => [resultado.memoria, ...anteriores])

      if (!vaARedactar) {
        return resultado
      }

      /*
        La fila ya está y la tarjeta ya se ve, así que el fallo de esta
        petición no impide que la memoria exista: lo que hace es dejarla
        `fallida`, que es lo que la tarjeta sabe decir. Devolver el código
        igualmente permite que el panel lo enseñe sin esperar a releer.
      */
      const pedida = await pedirRedaccion(idConferencia, resultado.memoria.id, huecos, tono)

      if (!pedida.ok) {
        await marcarMemoriaFallida(resultado.memoria.id)
        setMemorias((anteriores) =>
          anteriores.map((candidata) =>
            candidata.id === resultado.memoria.id ? { ...candidata, estado: 'fallida' } : candidata,
          ),
        )

        return { ok: false, codigo: pedida.codigo }
      }

      return resultado
    },
    [idUsuario],
  )

  const eliminar = useCallback(async (id: string): Promise<void> => {
    setMemorias((anteriores) => anteriores.filter((candidata) => candidata.id !== id))
    await eliminarMemoria(id)
  }, [])

  return { memorias, cargando, codigoDeError, generar, eliminar }
}
