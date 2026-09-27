import type { ReactElement } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useSession } from '@/features/auth/session'
import { useConferenciasVisibles } from '@/features/conferencias/components/useConferenciasVisibles'
import { fichasVisibles } from '@/features/conferencias/query'
import { useDocxDePlantilla } from '@/features/plantillas/useDocxDePlantilla'
import { usePlantillas } from '@/features/plantillas/usePlantillas'
import { useTemas } from '@/features/taxonomia'
import type { CodigoError } from '@/shared/errors'
import { mensajeDeError } from '@/shared/errors'
import { Esqueleto, PanelDeError, useCrecerDesdeOrigen } from '@/shared/ui'
import { VistaPreviaDeMemoria } from '../components'
import type { ResultadoDeMemoria } from '../generarMemoria'
import { generarMemoria } from '../generarMemoria'
import { huecosPorRevisar } from '../redaccion'
import { useMemorias } from '../useMemorias'

/*
  Vista de una memoria ya generada. Nunca muestra un documento congelado: la
  memoria guardada es solo la referencia (`idConferencia`/`idPlantilla`), así
  que aquí se resuelve esa conferencia y esa plantilla de nuevo y se vuelve a
  correr `generarMemoria` — si cualquiera de las dos ya no existe, se avisa en
  vez de mostrar un documento a medias.

  Desde B6 hay un tercer ingrediente que llega por red: si la plantilla es una
  importada, sus bytes viven en el bucket `plantillas-docx` y se descargan aquí
  (`useDocxDePlantilla`) antes de generar. Por eso la pantalla distingue con
  cuidado "todavía no llegó" de "no existe": mientras cualquiera de las tres
  lecturas sigue en curso, decir "no encontramos esa memoria" sería mentir.
*/

function EnlaceDeRegreso(): ReactElement {
  return (
    <Link
      to="/memorias"
      /* Visible dice "Memorias", como una miga; para un lector de pantalla, junto al "Memorias" del dock, hace falta decir que regresa. */
      aria-label="Volver a memorias"
      className="flex w-fit items-center gap-1 rounded-full py-1 pr-2 text-sm text-texto-tenue transition-colors hover:text-texto"
    >
      <span aria-hidden="true" className="material-symbols-rounded icono-contorno text-base">
        arrow_back
      </span>
      Memorias
    </Link>
  )
}

