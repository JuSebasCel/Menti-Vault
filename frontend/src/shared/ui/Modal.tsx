import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactElement, ReactNode, RefObject } from 'react'

/*
  Modal del sistema, calcado de la app de referencia.

  **No aparece: crece desde el botón que lo abrió.** En el primer cuadro se le
  aplica la transformación que lo calza exactamente encima del disparador
  —`scale(ancho del botón / ancho de la ventana)` más su traslación— y se
  suelta para que la transición lo lleve a identidad. Es un FLIP, y es lo que
  hace sentir que el botón *se convierte* en el modal.

  Tres capas corren juntas, y las tres hacen falta:

      ventana, transform   caja del botón → identidad   300ms, curva de entrada
      ventana, filtro      blur(32px) → 0               300ms
      velo                 opacidad y desenfoque        250ms

  El cierre es el mismo recorrido al revés.

  Cuatro trampas que costaron una sesión entera, y que están documentadas en
  la skill `diseno-visual`:

  1. Una animación CSS le gana a los estilos en línea mientras siga activa:
     las clases de entrada se **quitan** al cerrar, o la salida no pinta nada.
  2. Anclar y medir para el FLIP van en el **mismo** efecto y en ese orden.
  3. `montado` va en las dependencias del efecto de layout: la ventana se
     monta un render después de `abierto`, y sin esa dependencia el efecto
     corre con la ref en `null` y no vuelve a ejecutarse.
  4. Las props que describen el modal no pueden derivarse de si está abierto,
     o al cerrar cambian de golpe mientras corre la salida.
*/

export type AnclajeDeModal = 'centro' | 'disparador'

export type PropsModal = {
  abierto: boolean
  alCerrar: () => void
  titulo: string
  children: ReactNode
  /** `disparador` lo posa sobre el botón que lo abrió; `centro`, en mitad de pantalla. */
  anclaje?: AnclajeDeModal
  /** El botón que lo abre. Si se pasa, la ventana **crece desde él**. */
  anclaEn?: RefObject<HTMLElement | null>
  ancho?: 'angosto' | 'normal'
  /** Región dentro de la cual debe quedar la ventana anclada, para no montarse sobre la navegación. */
  limites?: RefObject<HTMLElement | null>
  /**
   * Si pulsar el velo cierra el modal. Por defecto sí.
   *
   * Se apaga en los que llevan un formulario a medio escribir: ahí el clic
   * fuera no es "ya terminé", es un resbalón que tira un título, un ponente y
   * una fecha sin preguntar. Un panel de selección se puede descartar de un
   * clic porque no hay nada que perder; un formulario no.
   *
   * Escape se queda en los dos casos: es una tecla que se pulsa a propósito,
   * no algo que pase por accidente, y quitarla dejaría el modal sin salida de
   * teclado.
   */
  cerrarAlPulsarElVelo?: boolean
  /**
   * Hacia dónde se abre el modal anclado.
   *
   * - `izquierda` (por defecto): su borde derecho se alinea con el del botón
   *   y la ventana crece hacia dentro de la pantalla.
   * - `derecha`: la pone A LA DERECHA del botón, sin taparlo.
   * - `desde-el-borde`: alinea su borde izquierdo con el del botón, así que
   *   nace justo encima de él y crece hacia la derecha. Es lo que quieren
   *   los botones del dock: `izquierda` los mandaba fuera de la pantalla y
   *   `derecha` los dejaba flotando lejos de lo que se acababa de pulsar.
   */
  crecerHacia?: 'izquierda' | 'derecha' | 'desde-el-borde'
  /**
   * Sin cabecera, sin fondo y sin relleno: el contenido es la ventana entera.
   * Para los modales que traen su propia superficie, como el del chat.
   */
  sinMarco?: boolean
}

const ANCHO: Record<'angosto' | 'normal', string> = {
  angosto: 'w-110',
  normal: 'w-180',
}

const MARGEN = 16
const DURACION = 300

