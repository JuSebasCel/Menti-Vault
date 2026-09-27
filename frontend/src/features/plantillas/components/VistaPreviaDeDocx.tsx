import { renderAsync } from 'docx-preview'
import type { ReactElement } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useAjusteDeHoja } from './ajusteDeHoja'

export type PropsVistaPreviaDeDocx = {
  blob: Blob | null
  /** Resaltar los `[[marcadores]]` dentro de la hoja. Para configurar una plantilla, no para ver una memoria. */
  resaltarMarcadores?: boolean
  /** Acercar y alejar la hoja: botones en la esquina y Control + rueda. Para leer una plantilla, no para una miniatura. */
  conZoom?: boolean
  /**
   * Los campos de la plantilla en el orden en que aparecen en el documento,
   * para poder decir cuál se pulsó. Con `alPulsarCampo`, cada campo de la
   * hoja se vuelve pulsable y se configura ahí mismo.
   */
  idsDeCampos?: readonly string[]
  alPulsarCampo?: (id: string, caja: DOMRect) => void
}

const NOMBRE_DEL_RESALTE = 'marcadores-de-plantilla'
/* Los `[[` y `]]` de cada campo, aparte: se atenúan para que se lea el nombre. */
const NOMBRE_DE_LOS_CORCHETES = 'corchetes-de-plantilla'

/*
  Resalta cada `[[marcador]]` de la hoja ya pintada, sin tocarla.

  No se envuelve el texto en un `<mark>`: `docx-preview` pinta cada tramo de
  formato de Word como un `<span>` aparte, y un marcador que Word partió en
  tres —pasa, al corregir una letra— vive en tres nodos distintos que ningún
  elemento puede envolver sin romper los de alrededor. La API de resaltado del
  navegador trabaja sobre rangos, que sí pueden cruzar nodos: se busca en el
  texto de todos seguidos y se traduce cada coincidencia a su rango.

  Devuelve los rangos para que `dibujarPildoras` les ponga fondo. El color
  del texto va por la API de resaltado; donde no existe (navegadores viejos)
  solo quedan las píldoras, y la hoja se sigue leyendo igual.
*/
function marcadoresEn(contenedor: HTMLElement): Range[] {
  const nodos: Text[] = []
  const inicios: number[] = []
  let texto = ''

  const recorrido = document.createTreeWalker(contenedor, NodeFilter.SHOW_TEXT)
  while (recorrido.nextNode()) {
    const nodo = recorrido.currentNode as Text
    inicios.push(texto.length)
    nodos.push(nodo)
    texto += nodo.data
  }

  /* El nodo donde cae una posición del texto corrido, y su desplazamiento dentro de él. */
  function ubicar(posicion: number, esFinal: boolean): [Text, number] | null {
    for (let indice = nodos.length - 1; indice >= 0; indice -= 1) {
      const inicio = inicios[indice] ?? 0
      if (esFinal ? inicio < posicion : inicio <= posicion) {
        const nodo = nodos[indice]
        return nodo === undefined ? null : [nodo, posicion - inicio]
      }
    }
    return null
  }

  function rangoEntre(desde: number, hasta: number): Range | null {
    const inicio = ubicar(desde, false)
    const fin = ubicar(hasta, true)
    if (inicio === null || fin === null) {
      return null
    }
    const rango = new Range()
    rango.setStart(inicio[0], inicio[1])
    rango.setEnd(fin[0], fin[1])
    return rango
  }

  const rangos: Range[] = []
  const corchetes: Range[] = []

  for (const coincidencia of texto.matchAll(/\[\[[^[\]]+\]\]/g)) {
    const desde = coincidencia.index
    const hasta = desde + coincidencia[0].length
    const rango = rangoEntre(desde, hasta)

    if (rango !== null) {
      rangos.push(rango)
      for (const corchete of [rangoEntre(desde, desde + 2), rangoEntre(hasta - 2, hasta)]) {
        if (corchete !== null) corchetes.push(corchete)
      }
    }
  }

  if (typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined') {
    CSS.highlights.set(NOMBRE_DEL_RESALTE, new Highlight(...rangos))
    CSS.highlights.set(NOMBRE_DE_LOS_CORCHETES, new Highlight(...corchetes))
  }

  return rangos
}