export function PantallaDetalleMemoria(): ReactElement {
  const { idMemoria = '' } = useParams()
  const { usuario } = useSession()
  const idUsuario = usuario?.id ?? ''
  const { memorias, cargando: cargandoMemorias } = useMemorias(idUsuario)
  const { visibles, fichas: fichasVisiblesTodas, carga } = useConferenciasVisibles(idUsuario)
  const { plantillas, cargando: cargandoPlantillas } = usePlantillas()
  const pantalla = useRef<HTMLDivElement>(null)
  /* Crece desde la tarjeta de la que se abrió (ver `shared/ui/crecerDesde.ts`). */
  useCrecerDesdeOrigen(pantalla, idMemoria)

  const memoria = memorias.find((candidata) => candidata.id === idMemoria)
  const conferenciaVisible = visibles.find((visible) => visible.conferencia.id === memoria?.idConferencia)
  const plantilla = plantillas.find((candidata) => candidata.id === memoria?.idPlantilla)

  const rutaDelDocx = plantilla?.origen === 'docx' ? plantilla.rutaArchivoOriginal : null
  const { archivo, codigoDeError: errorDelDocx } = useDocxDePlantilla(rutaDelDocx)

  /*
    El campo fijo `tema_principal` sale del id que guarda la conferencia, así
    que la generación necesita el pool para escribir el nombre. Se lee una vez
    por montaje y no dentro del efecto, para que un arreglo nuevo en cada
    render no vuelva a disparar la generación en bucle.
  */
  const { temas } = useTemas()

  const [resultado, setResultado] = useState<ResultadoDeMemoria | null>(null)
  const [error, setError] = useState<CodigoError | null>(null)

  const cargandoOrigen = cargandoMemorias || cargandoPlantillas || carga === 'cargando'

  useEffect(() => {
    if (cargandoOrigen || memoria === undefined) {
      return
    }

    if (conferenciaVisible === undefined) {
      setError('CONF_NO_ENCONTRADA')
      return
    }

    if (plantilla === undefined) {
      setError('PLANT_NO_ENCONTRADA')
      return
    }

    /* Plantilla importada cuyo archivo todavía no llegó: se espera, sin borrar lo que ya se veía. */
    if (rutaDelDocx !== null && archivo === null) {
      if (errorDelDocx !== null) {
        setError(errorDelDocx)
      }
      return
    }

    let cancelado = false
    setError(null)
    setResultado(null)

    const fichas = fichasVisibles(fichasVisiblesTodas, conferenciaVisible)

    const bytes = archivo === null ? Promise.resolve(null) : archivo.arrayBuffer()

    bytes
      /*
        Con las secciones que la IA escribió al generarla: abrir una memoria
        no vuelve a llamar al modelo. Sin ellas (memorias anteriores a la
        redacción con IA), sale como antes.
      */
      .then((datos) =>
        generarMemoria(plantilla, conferenciaVisible.conferencia, fichas, temas, datos, memoria.secciones),
      )
      .then((valor) => {
        if (!cancelado) {
          setResultado(valor)
        }
      })
      .catch(() => {
        if (!cancelado) {
          setError('MEM_FALLO_GENERACION')
        }
      })

    return () => {
      cancelado = true
    }
  }, [cargandoOrigen, memoria, conferenciaVisible, plantilla, rutaDelDocx, archivo, errorDelDocx, temas, fichasVisiblesTodas])

  /*
    El contenedor que crece desde la tarjeta es el mismo mientras carga y con
    la memoria ya leída. Antes, la carga y el error salían por su cuenta y la
    animación solo arrancaba al llegar el contenido: se veía el esqueleto a
    pantalla completa y, encima, la pantalla creciendo desde la tarjeta —el
    parpadeo—.
  */
  if (cargandoOrigen || memoria === undefined) {
    return (
      <div ref={pantalla} className="flex min-h-0 flex-1 flex-col gap-6">
        {cargandoOrigen ? (
          <Esqueleto filas={4} etiqueta="Cargando la memoria" />
        ) : (
          <div className="flex flex-col gap-5">
            <PanelDeError mensaje={mensajeDeError('MEM_NO_ENCONTRADA')} />
            <EnlaceDeRegreso />
          </div>
        )}
      </div>
    )
  }

  /*
    Los huecos que se quedaron sin material y cuya plantilla pidió avisar. Es
    lo único que hay que mirar antes de mandar la memoria: el resto está
    escrito, estos no, y quien diseñó la plantilla quería enterarse.
  */
  const porRevisar =
    plantilla === undefined || memoria.secciones === undefined ? [] : huecosPorRevisar(plantilla, memoria.secciones)

  return (
    <div ref={pantalla} className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex flex-col gap-1">
        <EnlaceDeRegreso />
        <h1 className="font-titulo text-[32px] leading-tight font-semibold text-texto">{memoria.nombre}</h1>
      </div>

      {porRevisar.length === 0 ? null : (
        <div role="status" className="flex items-start gap-3 rounded-[20px] bg-acento-tenue px-5 py-4">
          <span aria-hidden="true" className="material-symbols-rounded icono-contorno mt-0.5 text-xl text-texto-tenue">
            info
          </span>
          <p className="text-sm leading-relaxed text-texto">
            La charla no dio material para{' '}
            <span className="font-medium">{porRevisar.join(', ')}</span>. Esos campos quedaron en blanco:
            revísalos antes de enviar la memoria.
          </p>
        </div>
      )}

      {error !== null ? (
        <PanelDeError mensaje={mensajeDeError(error)} />
      ) : resultado === null ? (
        /*
          Un hueco con la forma de la hoja que va a llegar, y no una línea de
          texto. Medido en la app: entre que se abre la memoria y que aparece
          el documento pasa más de un segundo, y con solo "Generando la
          memoria…" la pantalla se veía vacía y el documento entraba de golpe.
          Ocupando su sitio desde el principio, no salta nada.
        */
        <div
          role="status"
          aria-label="Generando la memoria"
          className="flex min-h-0 flex-1 flex-col items-center gap-4 rounded-[24px] bg-panel p-6"
        >
          <div className="barrido-de-carga relative w-full max-w-[42rem] flex-1 overflow-hidden rounded-[16px] bg-papel" />
          <p className="text-sm text-texto-tenue">Generando la memoria…</p>
        </div>
      ) : (
        <VistaPreviaDeMemoria resultado={resultado} nombre={memoria.nombre} />
      )}
    </div>
  )
}