/*
  El disparador solo sirve de ancla si sigue vivo y ocupa espacio.

  Un nodo que ya salió del documento —porque su fila se volvió a montar
  mientras el modal estaba abierto: un guardado que recarga la lista, el sondeo
  del análisis, un reordenamiento— devuelve `getBoundingClientRect()` con todo
  a cero. Y cero no es un valor neutro aquí: el FLIP lo lee como "el botón está
  en la esquina superior izquierda y mide nada", así que al cerrar el modal se
  encogía hacia esa esquina, que es justo donde está el título de la pantalla.
  Parecía que el modal se metiera dentro del cabezal.

  Sin ancla utilizable no se inventa una: el modal se funde donde está, que es
  el comportamiento honesto cuando ya no se sabe de dónde vino.
*/
function anclaUtilizable(elemento: HTMLElement | null | undefined): DOMRect | null {
  if (!elemento || !elemento.isConnected) {
    return null
  }

  const caja = elemento.getBoundingClientRect()

  return caja.width > 0 && caja.height > 0 ? caja : null
}

/*
  Coloca la ventana pegada a su disparador y dentro de la pantalla: alineada
  por la derecha con el botón (o a su derecha, con `crecerHacia`), y con el
  borde superior subido lo necesario para que su alto quepa.
*/
function situarAnclado(
  ventana: HTMLElement,
  caja: DOMRect,
  crecerHacia: NonNullable<PropsModal['crecerHacia']>,
  bordeIzquierdo: number,
): void {
  ventana.style.position = 'absolute'
  ventana.style.top = `${caja.top}px`
  ventana.style.right = `${window.innerWidth - caja.right}px`

  /*
    `offsetWidth`/`offsetHeight` y no `getBoundingClientRect()`: este último
    incluye la escala del FLIP, y en el primer cuadro la ventana mide lo que
    el botón. Con eso un modal anclado a un botón del pie (Menti, en el dock)
    "cabía" en su sitio y se abría por debajo de la pantalla.
  */
  const anchoVentana = ventana.offsetWidth
  const altoVentana = ventana.offsetHeight

  ventana.style.top = `${Math.max(MARGEN, Math.min(caja.top, window.innerHeight - altoVentana - MARGEN))}px`

  if (crecerHacia === 'derecha' || crecerHacia === 'desde-el-borde') {
    const deseada = crecerHacia === 'derecha' ? caja.right + MARGEN / 2 : caja.left
    const izquierda = Math.min(deseada, window.innerWidth - anchoVentana - MARGEN)
    ventana.style.right = ''
    /*
      Con `desde-el-borde` el límite es la pantalla y no el borde de la zona
      (`bordeIzquierdo`): el botón está DENTRO del dock, así que respetar esa
      zona lo habría empujado fuera de su propio botón.
    */
    ventana.style.left = `${Math.max(MARGEN, crecerHacia === 'derecha' ? Math.max(bordeIzquierdo, izquierda) : izquierda)}px`
  } else {
    const derecha = window.innerWidth - caja.right
    if (window.innerWidth - derecha - anchoVentana < bordeIzquierdo) {
      ventana.style.right = `${window.innerWidth - bordeIzquierdo - anchoVentana}px`
    }
  }
}