/*
  Aire del recuadro alrededor del texto, en píxeles de la hoja a tamaño real.
  Poco a propósito: es un campo dentro de un párrafo y no puede empujar ni
  tapar las letras de al lado, como hacía la píldora de antes.
*/
const HOLGURA_HORIZONTAL = 3
const HOLGURA_VERTICAL = 1

/*
  Una píldora detrás de cada marcador, como capa aparte dentro de la hoja.

  `::highlight` solo deja cambiar colores: sin radio ni relleno, el fondo era
  un rectángulo pegado a las letras, y se veía como texto subrayado a
  rotulador. Las píldoras se miden sobre los rangos ya pintados y se colocan
  en coordenadas de la hoja a tamaño real, dividiendo por la escala que tenga
  en ese momento: así acompañan a la hoja cuando se acerca o se aleja sin
  tener que volver a medirlas.

  La escala se saca por eje, comparando la caja en pantalla con
  `offsetWidth`/`offsetHeight`, que no ven ni el zoom ni las
  transformaciones. Con una sola escala salían píldoras de 52 px de alto:
  la hoja suele terminar de pintarse mientras la pantalla todavía crece
  desde su tarjeta, y ese crecimiento escala distinto en ancho y en alto. Van detrás del texto (`z-index: -1`, con la
  hoja aislada como contexto de apilamiento; ver `index.css`).

  Un marcador que Word partió en varios tramos da un rectángulo por tramo; se
  unen los de cada renglón para que salga una sola píldora por línea.
*/
function dibujarPildoras(
  contenedor: HTMLElement,
  rangos: readonly Range[],
  idsDeCampos: readonly string[] = [],
  alPulsarCampo?: (id: string, caja: DOMRect) => void,
): void {
  contenedor.querySelectorAll('.pildora-de-marcador').forEach((pildora) => pildora.remove())

  for (const [indiceDelRango, rango] of rangos.entries()) {
    const hoja = rango.startContainer.parentElement?.closest<HTMLElement>('section.docx')
    if (hoja === null || hoja === undefined || hoja.offsetWidth === 0 || hoja.offsetHeight === 0) {
      continue
    }

    const caja = hoja.getBoundingClientRect()
    const escalaX = caja.width / hoja.offsetWidth
    const escalaY = caja.height / hoja.offsetHeight
    if (escalaX <= 0 || escalaY <= 0) {
      continue
    }

    const renglones: DOMRect[] = []
    for (const tramo of rango.getClientRects()) {
      const mismoRenglon = renglones.find((renglon) => Math.abs(renglon.top - tramo.top) < 2)
      if (mismoRenglon === undefined) {
        renglones.push(DOMRect.fromRect(tramo))
      } else {
        const derecha = Math.max(mismoRenglon.right, tramo.right)
        mismoRenglon.x = Math.min(mismoRenglon.x, tramo.x)
        mismoRenglon.width = derecha - mismoRenglon.x
        mismoRenglon.height = Math.max(mismoRenglon.height, tramo.height)
      }
    }

    for (const renglon of renglones) {
      const pildora = document.createElement('div')
      pildora.className = 'pildora-de-marcador'
      pildora.style.left = `${(renglon.left - caja.left) / escalaX - HOLGURA_HORIZONTAL}px`
      pildora.style.top = `${(renglon.top - caja.top) / escalaY - HOLGURA_VERTICAL}px`
      pildora.style.width = `${renglon.width / escalaX + HOLGURA_HORIZONTAL * 2}px`
      pildora.style.height = `${renglon.height / escalaY + HOLGURA_VERTICAL * 2}px`

      /*
        Pulsar el campo en la hoja lo configura ahí mismo. El id sale del
        orden: los rangos salen de recorrer el documento de principio a fin,
        que es el mismo orden en que se reconocieron los campos al subirlo.
        Sin lista de ids, la píldora sigue siendo decorativa y no intercepta
        el ratón, para no estorbar a quien solo está leyendo la hoja.
      */
      const idDelCampo = idsDeCampos[indiceDelRango]

      if (idDelCampo !== undefined && alPulsarCampo !== undefined) {
        pildora.dataset.campo = idDelCampo
        pildora.style.pointerEvents = 'auto'
        pildora.style.cursor = 'pointer'
        /*
          Por encima del texto, no detrás: en reposo la píldora vive en
          `z-index: -1` para no taparlo, pero ahí tampoco recibe el clic —el
          texto se lo lleva—. Su fondo es un tinte del 7 %, así que por
          delante no esconde nada.
        */
        pildora.style.zIndex = '1'
        pildora.addEventListener('click', () => {
          alPulsarCampo(idDelCampo, pildora.getBoundingClientRect())
        })
      }

      hoja.appendChild(pildora)
    }
  }
}