export function Modal({
  abierto,
  alCerrar,
  titulo,
  children,
  anclaje = 'centro',
  anclaEn,
  ancho = 'normal',
  limites,
  cerrarAlPulsarElVelo = true,
  crecerHacia = 'izquierda',
  sinMarco = false,
}: PropsModal): ReactElement | null {
  const ventanaRef = useRef<HTMLDivElement>(null)
  const veloRef = useRef<HTMLDivElement>(null)
  const pulsadoEnElVelo = useRef(false)
  const observadorDeTamano = useRef<ResizeObserver | null>(null)
  const alCerrarRef = useRef(alCerrar)

  /* Sobrevive a `abierto`: al cerrar hay que seguir en el DOM lo que dure la salida. */
  const [montado, setMontado] = useState(abierto)

  useEffect(() => {
    alCerrarRef.current = alCerrar
  })

  useLayoutEffect(() => {
    const ventana = ventanaRef.current

    if (!abierto || ventana === null) {
      return
    }

    /* Borrar lo que haya dejado una salida a medio camino: si no, reaparece invisible. */
    ventana.style.filter = ''
    ventana.style.opacity = ''

    const ancla = anclaUtilizable(anclaEn?.current)

    function situarJuntoAlAncla(elemento: HTMLElement, caja: DOMRect): void {
      const zona = limites?.current?.getBoundingClientRect()
      situarAnclado(elemento, caja, crecerHacia, (zona?.left ?? 0) + MARGEN)
    }

    if (anclaje === 'disparador' && ancla !== null) {
      situarJuntoAlAncla(ventana, ancla)

      /*
        Y otra vez cada vez que la ventana cambie de alto.

        El primer cálculo se hace con lo que hay dentro en ese instante, y
        varios modales crecen después: el de generar memoria mide un par de
        renglones hasta que llegan las conferencias y las plantillas. Medido
        solo al abrir, un modal que nace abajo —el botón del estado vacío está
        a media pantalla— acababa saliéndose por el borde inferior. El
        observador vuelve a subirlo en cuanto crece.
      */
      const observador = new ResizeObserver(() => {
        const anclaAhora = anclaUtilizable(anclaEn?.current)
        if (anclaAhora !== null) {
          situarJuntoAlAncla(ventana, anclaAhora)
        }
      })
      observador.observe(ventana)
      observadorDeTamano.current = observador
    }

    if (ancla === null) {
      return
    }

    const destino = ventana.getBoundingClientRect()
    const origen = ancla

    if (destino.width === 0 || destino.height === 0) {
      return
    }

    const escalaX = origen.width / destino.width
    const escalaY = origen.height / destino.height
    const dx = origen.left + origen.width / 2 - (destino.left + destino.width / 2)
    const dy = origen.top + origen.height / 2 - (destino.top + destino.height / 2)

    ventana.style.transition = 'none'
    ventana.style.transform = `translate(${dx}px, ${dy}px) scale(${escalaX}, ${escalaY})`

    const cuadro = requestAnimationFrame(() => {
      ventana.style.transition = `transform ${DURACION}ms var(--ease-entrada)`
      ventana.style.transform = ''
    })

    return () => {
      cancelAnimationFrame(cuadro)
      observadorDeTamano.current?.disconnect()
      observadorDeTamano.current = null
    }
  }, [abierto, montado, anclaje, anclaEn, limites, crecerHacia])

  /* Salida: el mismo FLIP al revés; al terminar, recién ahí se desmonta. */
  useEffect(() => {
    if (abierto) {
      setMontado(true)
      return
    }

    if (!montado) {
      return
    }

    const ventana = ventanaRef.current
    const velo = veloRef.current
    /*
      `matchMedia` puede no existir —jsdom no lo trae, y algun navegador
      empotrado tampoco—. Sin esta guarda, cerrar el modal reventaba con
      `window.matchMedia is not a function` en vez de simplemente animar.
      Ante la duda se anima: es el comportamiento por defecto del sistema.
    */
    const sinMovimiento =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const duracion = sinMovimiento ? 0 : DURACION

    if (!sinMovimiento && ventana !== null) {
      ventana.style.transition = 'none'
      ventana.style.transform = ''
      void ventana.offsetWidth

      const origen = anclaUtilizable(anclaEn?.current)
      const destino = ventana.getBoundingClientRect()

      ventana.style.transition = `transform ${duracion}ms var(--ease-entrada), filter ${duracion}ms ease, opacity ${duracion}ms ease`
      ventana.style.filter = 'blur(32px)'
      ventana.style.opacity = '0'

      if (origen !== null && destino.width > 0 && destino.height > 0) {
        const dx = origen.left + origen.width / 2 - (destino.left + destino.width / 2)
        const dy = origen.top + origen.height / 2 - (destino.top + destino.height / 2)
        ventana.style.transform = `translate(${dx}px, ${dy}px) scale(${origen.width / destino.width}, ${origen.height / destino.height})`
      }
    }

    if (!sinMovimiento && velo !== null) {
      /*
        El velo se va DESPUÉS que la ventana, no a la vez.

        Yéndose juntos, el desenfoque del fondo se levantaba mientras el modal
        todavía estaba encogiéndose encima: durante un instante se veía el
        título de la pantalla nítido y medio tapado por un modal a medio
        cerrar. Se retrasa el arranque del velo la mayor parte del recorrido y
        luego se va rápido, así que el fondo solo se destapa cuando ya no hay
        nada delante. El total no cambia.
      */
      const espera = Math.round(duracion * 0.55)
      const fundido = duracion - espera

      velo.style.transition = `opacity ${fundido}ms ease ${espera}ms, backdrop-filter ${fundido}ms ease ${espera}ms`
      velo.style.opacity = '0'
      velo.style.backdropFilter = 'blur(0px)'
    }

    const temporizador = setTimeout(() => setMontado(false), duracion)
    return () => clearTimeout(temporizador)
  }, [abierto, montado, anclaEn])

  useEffect(() => {
    if (!abierto) {
      return
    }

    const enfocadoAntes =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const desbordePrevio = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function alPresionarTecla(evento: KeyboardEvent): void {
      if (evento.key === 'Escape') alCerrarRef.current()
    }

    document.addEventListener('keydown', alPresionarTecla)
    return () => {
      document.removeEventListener('keydown', alPresionarTecla)
      document.body.style.overflow = desbordePrevio
      enfocadoAntes?.focus()
    }
  }, [abierto])

  if (!montado) {
    return null
  }

  /* Al cerrar se quitan las clases de entrada: sus animaciones mandarían sobre los estilos en línea. */
  const cerrando = !abierto

  /*
    El modal se dibuja en un portal sobre `document.body`.

    `position: fixed` no basta: un antepasado con `position: sticky`, un
    `transform` o un `filter` crea contexto de apilamiento y atrapa dentro a
    sus descendientes fijos. El dock es `sticky`, asi que la campana —que vive
    dentro de el— pintaba su velo confinado al dock: el resto de la pantalla
    se veia nitido y las pastillas de tema y conferencia atravesaban el
    desenfoque. Con el portal, el velo no tiene antepasados que lo encierren.
  */
  return createPortal(
    <div
      ref={veloRef}
      /*
        Se cierra solo si el clic EMPIEZA y termina en el velo. Un `click` se
        dispara sobre el ancestro común de donde se presionó y donde se soltó:
        al seleccionar texto dentro del modal y soltar fuera, ese ancestro es
        el velo, y el modal se cerraba a mitad de un gesto que no era de salir.
      */
      onPointerDown={(evento) => {
        pulsadoEnElVelo.current = evento.target === evento.currentTarget
      }}
      onClick={(evento) => {
        if (cerrarAlPulsarElVelo && pulsadoEnElVelo.current && evento.target === evento.currentTarget) alCerrar()
        pulsadoEnElVelo.current = false
      }}
      className={`velo-de-modal fixed inset-0 z-50 p-4 ${cerrando ? '' : 'velo-entra'} ${
        anclaje === 'centro' ? 'flex items-center justify-center' : ''
      }`}
    >
      <div
        ref={ventanaRef}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        /*
          Alto acotado con el cuerpo desplazable: un formulario largo dentro
          de un modal centrado se salía por abajo de la pantalla y su botón de
          envío quedaba fuera de alcance. La cabecera no se desplaza.

          El tope es `100dvh - 2rem` y no `max-h-full`: el `p-4` del velo no
          encoge a un hijo posicionado en absoluto —que es como queda el modal
          anclado—, así que con `full` el modal llegaba a medir la ventana
          entera y quedaba pegado al borde de arriba y al de abajo a la vez.
          Restando el margen a mano, los 16px de aire valen para los dos
          anclajes. `dvh` y no `vh` por la barra del navegador en móvil.
        */
        className={`${cerrando ? '' : 'entra-con-desenfoque'} ${ANCHO[ancho]} flex max-h-[calc(100dvh-2rem)] max-w-full flex-col rounded-[32px] ${
          sinMarco ? 'overflow-hidden' : 'bg-panel'
        } focus:outline-none`}
      >
        {sinMarco ? (
          children
        ) : (
          <>
            <div className="flex shrink-0 items-center gap-3 px-5 pt-5 pb-3">
              <button
                type="button"
                onClick={alCerrar}
                aria-label="Cerrar"
                className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-2xl text-texto-tenue transition-colors hover:text-texto"
              >
                <span aria-hidden="true" className="material-symbols-rounded icono-contorno">
                  close
                </span>
              </button>
              <h2 className="font-titulo text-[28px] leading-tight font-semibold text-texto">
                {titulo}
              </h2>
            </div>

            <div className="sin-barra-de-scroll flex min-h-0 flex-col gap-4 overflow-y-auto px-8 pt-2 pb-8">
              {children}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