/*
  Renderiza el `.docx` generado (con los datos de ejemplo ya sustituidos)
  como HTML de solo lectura, fiel al original — no es el editor, no permite
  tocar nada aquí. Si `docx-preview` no logra renderizarlo, se degrada a un
  aviso: la descarga del archivo generado sigue disponible en la pantalla
  que monta este componente, así que nunca es la única salida.
*/
export function VistaPreviaDeDocx({
  blob,
  resaltarMarcadores = false,
  conZoom = false,
  idsDeCampos,
  alPulsarCampo,
}: PropsVistaPreviaDeDocx): ReactElement | null {
  const contenedorRef = useRef<HTMLDivElement>(null)
  /*
    Los campos pulsables viajan por `ref` y no como dependencias del efecto.

    Pintar el documento es tirar el HTML anterior y volver a construirlo, y el
    efecto se rehacía cada vez que cambiaba la identidad de `idsDeCampos` o de
    `alPulsarCampo` —dos valores que se crean nuevos en cada render de quien
    llama—. Medido en la app: la hoja se pintaba, se borraba y se volvía a
    pintar tres veces en el primer segundo. Eso era el parpadeo.
  */
  const campos = useRef({ ids: idsDeCampos, alPulsar: alPulsarCampo })
  campos.current = { ids: idsDeCampos, alPulsar: alPulsarCampo }
  const [fallo, setFallo] = useState(false)
  const [pintada, setPintada] = useState(false)
  /* 16 px de aire: el `p-4` del contenedor, que `clientWidth` cuenta como espacio disponible. */
  const { zoom, escalar, ajustar } = useAjusteDeHoja(contenedorRef, pintada, 'ancho', 16, { conRueda: conZoom })

  useEffect(() => {
    const contenedor = contenedorRef.current
    if (blob === null || contenedor === null) {
      return
    }

    setFallo(false)
    setPintada(false)
    contenedor.innerHTML = ''

    /*
      `inWrapper: false` parecía más simple (sin un div extra), pero
      apagaba de paso el centrado y el fondo blanco de página que trae
      `docx-preview` por defecto (`.docx-wrapper { display:flex;
      align-items:center }` + `.docx-wrapper>section.docx { background:
      white }` — ver `styles/index.css`, donde se sobreescribe el gris fijo
      de la librería por los tokens del sistema). Sin el wrapper, la página
      queda transparente y pegada al borde izquierdo — la causa real del
      "no se ve centrada, fondo negro" que reportó el usuario.
    */
    renderAsync(blob, contenedor, undefined, { inWrapper: true })
      .then(() => {
        setPintada(true)
        if (resaltarMarcadores) {
          const rangos = marcadoresEn(contenedor)
          const pintar = (): void =>
            dibujarPildoras(contenedor, rangos, campos.current.ids, campos.current.alPulsar)

          pintar()
          /* Con las fuentes de Word ya cargadas el texto se mueve: se vuelven a medir. */
          void document.fonts?.ready.then(pintar)
        }
      })
      .catch(() => {
        setFallo(true)
      })

    return () => {
      if (resaltarMarcadores && typeof CSS !== 'undefined' && 'highlights' in CSS) {
        CSS.highlights.delete(NOMBRE_DEL_RESALTE)
        CSS.highlights.delete(NOMBRE_DE_LOS_CORCHETES)
      }
    }
  }, [blob, resaltarMarcadores])

  if (blob === null) {
    return null
  }

  if (fallo) {
    return (
      <p className="text-sm text-texto-tenue">
        No pudimos mostrar la vista previa dentro de la página. Descarga el archivo generado para revisarlo en
        Word.
      </p>
    )
  }

  /*
    Con zoom, la hoja es la pantalla de trabajo y ocupa todo el alto que le
    da quien la contiene. Sin él —la memoria, cuando el PDF no sale— es una
    vista más dentro de una página que ya se desplaza, y se acota a la
    ventana.
  */
  const hoja = (
    <div className={conZoom ? 'relative h-full' : 'relative'}>
      <div
        ref={contenedorRef}
        className={`vista-previa-docx overflow-auto bg-fondo p-4 ${
          conZoom ? 'h-full rounded-2xl' : 'elevacion max-h-[70vh] rounded-sm border border-filete'
        }`}
      />

      {/*
        Mientras `docx-preview` construye el documento —unos 150 ms— su caja
        está vacía. Medido al abrir una memoria: el hueco de la pantalla
        desaparecía a los 840 ms y la hoja no llegaba hasta los 979, y ese
        pestañeo se veía. El papel en blanco ocupa ese hueco, encima y con el
        mismo sitio, así que el documento aparece sobre él sin saltos.
      */}
      {pintada ? null : (
        <div className="barrido-de-carga pointer-events-none absolute inset-0 overflow-hidden rounded-2xl bg-papel" />
      )}
    </div>
  )

  if (!conZoom) {
    return hoja
  }

  /*
    El control flota sobre la hoja, fuera de la caja que se desplaza: si
    fuera dentro, al bajar por la página se iría con ella. Los botones
    acercan en pasos de un 20 %, lo mismo que una muesca de la rueda con
    Control, y el porcentaje, al pulsarlo, vuelve a encajar la hoja al
    ancho.
  */
  return (
    <div className="relative h-full">
      {hoja}

      {zoom === null ? null : (
        <div className="elevacion absolute right-3 bottom-3 flex items-center gap-0.5 rounded-full bg-panel p-1">
          <BotonDeZoom icono="remove" etiqueta="Alejar" alPulsar={() => escalar(1 / PASO_DE_ZOOM)} />
          <button
            type="button"
            onClick={ajustar}
            aria-label="Ajustar la hoja al ancho"
            title="Ajustar al ancho"
            className="h-8 min-w-14 cursor-pointer rounded-full px-2 text-sm tabular-nums text-texto-tenue transition-colors hover:bg-acento-tenue hover:text-texto"
          >
            {Math.round(zoom * 100)} %
          </button>
          <BotonDeZoom icono="add" etiqueta="Acercar" alPulsar={() => escalar(PASO_DE_ZOOM)} />
        </div>
      )}
    </div>
  )
}

const PASO_DE_ZOOM = 1.2

function BotonDeZoom({ icono, etiqueta, alPulsar }: { icono: string; etiqueta: string; alPulsar: () => void }): ReactElement {
  return (
    <button
      type="button"
      onClick={alPulsar}
      aria-label={etiqueta}
      title={`${etiqueta} (Control + rueda)`}
      className="flex size-8 cursor-pointer items-center justify-center rounded-full text-texto-tenue transition-colors hover:bg-acento-tenue hover:text-texto"
    >
      <span aria-hidden="true" className="material-symbols-rounded icono-contorno text-lg">
        {icono}
      </span>
    </button>
  )
}
