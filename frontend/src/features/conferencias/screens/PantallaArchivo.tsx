import { AnimatePresence, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent, ReactElement, ReactNode, RefObject } from 'react'
import { nombreDeTema } from '@/features/taxonomia'
import type { Tema } from '@/features/taxonomia'
import {
  BotonPildora,
  Popover,
  EstadoVacioIlustrado,
  CLASES_DE_PILDORA,
  ConfirmacionEnSitio,
  colorPorClave,
  EleccionEnPastillas,
  Esqueleto,
  hoyEnIso,
  Modal,
  ModalDeConfirmacion,
  SelectorDeFecha,
  SelectorDeOpciones,
  PanelDeError,
  SelectorDeVista,
} from '@/shared/ui'
import type { ColorDePildora, OpcionDeVista } from '@/shared/ui'
import { mensajeDeError } from '@/shared/errors'
import type { ResultadoCreacion } from '../components'
import { FragmentoDeAudio, SelectorDeEtiquetas } from '../components'
import { TIPO_EN_SINGULAR } from '../components/vocabulario'
import { formatearTimestamp } from '../data'
import type {
  Conferencia,
  Etiqueta,
  EstadoDeProcesamiento,
  Ficha,
  ReferenciaDeConferencia,
} from '../data'
import { densidadDe } from '../carga'
import { estadoParaMostrar, useTareasEnSegundoPlano } from '../carga/segundoPlano'
import type { TareaEnSegundoPlano } from '../carga/segundoPlano'
import { useDirectorio } from '../directorio'
import {
  CRITERIOS_POR_DEFECTO,
  fichasDelCatalogo,
  fueCondensada,
  fueEditada,
  ordenarEventos,
  ordenarFichas,
  textoDeFicha,
} from '../query'
import type {
  ConferenciaVisible,
  CriteriosDeListado,
  FichaDelCatalogo,
  FiltroDeEstado,
  OrdenDeEventos,
  OrdenDeFichas,
  OrdenDeListado,
  Segmento,
} from '../query'
import type { EtiquetaVisible } from '../tags'

/*
  Archivo: todo el material en una sola pantalla, con el modelo de columnas de
  la app de referencia.

  **Navegación por niveles, con ventana deslizante de tres columnas:**

      Eventos  →  Conferencias o Temas  →  Fichas  →  Detalle

  El segundo nivel tiene dos caras porque hay dos formas legítimas de buscar
  lo mismo: por la charla en que se dijo, o por el tema del que trata. Antes
  solo estaba la de temas, y una conferencia no se podía abrir — que es
  justamente lo que dejaba a "Ir a la conferencia" sin ningún sitio adonde ir.

  Las columnas **colapsan animando `max-width`** (0.7s, medido de la
  referencia) en vez de desaparecer: por eso se ve como una puerta corredera y
  no como un salto. Ver `.columna-colapsable` en `styles/index.css`.

  **La vista completa no es solo para el detalle.** Sirve en cualquier nivel:
  esconde las columnas de navegación y deja la del nivel actual a todo lo
  ancho, con su propio retroceso. Que solo valiera para la ficha era un modo
  a medias.

  Medidas de la referencia: columnas con 8px de separación, radio 24 y padding
  24; las de navegación rellenas y la de detalle sobre el fondo con filete;
  filas de radio 16 con padding 8/24, y la elegida en el par de ilustración.
*/

const TODOS_EVENTOS = 'todos-eventos'
const TODOS = 'todos'

type Vista = 'columnas' | 'completa'
/* Por dónde se entra al segundo nivel. Las dos desembocan en las mismas fichas. */
type Eje = 'conferencias' | 'temas'
/* Sobre qué busca el buscador. Sin texto escrito da igual, y no se muestra. */
type Ambito = 'seleccion' | 'todo'

/*
  Todas las fichas se ven igual.

  El estado de validación sale de la interfaz por decisión del usuario: se
  confía en el análisis y no se le pide a nadie que confirme ficha por ficha.
  El campo sigue en la base de datos y el backend lo sigue escribiendo, así
  que devolverlo es volver a pintarlo, no volver a calcularlo.

  Ojo con lo que esto implica y está escrito en `analisis/clasificacion.py`:
  las citas textuales y los datos de impacto tienen umbral inalcanzable
  precisamente porque nadie más atrapa una cita mal transcrita.
*/
const ICONO_DE_FICHA = 'format_quote'

const CAMPO_DE_TEXTO =
  'h-12 w-full rounded-2xl bg-acento-tenue px-4 text-base text-texto placeholder:text-texto-tenue focus:outline-2 focus:outline-offset-2 focus:outline-acento'

/*
  El estado del análisis, dicho en la propia fila.

  Faltaba del todo: una conferencia recién cargada aparecía con su evento y su
  ponente y cero fichas, sin nada que distinguiera "todavía no la han
  analizado" de "la analizaron y no encontró nada". Son situaciones muy
  distintas y solo una se arregla esperando.

  `procesada` no dice nada: es el caso normal y anunciarlo sería ruido en cada
  fila. Lo que se anuncia es lo que no ha terminado.
*/
const ESTADO_DEL_ANALISIS: Record<EstadoDeProcesamiento, string | null> = {
  'en-cola': 'En cola, sin analizar',
  procesando: 'Analizando…',
  procesada: null,
  fallida: 'El análisis falló',
}

const ICONO_DE_ESTADO: Record<EstadoDeProcesamiento, string> = {
  'en-cola': 'schedule',
  procesando: 'autorenew',
  procesada: 'check',
  fallida: 'error',
}

/*
  Parte el contexto en lo que va antes de la cita, la cita, y lo que va
  despues.

  `contextoMinimo` son los segmentos vecinos de la transcripcion unidos, y la
  cita esta literalmente dentro: el backend la recorta de ahi y tiene prohibido
  reescribirla. Asi que se puede localizar y envolver, que es lo que hace
  evidente donde encaja lo que se dijo sin tener que explicarlo con un rotulo.

  Se busca sin acentos ni mayusculas y con los espacios colapsados, porque el
  fragmento y el contexto pueden diferir en eso; los indices se aplican luego
  sobre el texto original para no devolver una version normalizada.

  Si no se encuentra —la cita abarca mas de lo que el contexto alcanza— se
  devuelve `null` y se pinta solo la cita: peor es ensenar dos veces lo mismo.
*/
function partirContexto(
  contexto: string,
  fragmento: string,
): { antes: string; cita: string; despues: string } | null {
  const plano = (texto: string) =>
    texto
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()

  const contextoPlano = plano(contexto)
  const fragmentoPlano = plano(fragmento.trim())

  if (fragmentoPlano === '') {
    return null
  }

  const indice = contextoPlano.indexOf(fragmentoPlano)

  if (indice === -1) {
    return null
  }

  return {
    antes: contexto.slice(0, indice).trim(),
    cita: contexto.slice(indice, indice + fragmentoPlano.length),
    despues: contexto.slice(indice + fragmentoPlano.length).trim(),
  }
}

/*
  La cita literal, envuelta en lo que se dijo alrededor.

  Se saco del detalle a su propio componente cuando el modal de "como se dijo"
  paso a necesitar exactamente lo mismo: el parrafo tal como se dijo, con lo
  citado resaltado en medio. Duplicarlo habria dejado dos sitios donde arreglar
  el mismo resalte.

  Si el contexto no alcanza a contener la cita se pinta solo la cita: peor es
  ensenar dos veces lo mismo.
*/
function CitaEnContexto({ contexto, fragmento }: { contexto: string; fragmento: string }): ReactElement {
  const partes = partirContexto(contexto, fragmento)

  if (partes === null) {
    return <p className="font-titulo text-[22px] leading-snug text-texto">«{fragmento}»</p>
  }

  return (
    <p className="text-[19px] leading-relaxed text-texto-tenue">
      {partes.antes === '' ? null : <span>…{partes.antes} </span>}
      <span className="font-titulo font-semibold text-texto">«{partes.cita}»</span>
      {partes.despues === '' ? null : <span> {partes.despues}…</span>}
    </p>
  )
}

/*
  Cómo se dice en la fila cuántas fichas se pidieron.

  Empieza por el verbo —"Pediste pocas"— y no por el sustantivo. La fila ya
  dice "26 fichas · Julián Mora" un renglón más arriba, así que una pastilla
  que dijera "Fichas · pocas" al lado pondría dos cantidades distintas de lo
  mismo sin explicar que una es lo que hay y la otra lo que se pidió. El verbo
  en segunda persona lo resuelve solo: lo pedido tiene un autor, el recuento
  no.

  Con la densidad reconstruida se dice la palabra que se eligió, que es lo que
  uno recuerda haber pulsado. Cuando no se puede reconstruir se dice el
  número, que nunca miente — pasa con las transcripciones, donde al cargarlas
  no había duración con la que calcular el techo.

  Descartada la idea de los puntitos (●○○○): codifican cuánto, pero no de qué,
  así que seguirían necesitando el rótulo que venían a ahorrar; y no saben
  representar los dos casos de borde, "sin tope" y "hasta 26".
*/
function etiquetaDeCuota(maximoDeFichas: number | null, duracionEnSegundos: number): string {
  const densidad = densidadDe(maximoDeFichas, duracionEnSegundos)

  if (densidad === 'libre' || maximoDeFichas === null) {
    return 'Pediste sin tope'
  }

  return densidad === null ? `Pediste hasta ${maximoDeFichas}` : `Pediste ${densidad}`
}

/*
  El último valor no nulo que ha tenido `valor`.

  Para los modales cuyo contenido depende de a qué apuntan: mientras el modal
  sale, `valor` ya es `null`, pero hay que seguir enseñando lo que se estaba
  enseñando. Se guarda en estado y no en una ref porque el render tiene que
  reaccionar cuando se abre sobre otra cosa.
*/
function useUltimoNoNulo<T>(valor: T | null): T | null {
  const [ultimo, setUltimo] = useState<T | null>(valor)

  if (valor !== null && valor !== ultimo) {
    setUltimo(valor)
  }

  return valor ?? ultimo
}

/**
 * Los dos estados desde los que el backend acepta (re)analizar. Ver
 * `ESTADOS_PROCESABLES`. Con el archivo subiendo o el análisis ya pedido, no:
 * un segundo clic solo mandaría otra petición igual.
 */
function sePuedeAnalizar(estado: EstadoDeProcesamiento, tarea: TareaEnSegundoPlano | null): boolean {
  if (tarea !== null && tarea.fase !== 'error') {
    return false
  }

  return estado === 'en-cola' || estado === 'fallida'
}

/*
  Lo que dice la fila cuando hay una tarea de este navegador en marcha: manda
  sobre lo que dice la base, que todavía no se ha enterado.
*/
const TEXTO_DE_TAREA = {
  subiendo: { texto: 'Subiendo el archivo…', icono: 'upload' },
  iniciando: { texto: 'Analizando…', icono: 'autorenew' },
} as const

const VISTAS: readonly [OpcionDeVista<Vista>, OpcionDeVista<Vista>] = [
  { valor: 'columnas', icono: 'view_column', etiqueta: 'Ver en columnas' },
  { valor: 'completa', icono: 'grid_view', etiqueta: 'Ver a pantalla completa' },
]

const EJES: readonly { valor: Eje; etiqueta: string }[] = [
  { valor: 'conferencias', etiqueta: 'Conferencias' },
  { valor: 'temas', etiqueta: 'Temas' },
]

const PROCEDENCIAS: readonly { valor: Segmento; etiqueta: string; icono: string }[] = [
  { valor: 'todas', etiqueta: 'Todas', icono: 'select_all' },
  { valor: 'propias', etiqueta: 'Propias', icono: 'person' },
  { valor: 'compartidas', etiqueta: 'Compartidas', icono: 'group' },
]

/*
  El orden de cada columna del explorador, en el mismo modal que los
  filtros: los dos deciden qué se ve y cómo, y un segundo botón en la barra
  sería otro control que buscar. Etiquetas cortas a propósito: cuatro
  opciones tienen que caber en un segmentado del ancho del modal.
*/
const ORDENES_DE_EVENTOS: readonly { valor: OrdenDeEventos; etiqueta: string; icono: string }[] = [
  { valor: 'recientes', etiqueta: 'Recientes', icono: 'schedule' },
  { valor: 'antiguos', etiqueta: 'Antiguos', icono: 'history' },
  { valor: 'alfabetico', etiqueta: 'A–Z', icono: 'sort_by_alpha' },
]

const ORDENES_DE_CONFERENCIAS: readonly { valor: OrdenDeListado; etiqueta: string; icono: string }[] = [
  { valor: 'fecha-desc', etiqueta: 'Recientes', icono: 'schedule' },
  { valor: 'fecha-asc', etiqueta: 'Antiguas', icono: 'history' },
  { valor: 'titulo-asc', etiqueta: 'A–Z', icono: 'sort_by_alpha' },
  { valor: 'fichas-desc', etiqueta: 'Más fichas', icono: 'stacks' },
]

const ORDENES_DE_FICHAS: readonly { valor: OrdenDeFichas; etiqueta: string; icono: string }[] = [
  { valor: 'charla', etiqueta: 'Como se dijeron', icono: 'format_list_numbered' },
  { valor: 'tema', etiqueta: 'Por tema', icono: 'label' },
  { valor: 'tipo', etiqueta: 'Por tipo', icono: 'category' },
]

/*
  El color de cada tipo de ficha, por lo que significa y siempre el mismo:
  así se reconoce el tipo de un vistazo antes de leer el rótulo. El ámbar va
  al dato de impacto (la cifra que se busca) y el rosa a la cita literal (lo
  que no se puede tocar).
*/
const COLOR_DE_TIPO: Record<Ficha['tipoDeUnidad'], ColorDePildora> = {
  metodo: 'azul',
  estrategia: 'verde',
  'dato-de-impacto': 'ambar',
  'cita-textual': 'rosa',
  postura: 'violeta',
  'fase-del-trabajo': 'turquesa',
}

/* Cinco opciones son demasiadas para un segmentado: van como pastillas de una sola elección. */
const ESTADOS: readonly { valor: FiltroDeEstado; etiqueta: string; icono: string }[] = [
  { valor: 'todos', etiqueta: 'Cualquiera', icono: 'select_all' },
  { valor: 'procesada', etiqueta: 'Procesada', icono: 'check_circle' },
  { valor: 'procesando', etiqueta: 'Procesando', icono: 'progress_activity' },
  { valor: 'en-cola', etiqueta: 'En cola', icono: 'hourglass_empty' },
  { valor: 'fallida', etiqueta: 'Interrumpida', icono: 'error' },
]

/** Cuántos filtros están puestos. Lo dice el botón, para no tener que abrirlo a mirar. */
function contarFiltros(criterios: CriteriosDeListado): number {
  const porSegmento = criterios.segmento === CRITERIOS_POR_DEFECTO.segmento ? 0 : 1
  const porEstado = criterios.estado === CRITERIOS_POR_DEFECTO.estado ? 0 : 1

  return porSegmento + porEstado + criterios.etiquetas.length
}

/*
  Grupo de pastillas mutuamente excluyentes; lo usan el eje y el ámbito.

  **Se dimensiona por su contenido (`w-fit`), nunca al ancho del padre:** a
  todo lo ancho de la vista completa el control se estiraba hasta perder la
  forma de pastilla y dejaba de leerse como un interruptor.

  El relleno del elegido es **una sola pieza que se desliza**, no un fondo que
  salta de un botón a otro. Las columnas son `1fr` iguales (`auto-cols-fr`),
  así que su sitio es `translateX(índice × 100%)` sin medir nada.
*/
function Segmentado<T extends string>({
  opciones,
  valor,
  alCambiar,
}: {
  opciones: readonly { valor: T; etiqueta: string }[]
  valor: T
  alCambiar: (siguiente: T) => void
}): ReactElement {
  const indice = Math.max(
    0,
    opciones.findIndex((opcion) => opcion.valor === valor),
  )

  return (
    <div className="relative grid w-fit auto-cols-fr grid-flow-col rounded-full bg-acento-tenue p-1">
      <span
        aria-hidden="true"
        /* `p-1` a cada lado: el carril mide el ancho del grupo menos esos 8px. */
        style={{
          width: `calc((100% - 0.5rem) / ${opciones.length})`,
          transform: `translateX(${indice * 100}%)`,
        }}
        className="absolute top-1 bottom-1 left-1 rounded-full bg-acento transition-transform duration-300 ease-(--ease-rebote-suave)"
      />

      {opciones.map((opcion) => (
        <button
          key={opcion.valor}
          type="button"
          onClick={() => alCambiar(opcion.valor)}
          aria-pressed={valor === opcion.valor}
          className={`relative z-10 cursor-pointer rounded-full px-4 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
            valor === opcion.valor ? 'text-acento-contraste' : 'text-texto-tenue hover:text-texto'
          }`}
        >
          {opcion.etiqueta}
        </button>
      ))}
    </div>
  )
}

function Columna({
  children,
  pie,
  ancho,
  colapsada = false,
  expandida = false,
  variante = 'rellena',
}: {
  children: ReactNode
  pie?: ReactNode
  /** Ancho natural en píxeles; es también el tope del que colapsa. */
  ancho: number
  colapsada?: boolean
  /** En vista completa, la columna del nivel actual ocupa el sitio de las demás. */
  expandida?: boolean
  variante?: 'rellena' | 'contorno'
}): ReactElement {
  return (
    <section
      /*
        El ancho va en línea y no como clase de Tailwind porque es el mismo
        número que sirve de `max-width`: tenerlo en dos sitios los deja
        divergir en cuanto alguien cambie uno.

        Expandida cede el ancho al flex (`flex-1`) en vez de pedir un número
        enorme: con un ancho fijo de 9999 la columna se salía de la pantalla y
        las filas quedaban cortadas por el borde derecho.
      */
      style={{
        maxWidth: colapsada ? 0 : expandida ? '100%' : ancho,
        width: expandida ? 'auto' : ancho,
      }}
      /*
        `inert` y no solo `aria-hidden`: una columna con `max-width: 0` sigue
        teniendo dentro botones alcanzables con el tabulador, y se tabulaba a
        ciegas hacia lo que la animación ya había tapado.
      */
      inert={colapsada}
      aria-hidden={colapsada ? 'true' : undefined}
      className={`columna-colapsable flex flex-col rounded-[24px] ${expandida ? 'min-w-0 flex-1' : 'shrink-0'} ${colapsada ? 'p-0' : 'p-6'} ${
        variante === 'rellena' ? 'bg-panel' : 'bg-fondo shadow-[inset_0_0_0_1px_var(--bitacora-filete)]'
      }`}
    >
      {/*
        El contenido guarda su ancho natural mientras la columna se cierra.
        Sin esto, cada línea se re-parte en cada cuadro de los 0.7s y las tres
        columnas reflúyen a la vez: el texto "baila" y se siente saturado. Con
        el ancho fijo, la columna se recorta como una persiana y el único
        reflujo que queda es el del panel de detalle al ganar sitio, que es el
        que de verdad aporta.
      */}
      <div
        style={{ minWidth: expandida ? undefined : ancho - 32 }}
        className="sin-barra-de-scroll -mx-2 min-h-0 flex-1 overflow-y-auto px-2"
      >
        {children}
      </div>
      {pie === undefined ? null : (
        <div style={{ minWidth: expandida ? undefined : ancho - 48 }} className="flex flex-col pt-4">
          {pie}
        </div>
      )}
    </section>
  )
}

/* Radio 16 y padding 8/24, como la referencia. El alto crece si hay segunda línea. */
const FILA = 'flex w-full cursor-pointer items-center gap-2 rounded-2xl px-6 py-2 text-left text-base'

function Fila({
  activa = false,
  icono,
  secundario,
  etiquetas,
  cuota,
  accion,
  trabajando = false,
  onClick,
  children,
}: {
  activa?: boolean
  icono: string
  secundario?: string
  /* Solo texto: la fila entera ya es un botón y anidar otro dentro no es válido. */
  etiquetas?: readonly EtiquetaVisible[]
  /**
   * Cuantas fichas se pidieron al cargarla ("pocas", "hasta 26"…).
   *
   * Va junto a las etiquetas pero se distingue de ellas: una etiqueta la pone
   * una persona para organizarse, esto es un dato de la conferencia. Por eso
   * lleva icono y contorno en vez del relleno de las etiquetas propias.
   */
  cuota?: string
  /**
   * Control propio, fuera del boton de la fila.
   *
   * Va como hermano y no dentro: un `<button>` anidado en otro no es HTML
   * valido, y el navegador lo desanida por su cuenta dejando el marcado y los
   * eventos en un sitio que no es el que se escribio.
   */
  accion?: ReactNode
  /** Barrido de luz mientras el análisis corre: es la única señal de que algo se mueve. */
  trabajando?: boolean
  onClick?: () => void
  children: ReactNode
}): ReactElement {
  const fila = (
    <button
      type="button"
      onClick={onClick}
      aria-current={activa ? 'true' : undefined}
      className={`${FILA} transition-colors ${accion === undefined ? '' : 'pr-14'} ${
        trabajando ? 'barrido-de-carga relative overflow-hidden' : ''
      } ${activa ? 'bg-ilustracion text-ilustracion-texto' : 'text-texto hover:bg-acento-tenue'}`}
    >
      <span
        aria-hidden="true"
        className={`material-symbols-rounded icono-relleno mt-0.5 shrink-0 self-start text-xl ${
          activa ? '' : '[color:var(--bitacora-ilustracion-texto)]'
        }`}
      >
        {icono}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className={secundario === undefined ? 'truncate' : 'line-clamp-2 leading-snug'}>{children}</span>
        {secundario === undefined ? null : (
          <span className={`truncate text-sm ${activa ? 'opacity-80' : 'text-texto-tenue'}`}>{secundario}</span>
        )}

        {cuota === undefined && (etiquetas === undefined || etiquetas.length === 0) ? null : (
          <span className="mt-1 flex flex-wrap items-center gap-1">
            {cuota === undefined ? null : (
              /*
                Sin icono. Llevaba el de ajustes y no venía a cuento: esto no
                es una preferencia que se pueda tocar desde aquí, es cuántas
                fichas se pidieron al cargarla. El rótulo "Fichas" hace ese
                trabajo mejor que cualquier símbolo.
              */
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${
                  activa ? 'bg-ilustracion-texto/15' : CLASES_DE_PILDORA.violeta
                }`}
              >
                {cuota}
              </span>
            )}

            {(etiquetas ?? []).map(({ etiqueta, propia }) => (
              <span
                key={etiqueta.id}
                /* Las ajenas van en contorno: son de quien compartió, no se pueden quitar desde aquí. */
                className={`rounded-full px-2 py-0.5 text-xs ${
                  activa
                    ? 'bg-ilustracion-texto/15'
                    : propia
                      ? CLASES_DE_PILDORA[colorPorClave(etiqueta.id)]
                      : 'text-texto-tenue shadow-[inset_0_0_0_1px_var(--bitacora-filete)]'
                }`}
              >
                {etiqueta.nombre}
              </span>
            ))}
          </span>
        )}
      </span>
    </button>
  )

  if (accion === undefined) {
    return fila
  }

  return (
    <div className="relative">
      {fila}
      <div className="absolute top-1.5 right-3">{accion}</div>
    </div>
  )
}

/*
  Deslizar una fila hacia la izquierda para descubrir la papelera.

  Solo envuelve las conferencias propias: en una ajena el gesto descubriria un
  boton que RLS va a rechazar, y prometer una accion que no se puede hacer es
  peor que no ofrecerla.

  Descubrir NO borra. El tiron deja la papelera a la vista y es pulsarla lo
  que abre la confirmacion de siempre, la que dice cuantas fichas se pierden:
  un gesto que se dispara sin querer al desplazarse no puede ser el que borra
  una charla de hora y media de analisis.
*/
const ANCHO_DE_LA_PAPELERA = 76

function FilaDeslizable({
  alBorrar,
  children,
}: {
  alBorrar: () => void
  children: ReactNode
}): ReactElement {
  const [revelada, setRevelada] = useState(false)
  const reducirMovimiento = useReducedMotion()

  /*
    La papelera no existe en reposo: su opacidad sale de cuánto se ha
    deslizado la fila, y vale cero con la fila en su sitio.

    Estaba siempre pintada debajo, tapada por la fila, y eso no basta. La
    fila y la papelera las recorta el mismo borde redondeado del envoltorio, y
    en la curva los píxeles del antialiasing mezclan la capa de delante con
    la de detrás: el rojo se filtraba como un hilo en las dos esquinas de la
    derecha —justo los 76px donde está la papelera—, que en tema oscuro, con
    el rojo claro del sistema, se veía como un borde naranja. Medido: la
    papelera ocupaba x 828–904 con fondo `oklch(0.75 0.15 25)` bajo una fila
    de radio 0.

    Tapar algo no es lo mismo que no tenerlo. Ahora aparece a medida que se
    tira, que además dice mejor lo que hace el gesto.
  */
  const desplazamiento = useMotionValue(0)
  const opacidadDeLaPapelera = useTransform(
    desplazamiento,
    [-ANCHO_DE_LA_PAPELERA / 2, 0],
    [1, 0],
  )

  /*
    Sin arrastre no hay gesto, y sin gesto la papelera no tendria como salir:
    con `prefers-reduced-motion` la fila se queda quieta y el borrado sigue
    estando donde siempre estuvo, en el modal de la conferencia.
  */
  if (reducirMovimiento) {
    return <>{children}</>
  }

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <motion.button
        type="button"
        onClick={alBorrar}
        tabIndex={revelada ? 0 : -1}
        aria-hidden={!revelada}
        aria-label="Borrar la conferencia"
        /*
          `acento-contraste` y no blanco: en claro el rojo del sistema es
          oscuro y el blanco encima funciona, pero en oscuro es un rojo claro
          y el blanco encima se pierde. El token ya es "lo que contrasta con
          la superficie" en cada tema.
        */
        className="absolute inset-y-0 right-0 flex cursor-pointer items-center justify-center rounded-r-2xl bg-error text-acento-contraste"
        style={{ width: ANCHO_DE_LA_PAPELERA, opacity: opacidadDeLaPapelera }}
      >
        <span aria-hidden="true" className="material-symbols-rounded icono-relleno text-2xl">
          delete
        </span>
      </motion.button>

      <motion.div
        drag="x"
        dragConstraints={{ left: -ANCHO_DE_LA_PAPELERA, right: 0 }}
        dragElastic={0.04}
        dragMomentum={false}
        animate={{ x: revelada ? -ANCHO_DE_LA_PAPELERA : 0 }}
        transition={{ type: 'spring', stiffness: 520, damping: 42 }}
        onDragEnd={(_, info) => setRevelada(info.offset.x < -ANCHO_DE_LA_PAPELERA / 2)}
        style={{ x: desplazamiento }}
        /* Sobre el fondo de la columna: sin esto la papelera se ve por debajo de la fila. */
        className="relative bg-panel"
      >
        {children}
      </motion.div>
    </div>
  )
}

function AccionDeColumna({
  icono,
  children,
  onClick,
  ref,
  insignia,
}: {
  icono: string
  children: string
  /* Recibe el evento porque hay modales que se anclan al boton que los abrio. */
  onClick?: (evento: MouseEvent<HTMLButtonElement>) => void
  ref?: RefObject<HTMLButtonElement | null>
  insignia?: number
}): ReactElement {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className={`${FILA} text-texto transition-colors hover:bg-acento-tenue`}
    >
      <span aria-hidden="true" className="material-symbols-rounded icono-contorno shrink-0 text-xl">
        {icono}
      </span>
      {children}
      {insignia === undefined || insignia === 0 ? null : (
        <span className="ml-auto rounded-full bg-acento px-2 text-sm text-acento-contraste">{insignia}</span>
      )}
    </button>
  )
}

/*
  El ponente de una conferencia, al editarla: se elige entre los ya creados
  de su evento, o se crea uno nuevo en la misma lista, igual que al cargarla.

  Antes era un campo de texto: cambiar de ponente obligaba a borrar el
  nombre y escribir otro, y un error de dedo creaba en la práctica un
  ponente nuevo que el directorio no conocía. Eligiéndolo, el nombre es
  siempre uno que existe.

  La conferencia guarda el nombre, no el id, así que aquí se traduce en los
  dos sentidos. Dos casos de datos viejos: si el ponente actual no está en
  el directorio, aparece igual como opción para no dejar la pastilla vacía;
  y si el evento no está, no hay de dónde colgar uno nuevo, y queda el campo
  de texto.
*/
function SelectorDePonente({
  evento,
  ponente,
  eventos,
  ponentes,
  crearPonente,
  eliminarPonente,
  alCambiar,
}: {
  evento: string
  ponente: string
  eventos: ReturnType<typeof useDirectorio>['eventos']
  ponentes: ReturnType<typeof useDirectorio>['ponentes']
  crearPonente: ReturnType<typeof useDirectorio>['crearPonente']
  eliminarPonente: ReturnType<typeof useDirectorio>['eliminarPonente']
  alCambiar: (nombre: string) => void
}): ReactElement {
  const idEvento = eventos.find((candidato) => candidato.nombre === evento)?.id

  if (idEvento === undefined) {
    return (
      <input
        value={ponente}
        onChange={(cambio) => alCambiar(cambio.target.value)}
        aria-label="Ponente"
        placeholder="Ponente"
        className={CAMPO_DE_TEXTO}
      />
    )
  }

  const delEvento = ponentes.filter((candidato) => candidato.idEvento === idEvento)
  const actual = delEvento.find((candidato) => candidato.nombre === ponente)
  const opciones = [
    ...(actual === undefined && ponente.trim() !== '' ? [{ valor: VALOR_DEL_PONENTE_ACTUAL, etiqueta: ponente }] : []),
    ...delEvento.map((candidato) => ({ valor: candidato.id, etiqueta: candidato.nombre })),
  ]

  return (
    <div className="flex">
      <SelectorDeOpciones
        etiquetaAccesible="Ponente"
        icono="mic"
        vacio="Elige un ponente"
        valor={actual?.id ?? (ponente.trim() === '' ? '' : VALOR_DEL_PONENTE_ACTUAL)}
        opciones={opciones}
        textoDeCreacion="Nombre del ponente nuevo"
        alCrear={async (nombre) => {
          const resultado = await crearPonente(idEvento, nombre)
          if (!resultado.ok) {
            return { ok: false, mensaje: mensajeDeError(resultado.codigo) }
          }

          alCambiar(resultado.ponente.nombre)
          return { ok: true, valor: resultado.ponente.id }
        }}
        /* Solo los del directorio: el nombre que ya traía la conferencia no es una entrada que borrar. */
        alEliminar={(valor) => {
          if (valor !== VALOR_DEL_PONENTE_ACTUAL) {
            void eliminarPonente(valor)
          }
        }}
        alCambiar={(valor) => {
          const elegido = ponentes.find((candidato) => candidato.id === valor)
          if (elegido !== undefined) {
            alCambiar(elegido.nombre)
          }
        }}
      />
    </div>
  )
}

/* El ponente que ya tenía la conferencia cuando no está en el directorio: no tiene id propio. */
const VALOR_DEL_PONENTE_ACTUAL = 'ponente-actual'

export type PropsPantallaArchivo = {
  /** Ya filtradas por los criterios: esta pantalla pinta, no decide qué entra. */
  visibles: readonly ConferenciaVisible[]
  fichas: readonly Ficha[]
  temas: readonly Tema[]
  cargando: boolean
  error: string | null
  alCargarConferencia: () => void
  /** Lo que te compartieron y no contestaste: se ofrece arriba de la lista, con aceptar y rechazar. */
  invitaciones?: readonly Conferencia[]
  alResponderInvitacion?: (idConferencia: string, aceptar: boolean) => void
  criterios: CriteriosDeListado
  /** Las etiquetas propias, que son las únicas que se pueden poner y quitar. */
  etiquetas: readonly Etiqueta[]
  etiquetasDe: (idConferencia: string) => readonly EtiquetaVisible[]
  /** Si hay conferencias antes de filtrar: distingue el vacío por filtros del vacío por falta de datos. */
  hayConferenciasSinFiltrar: boolean
  /** Se cuelga del botón de cargar, que es de donde crece el modal de carga. */
  refDelBotonDeCarga?: RefObject<HTMLElement | null>
  refDelBotonDeCompartir?: RefObject<HTMLElement | null>
  alCompartir?: () => void
  alCambiarCriterios: (cambio: Partial<CriteriosDeListado>) => void
  alAlternarEtiquetaDelFiltro: (idEtiqueta: string) => void
  alCrearEtiqueta: (nombre: string) => Promise<ResultadoCreacion>
  alAlternarAsignacion: (idEtiqueta: string, idConferencia: string) => void
  alEliminarEtiqueta?: (idEtiqueta: string) => void
  /** Vuelve a pedirle al backend que analice esa conferencia. */
  alAnalizar?: (idConferencia: string) => void
  /** Busca las fuentes que cita la charla. Devuelve el mensaje de error, o `null` si fue bien. */
  alBuscarReferencias?: (idConferencia: string) => Promise<string | null>
  alRenombrarConferencia?: (
    idConferencia: string,
    cambio: { titulo: string; ponente: string; fechaDelEvento: string; descripcion: string },
  ) => void
  alEliminarConferencia?: (idConferencia: string) => void
  /** Guarda la versión escrita a mano de una ficha (texto vacío la quita). Solo sobre las propias. */
  alEditarFicha?: (idFicha: string, texto: string) => Promise<boolean>
  /** Borra una ficha del análisis. Solo se ofrece sobre las conferencias propias. */
  alEliminarFicha?: (idFicha: string) => void
}

export function PantallaArchivo({
  visibles,
  fichas,
  temas,
  cargando,
  error,
  alCargarConferencia,
  invitaciones = [],
  alResponderInvitacion,
  criterios,
  etiquetas,
  etiquetasDe,
  hayConferenciasSinFiltrar,
  refDelBotonDeCarga,
  refDelBotonDeCompartir,
  alCompartir,
  alCambiarCriterios,
  alAlternarEtiquetaDelFiltro,
  alCrearEtiqueta,
  alAlternarAsignacion,
  alEliminarEtiqueta,
  alAnalizar,
  alBuscarReferencias,
  alRenombrarConferencia,
  alEliminarConferencia,
  alEditarFicha,
  alEliminarFicha,
}: PropsPantallaArchivo): ReactElement {
  const [evento, setEvento] = useState<string>(TODOS_EVENTOS)
  const [eje, setEje] = useState<Eje>('conferencias')
  /* `null` mientras no se haya bajado al tercer nivel: decide qué columna se colapsa. */
  const [rama, setRama] = useState<string | null>(null)
  const [idFicha, setIdFicha] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [ambito, setAmbito] = useState<Ambito>('seleccion')
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false)
  /*
    La conferencia abierta en su modal, por id y no por bandera: el modal se
    abre desde la fila y puede ser cualquiera, no solo la de la rama activa.
  */
  const [idEnDetalle, setIdEnDetalle] = useState<string | null>(null)
  /* A cual apunta la confirmacion de borrado: la del modal o la que se deslizo. */
  const [idParaBorrar, setIdParaBorrar] = useState<string | null>(null)
  const [edicion, setEdicion] = useState({ titulo: '', ponente: '', fechaDelEvento: '', descripcion: '' })
  const [literalAbierta, setLiteralAbierta] = useState(false)
  /* La barra de audio de la ficha abierta, y el borrador de la versión escrita a mano. */
  const [audioAbierto, setAudioAbierto] = useState(false)
  const reducirMovimiento = useReducedMotion()
  const [borrador, setBorrador] = useState('')
  const [guardandoEdicion, setGuardandoEdicion] = useState(false)
  /* La ficha cuyo borrado está preguntando, con el mismo gesto que las etiquetas. */
  const [fichaPorBorrar, setFichaPorBorrar] = useState<string | null>(null)

  useEffect(() => {
    setAudioAbierto(false)
  }, [idFicha])
  const [vista, setVista] = useState<Vista>('columnas')
  const tareas = useTareasEnSegundoPlano()
  /* La búsqueda de fuentes citadas del detalle: en curso, y el fallo de la última. */
  const [buscandoReferencias, setBuscandoReferencias] = useState(false)
  const [errorDeReferencias, setErrorDeReferencias] = useState<string | null>(null)
  /* Los ponentes ya creados, para cambiar el de una conferencia eligiéndolo en vez de reescribir su nombre. */
  const {
    eventos: eventosDelDirectorio,
    ponentes: ponentesDelDirectorio,
    crearPonente,
    eliminarPonente,
  } = useDirectorio()

  const botonDeFiltros = useRef<HTMLButtonElement>(null)
  /*
    Anclas vivas, no fijas: hay un boton por fila, asi que el disparador se
    guarda en el momento de pulsarlo. El modal solo lee la ref al abrirse.
  */
  const botonDeDetalle = useRef<HTMLButtonElement | null>(null)
  const botonDeBorrado = useRef<HTMLButtonElement | null>(null)
  const botonDeLiteral = useRef<HTMLButtonElement>(null)
  const marco = useRef<HTMLDivElement>(null)

  /* Sin conferencias no hay recorrido que ofrecer: ni eventos, ni temas, ni fichas. */
  const archivoVacio = !hayConferenciasSinFiltrar && visibles.length === 0 && invitaciones.length === 0

  const filtrosActivos = contarFiltros(criterios)

  /*
    Lo que un modal enseña no puede desaparecer al cerrarlo.

    `idEnDetalle` dice si el modal está abierto, y al cerrar vuelve a `null`
    en el acto. Si el contenido se derivara de él, el formulario se
    desmontaría ANTES de que empezara la animación de salida, y lo que se
    animaría sería la carcasa vacía: medido, la ventana pasaba de 567px a 112
    —solo su barra de título, "✕ Conferencia"— y así cruzaba la pantalla
    hasta desaparecer. Es la trampa 4 de la skill de diseño, y aquí cayó
    entera.

    Así que se retiene el último id que se mostró y el contenido sale de ahí.
    Abrir lo actualiza; cerrar no lo toca. La confirmación de borrado tenía el
    mismo defecto —su título y su recuento de fichas se vaciaban mientras se
    iba— y lleva el mismo arreglo.
  */
  const idEnDetalleMostrado = useUltimoNoNulo(idEnDetalle)
  const idParaBorrarMostrado = useUltimoNoNulo(idParaBorrar)

  const conferenciaEnDetalle =
    idEnDetalleMostrado === null
      ? undefined
      : visibles.find((v) => v.conferencia.id === idEnDetalleMostrado)

  const conferenciaParaBorrar =
    idParaBorrarMostrado === null
      ? undefined
      : visibles.find((v) => v.conferencia.id === idParaBorrarMostrado)

  /*
    Abrir el modal carga el formulario con lo que hay.

    Se hace al abrir y no con un efecto sobre `idEnDetalle` porque el
    formulario es estado propio: un efecto lo pisaria mientras se escribe si
    algo mas provocara un render con el modal ya abierto.
  */
  function abrirDetalle(visible: ConferenciaVisible, disparador: HTMLButtonElement): void {
    botonDeDetalle.current = disparador
    setEdicion({
      titulo: visible.conferencia.titulo,
      ponente: visible.conferencia.ponente,
      fechaDelEvento: visible.conferencia.fechaDelEvento,
      descripcion: visible.conferencia.descripcion,
    })
    setIdEnDetalle(visible.conferencia.id)
  }

  /* Las etiquetas propias de la conferencia abierta en el modal. */
  const etiquetasPropiasDelDetalle = useMemo(
    () =>
      idEnDetalleMostrado === null
        ? []
        : etiquetasDe(idEnDetalleMostrado)
            .filter((visible) => visible.propia)
            .map((visible) => visible.etiqueta.id),
    [idEnDetalleMostrado, etiquetasDe],
  )

  const entradas = useMemo(
    () =>
      ordenarFichas(fichasDelCatalogo(fichas, visibles), criterios.ordenDeFichas, (idTema) =>
        nombreDeTema(temas, idTema),
      ),
    [fichas, visibles, criterios.ordenDeFichas, temas],
  )

  const eventos = useMemo(
    () => ordenarEventos(visibles, criterios.ordenDeEventos),
    [visibles, criterios.ordenDeEventos],
  )

  /* Filtrado en cascada: cada nivel acota lo que ve el siguiente. */
  const porEvento = useMemo(
    () => (evento === TODOS_EVENTOS ? entradas : entradas.filter((e) => e.conferencia.evento === evento)),
    [entradas, evento],
  )

  const conferenciasDelEvento = useMemo(
    () => visibles.filter((v) => evento === TODOS_EVENTOS || v.conferencia.evento === evento),
    [visibles, evento],
  )

  /* Solo los temas que de verdad aparecen: una lista con ceros no ayuda a elegir. */
  const temasPresentes = useMemo(() => {
    const ids = new Set(porEvento.map((e) => e.ficha.idTema))
    return temas.filter((t) => ids.has(t.id))
  }, [porEvento, temas])

  /* Cómo se llama la rama elegida. Lo piden la miga y el rótulo del buscador. */
  const nombreDeRama = useMemo(() => {
    if (rama === null || rama === TODOS) {
      return null
    }

    return eje === 'temas'
      ? (temas.find((t) => t.id === rama)?.nombre ?? null)
      : (visibles.find((v) => v.conferencia.id === rama)?.conferencia.titulo ?? null)
  }, [rama, eje, temas, visibles])

  /* Sin nada elegido, "esta selección" y "todo el archivo" son lo mismo. */
  const nombreDeLaSeleccion = useMemo(() => {
    const partes = [evento === TODOS_EVENTOS ? null : evento, nombreDeRama].filter(
      (parte): parte is string => parte !== null,
    )
    return partes.length === 0 ? null : partes.join(' · ')
  }, [evento, nombreDeRama])

  const textoBuscado = busqueda.trim().toLowerCase()

  /*
    El ámbito global es lo que hacía falta: la búsqueda deja de mirar la
    selección de columnas y recorre todo el archivo. Sin texto escrito no
    significa nada, así que no se aplica ni se anuncia.
  */
  const buscandoEnTodo = (ambito === 'todo' || nombreDeLaSeleccion === null) && textoBuscado.length > 0

  const fichasListadas = useMemo(() => {
    const base = buscandoEnTodo
      ? entradas
      : rama === null || rama === TODOS
        ? porEvento
        : porEvento.filter((e) => (eje === 'temas' ? e.ficha.idTema === rama : e.conferencia.id === rama))

    if (textoBuscado.length === 0) {
      return base
    }

    return base.filter(
      (e) =>
        /*
          Se busca en las dos versiones. Quien recuerda la frase tal como se
          dijo la escribe literal; quien recuerda lo que leyó escribe lo
          condensado. Buscar solo en una deja la mitad de las búsquedas sin
          resultado por un motivo que nadie puede adivinar desde fuera.
        */
        e.ficha.fragmento.toLowerCase().includes(textoBuscado) ||
        e.ficha.condensado.toLowerCase().includes(textoBuscado) ||
        e.conferencia.titulo.toLowerCase().includes(textoBuscado) ||
        nombreDeTema(temas, e.ficha.idTema).toLowerCase().includes(textoBuscado),
    )
  }, [entradas, porEvento, rama, eje, textoBuscado, buscandoEnTodo, temas])

  function limpiarBusqueda(): void {
    setBusqueda('')
    setAmbito('seleccion')
  }

  const activa: FichaDelCatalogo | undefined = fichasListadas.find((e) => e.ficha.id === idFicha)
  /*
    Editar una ficha, solo sobre las propias: RLS lo impide en las ajenas, y
    ofrecerlo sería prometer algo que falla. Escuchar, en cambio, también en
    las compartidas: quien aceptó una conferencia puede leer su audio (ver la
    migración `audio_compartido`), y solo las aceptadas enseñan fichas.
  */
  const activaEsPropia =
    activa !== undefined &&
    visibles.find((visible) => visible.conferencia.id === activa.conferencia.id)?.procedencia === 'propia'
  const puedeEscuchar = activa !== undefined && activa.conferencia.fuente === 'audio'

  /* En columnas, la de eventos se aparta al bajar al tercer nivel. En completa se ocultan todas menos la del nivel. */
  const enCompleta = vista === 'completa'
  const nivelActual: 'navegacion' | 'fichas' | 'detalle' =
    activa !== undefined ? 'detalle' : rama !== null || buscandoEnTodo ? 'fichas' : 'navegacion'

  /*
    La miga de pan. En columnas es una comodidad; en vista completa es lo único
    que dice dónde estás, porque las columnas de navegación están escondidas.
    Buscando en todo el archivo, la selección de columnas no describe nada: la
    miga pasa a ser la propia búsqueda.
  */
  type Miga = { clave: string; etiqueta: string; icono: string; onClick?: () => void }
  const migas: Miga[] = []

  if (buscandoEnTodo) {
    migas.push({ clave: 'busqueda', etiqueta: `Resultados de «${busqueda.trim()}»`, icono: 'search' })
  } else if (evento !== TODOS_EVENTOS || rama !== null) {
    migas.push({
      clave: 'evento',
      etiqueta: evento === TODOS_EVENTOS ? 'Todos los eventos' : evento,
      icono: evento === TODOS_EVENTOS ? 'inventory_2' : 'folder',
      onClick: () => {
        setRama(null)
        setIdFicha(null)
      },
    })

    if (rama !== null) {
      migas.push({
        clave: 'rama',
        etiqueta:
          rama === TODOS
            ? eje === 'temas'
              ? 'Todos los temas'
              : 'Todas las conferencias'
            : (nombreDeRama ?? 'Selección'),
        icono: rama === TODOS ? 'inventory_2' : eje === 'temas' ? 'label' : 'mic',
        onClick: () => setIdFicha(null),
      })
    }
  }

  if (activa !== undefined) {
    migas.push({
      clave: 'ficha',
      etiqueta: textoDeFicha(activa.ficha),
      icono: ICONO_DE_FICHA,
    })
  }

  const columnaDeEventos = (
    <Columna ancho={304} colapsada={rama !== null || (enCompleta && nivelActual !== 'navegacion')}>
      {/*
        Con filtros puestos el vacío significa otra cosa que sin ellos: ahí no
        hay nada que cargar, hay algo que quitar. Sin ninguna conferencia en
        absoluto, la columna se queda **muda**: lo que hay que hacer se dice
        una sola vez, a la derecha, y no repetido en cada columna vacía.
      */}
      {eventos.length === 0 && hayConferenciasSinFiltrar ? (
        <p className="px-6 py-4 text-base text-texto-tenue">
          Ninguna conferencia pasa los filtros que pusiste.
        </p>
      ) : null}

      {eventos.length === 0 ? null : (
        <Fila
          icono="inventory_2"
          activa={evento === TODOS_EVENTOS}
          onClick={() => {
            setEvento(TODOS_EVENTOS)
            setIdFicha(null)
          }}
        >
          Todos los eventos
        </Fila>
      )}

      {eventos.map((nombre) => (
        <Fila
          key={nombre}
          icono="folder"
          secundario={`${visibles.filter((v) => v.conferencia.evento === nombre).length} conferencias`}
          activa={evento === nombre}
          onClick={() => {
            setEvento(nombre)
            setIdFicha(null)
          }}
        >
          {nombre}
        </Fila>
      ))}
    </Columna>
  )

  const columnaDeRamas = (
    <Columna
      ancho={304}
      expandida={enCompleta && nivelActual === 'navegacion'}
      colapsada={enCompleta && nivelActual !== 'navegacion'}
      pie={
        rama === null ? undefined : (
          <AccionDeColumna icono="arrow_back" onClick={() => setRama(null)}>
            Volver a los eventos
          </AccionDeColumna>
        )
      }
    >
      {/*
        Los dos ejes del segundo nivel. Cambiar de eje limpia la rama elegida:
        un id de tema no significa nada en la lista de conferencias.
      */}
      <div className="mb-2">
        <Segmentado
          opciones={EJES}
          valor={eje}
          alCambiar={(valor) => {
            setEje(valor)
            setRama(null)
            setIdFicha(null)
          }}
        />
      </div>

      {/*
        Las invitaciones sin contestar, arriba de todo y con su superficie de
        acento: son lo único de la columna que pide una decisión. Hasta
        aceptarla no se ve el contenido —RLS no deja leer sus fichas—, así
        que no entran a la lista como una conferencia más.
      */}
      {eje === 'conferencias' && alResponderInvitacion !== undefined
        ? invitaciones.map((conferencia) => (
            <div key={conferencia.id} className="mb-2 flex flex-col gap-3 rounded-[20px] bg-ilustracion p-4">
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="text-sm font-medium text-ilustracion-texto">Te la compartieron</p>
                <p className="text-base leading-snug text-texto">{conferencia.titulo}</p>
                <p className="truncate text-sm text-texto-tenue">
                  {conferencia.ponente} · {conferencia.evento}
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => alResponderInvitacion(conferencia.id, true)}
                  className="h-9 cursor-pointer rounded-full bg-acento px-4 text-sm font-medium text-acento-contraste"
                >
                  Aceptar
                </button>
                <button
                  type="button"
                  onClick={() => alResponderInvitacion(conferencia.id, false)}
                  className="h-9 cursor-pointer rounded-full px-4 text-sm text-texto-tenue transition-colors hover:text-texto"
                >
                  Rechazar
                </button>
              </div>
            </div>
          ))
        : null}

      <Fila
        icono="inventory_2"
        activa={rama === TODOS}
        onClick={() => {
          setRama(TODOS)
          setIdFicha(null)
        }}
      >
        {eje === 'temas' ? 'Todos los temas' : 'Todas las conferencias'}
      </Fila>

      {eje === 'temas'
        ? temasPresentes.map((t) => (
            <Fila
              key={t.id}
              icono="label"
              secundario={`${porEvento.filter((e) => e.ficha.idTema === t.id).length} fichas`}
              activa={rama === t.id}
              onClick={() => {
                setRama(t.id)
                setIdFicha(null)
              }}
            >
              {t.nombre}
            </Fila>
          ))
        : conferenciasDelEvento.map((v) => {
            const tarea = estadoParaMostrar(v.conferencia, tareas.get(v.conferencia.id))
            const fila = (
              <Fila
                icono="mic"
                secundario={
                  tarea?.fase === 'error'
                    ? `No se pudo analizar · ${tarea.mensaje}`
                    : tarea !== null
                      ? TEXTO_DE_TAREA[tarea.fase].texto
                      : (ESTADO_DEL_ANALISIS[v.conferencia.estado] ??
                        `${porEvento.filter((e) => e.conferencia.id === v.conferencia.id).length} fichas · ${v.conferencia.ponente}`)
                }
                etiquetas={etiquetasDe(v.conferencia.id)}
                cuota={etiquetaDeCuota(
                  v.conferencia.maximoDeFichas,
                  v.conferencia.duracionEnSegundos,
                )}
                {...(tarea?.fase === 'error'
                  ? { icono: 'error' }
                  : tarea !== null
                    ? { icono: TEXTO_DE_TAREA[tarea.fase].icono }
                    : v.conferencia.estado === 'procesada'
                      ? {}
                      : { icono: ICONO_DE_ESTADO[v.conferencia.estado] })}
                trabajando={
                  (tarea !== null && tarea.fase !== 'error') || v.conferencia.estado === 'procesando'
                }
                activa={rama === v.conferencia.id}
                onClick={() => {
                  setRama(v.conferencia.id)
                  setIdFicha(null)
                }}
                /*
                  El clic en la fila sigue entrando a las fichas: es la
                  navegacion del explorador y cambiarla habria costado un paso
                  en el camino mas recorrido. Lo que abre la conferencia es
                  este boton, y va aparte para que las dos cosas se puedan
                  pulsar sin ambiguedad.
                */
                accion={
                  <button
                    type="button"
                    aria-label={`Opciones de «${v.conferencia.titulo}»`}
                    onClick={(evento) => abrirDetalle(v, evento.currentTarget)}
                    className="flex size-8 cursor-pointer items-center justify-center rounded-full text-texto-tenue transition-colors hover:bg-fondo hover:text-texto"
                  >
                    <span aria-hidden="true" className="material-symbols-rounded icono-contorno text-lg">
                      more_horiz
                    </span>
                  </button>
                }
              >
                {v.conferencia.titulo}
              </Fila>
            )

            /* Solo las propias se deslizan: en una ajena el borrado no existe. */
            return v.procedencia === 'propia' && alEliminarConferencia !== undefined ? (
              <FilaDeslizable
                key={v.conferencia.id}
                alBorrar={() => {
                  botonDeBorrado.current = null
                  setIdParaBorrar(v.conferencia.id)
                }}
              >
                {fila}
              </FilaDeslizable>
            ) : (
              <div key={v.conferencia.id}>{fila}</div>
            )
          })}
    </Columna>
  )

  const columnaDeFichas = (
    <Columna
      ancho={368}
      expandida={enCompleta && nivelActual === 'fichas'}
      colapsada={(rama === null && !buscandoEnTodo) || (enCompleta && nivelActual !== 'fichas')}
      pie={
        <>
          {/* Buscando en todo el archivo no hay rama a la que volver: lo que cierra el paso es limpiar. */}
          {buscandoEnTodo ? (
            <AccionDeColumna icono="close" onClick={limpiarBusqueda}>
              Limpiar la búsqueda
            </AccionDeColumna>
          ) : (
            <AccionDeColumna icono="arrow_back" onClick={() => setRama(null)}>
              {eje === 'temas' ? 'Volver a los temas' : 'Volver a las conferencias'}
            </AccionDeColumna>
          )}
        </>
      }
    >
      {fichasListadas.length === 0 ? (
        <div className="flex flex-col items-start gap-3 px-6 py-4">
          <p className="text-base text-texto-tenue">
            {textoBuscado.length === 0
              ? 'No hay fichas en esta selección.'
              : buscandoEnTodo
                ? 'Ninguna ficha del archivo coincide con lo que buscaste.'
                : `Ninguna ficha de ${nombreDeLaSeleccion} coincide.`}
          </p>
          {/* Buscar dentro de lo elegido es lo primero; salir de ahí es un gesto aparte. */}
          {textoBuscado.length > 0 && !buscandoEnTodo ? (
            <button
              type="button"
              onClick={() => setAmbito('todo')}
              className="cursor-pointer rounded-full bg-acento-tenue px-4 py-2 text-sm text-texto transition-colors hover:bg-ilustracion"
            >
              Buscar en todo el archivo
            </button>
          ) : null}
        </div>
      ) : (
        fichasListadas.map((entrada) => (
          <Fila
            key={entrada.ficha.id}
            /* Una ficha corregida a mano se distingue en la lista, sin tener que abrirla. */
            icono={fueEditada(entrada.ficha) ? 'edit_note' : ICONO_DE_FICHA}
            /* Buscando en todo el archivo hace falta saber de dónde sale cada resultado. */
            secundario={
              buscandoEnTodo
                ? `${entrada.conferencia.titulo} · ${nombreDeTema(temas, entrada.ficha.idTema)}`
                : eje === 'temas'
                  ? entrada.conferencia.titulo
                  : entrada.conferencia.tiemposEstimados === true
                    ? nombreDeTema(temas, entrada.ficha.idTema)
                    : `${nombreDeTema(temas, entrada.ficha.idTema)} · ${formatearTimestamp(entrada.ficha.segundoInicio)}`
            }
            activa={entrada.ficha.id === idFicha}
            onClick={() => setIdFicha(entrada.ficha.id)}
          >
            {textoDeFicha(entrada.ficha)}
          </Fila>
        ))
      )}
    </Columna>
  )

  const detalle = (
    <section className="flex min-w-0 flex-1 flex-col rounded-[24px] bg-fondo p-6 shadow-[inset_0_0_0_1px_var(--bitacora-filete)]">
      <div className="sin-barra-de-scroll -mx-2 min-h-0 flex-1 overflow-y-auto px-2">
        {activa === undefined ? (
          <div className="flex h-full items-center justify-center">
            <EstadoVacioIlustrado icono="description" mensaje="Selecciona una ficha para ver lo que dice" />
          </div>
        ) : (
          /*
            El detalle era una ficha técnica: la cita suelta arriba y cinco
            filas de `rótulo: valor` debajo, todas del mismo peso. Eso pone la
            coordenada y el tipo al mismo nivel que lo único que importa, que
            es lo que la persona dijo.

            Ahora lo dice en el orden en que se lee: la cita, quién la dijo y
            en qué minuto, y solo después la clasificación. El contexto deja de
            ser un párrafo tenue que parecía continuación de la cita y pasa a
            estar rotulado y sobre su propia superficie: es lo que rodeaba a la
            frase cuando se dijo, no más frase.
          */
          <article className="flex flex-col gap-6">
            <blockquote className="flex flex-col gap-3">
              {/*
                El contexto envuelve a la cita en vez de vivir en un bloque
                aparte: se lee el párrafo tal como se dijo, con lo citado
                resaltado en medio. Un bloque rotulado obligaba a reconstruir
                mentalmente dónde encajaba la frase; así se ve de un golpe.
              */}
              {/*
                Con condensado se lee el condensado, y sin comillas: no es una
                cita, es la idea escrita para leerse. Ponerle «» seria afirmar
                que alguien dijo exactamente eso, que es precisamente lo que no
                pasa — y es el motivo por el que la literal sigue a un clic en
                vez de haberse perdido.
              */}
              {fueCondensada(activa.ficha) ? (
                <p className="font-titulo text-[22px] leading-snug text-texto">{activa.ficha.condensado}</p>
              ) : (
                <CitaEnContexto contexto={activa.ficha.contextoMinimo} fragmento={activa.ficha.fragmento} />
              )}

              {/*
                Quién lo dijo estaba en los datos y no se enseñaba en ninguna
                parte. En un panel no tiene por qué ser el ponente de la
                charla, y sin este renglón la cita se le atribuía al ponente
                por omisión.
              */}
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base text-texto-tenue">
                <span className="text-texto">{activa.ficha.hablante}</span>
                <span aria-hidden="true">·</span>
                {/*
                  El minuto se escucha: pulsarlo abre la barra con el tramo de
                  audio de esta ficha. Es la prueba más directa de lo que se
                  dijo, más que cualquier transcripción.
                */}
                {puedeEscuchar ? (
                  <button
                    type="button"
                    onClick={() => setAudioAbierto((abierto) => !abierto)}
                    aria-expanded={audioAbierto}
                    className="coordenada flex cursor-pointer items-center gap-1 rounded-full bg-acento-tenue px-2.5 py-0.5 text-texto transition-colors hover:bg-ilustracion"
                  >
                    <span aria-hidden="true" className="material-symbols-rounded icono-relleno text-base">
                      {audioAbierto ? 'close' : 'play_arrow'}
                    </span>
                    {formatearTimestamp(activa.ficha.segundoInicio)}
                  </button>
                ) : activa.conferencia.tiemposEstimados === true ? null : (
                  <span className="coordenada">{formatearTimestamp(activa.ficha.segundoInicio)}</span>
                )}
                {activa.conferencia.tiemposEstimados === true ? null : <span aria-hidden="true">·</span>}
                <span className="min-w-0 truncate">{activa.conferencia.titulo}</span>
              </p>

              {/*
                Abrir y cerrar son el mismo recorrido: la barra despliega su
                alto al aparecer y lo recoge al irse, en vez de desaparecer de
                golpe al pulsar la ✕.
              */}
              <AnimatePresence initial={false}>
                {puedeEscuchar && audioAbierto ? (
                  <motion.div
                    key={activa.ficha.id}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: reducirMovimiento ? 0 : 0.32, ease: [0.37, 0.35, 0, 1] }}
                    className="overflow-hidden"
                  >
                    <FragmentoDeAudio
                      idDueno={activa.conferencia.idDueno}
                      idConferencia={activa.conferencia.id}
                      inicio={activa.ficha.segundoInicio}
                      fin={activa.ficha.segundoFin}
                    />
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </blockquote>

            {/*
              Las pastillas dicen de qué son.

              Antes eran dos palabras sueltas —"Estrategia", "Biotecnología"—
              y no había forma de saber que una era el tipo de unidad y la
              otra el tema: se leían como dos etiquetas cualesquiera del mismo
              rango. El rótulo va dentro de la misma pastilla y en tono tenue,
              para que se siga leyendo primero el valor.
            */}
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1.5 text-sm ${CLASES_DE_PILDORA[COLOR_DE_TIPO[activa.ficha.tipoDeUnidad]]}`}>
                <span className="opacity-70">Tipo · </span>
                {TIPO_EN_SINGULAR[activa.ficha.tipoDeUnidad]}
              </span>
              <span className={`rounded-full px-3 py-1.5 text-sm ${CLASES_DE_PILDORA[colorPorClave(activa.ficha.idTema)]}`}>
                <span className="opacity-70">Tema · </span>
                {nombreDeTema(temas, activa.ficha.idTema)}
              </span>

              {fueEditada(activa.ficha) ? (
                <span className="flex items-center gap-1 rounded-full bg-pildora-ambar px-3 py-1.5 text-sm text-pildora-ambar-texto">
                  <span aria-hidden="true" className="material-symbols-rounded icono-relleno text-base">
                    edit
                  </span>
                  Modificada
                </span>
              ) : null}
            </div>

          </article>
        )}
      </div>

      {activa === undefined ? null : (
        <div className="flex flex-col pt-4">
          {/*
            La transcripción original, en un sitio fijo: el pie del detalle.
            Iba en la fila de pastillas, justo debajo del texto, y como cada
            ficha mide distinto el botón cambiaba de altura de una a otra.
            Aquí está siempre donde se lo dejó. Siempre, en toda ficha: volver
            a lo que se dijo es la promesa del producto, haya o no condensado.
          */}
          <button
            ref={botonDeLiteral}
            type="button"
            onClick={() => {
              setBorrador(textoDeFicha(activa.ficha))
              setLiteralAbierta(true)
            }}
            className="mb-2 flex h-10 w-fit cursor-pointer items-center gap-2 rounded-full bg-acento px-4 text-sm font-medium text-acento-contraste transition-opacity hover:opacity-85"
          >
            <span aria-hidden="true" className="material-symbols-rounded icono-contorno text-lg">
              format_quote
            </span>
            Transcripción original
          </button>

          {/*
            "Ir a la conferencia" no navega fuera: lleva el propio explorador a
            esa charla. Antes salía a otra ruta y se perdía todo el recorrido,
            que es lo que lo hacía sentir roto.
          */}
          <AccionDeColumna
            icono="mic"
            onClick={() => {
              setEvento(activa.conferencia.evento)
              setEje('conferencias')
              setRama(activa.conferencia.id)
              setIdFicha(null)
            }}
          >
            Ver todas las fichas de esta conferencia
          </AccionDeColumna>

          <AccionDeColumna icono="arrow_back" onClick={() => setIdFicha(null)}>
            Volver a las fichas
          </AccionDeColumna>
        </div>
      )}
    </section>
  )

  return (
    <div ref={marco} className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="font-titulo text-[32px] leading-none font-semibold text-texto">Conferencias</h1>

          {/* Buscar, filtrar y cambiar de vista no significan nada sobre un archivo vacío. */}
          <div className="flex flex-wrap items-center gap-3">
            {/*
              Un campo a la vista, como en Memorias. Antes era una pastilla
              que abría un modal con el campo dentro: dos gestos para algo que
              se hace escribiendo, y el texto buscado quedaba escondido.
            */}
            <div className="relative w-72">
              <span
                aria-hidden="true"
                className="material-symbols-rounded icono-contorno pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-lg text-texto-tenue"
              >
                search
              </span>
              <input
                type="search"
                value={busqueda}
                onChange={(cambio) => setBusqueda(cambio.target.value)}
                placeholder="Buscar fichas, conferencias o temas"
                aria-label="Buscar entre las fichas"
                className="block h-10 w-full rounded-full bg-acento-tenue pr-11 pl-11 text-base text-texto transition-colors placeholder:text-texto-tenue focus:outline-none [&::-webkit-search-cancel-button]:hidden"
              />
              {textoBuscado.length === 0 ? null : (
                <button
                  type="button"
                  onClick={limpiarBusqueda}
                  aria-label="Limpiar la búsqueda"
                  className="absolute top-1/2 right-3 flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-texto-tenue transition-colors hover:text-texto"
                >
                  <span aria-hidden="true" className="material-symbols-rounded icono-contorno text-lg">
                    close
                  </span>
                </button>
              )}
            </div>

            {/* El contador dice cuántos filtros hay puestos sin tener que abrirlo. */}
            <button
              ref={botonDeFiltros}
              type="button"
              onClick={() => setFiltrosAbiertos(true)}
              className={`flex h-10 cursor-pointer items-center gap-2 rounded-full px-4 text-base transition-colors ${
                filtrosActivos > 0
                  ? 'bg-acento text-acento-contraste'
                  : 'bg-acento-tenue text-texto-tenue hover:text-texto'
              }`}
            >
              <span aria-hidden="true" className="material-symbols-rounded icono-contorno text-lg">
                filter_list
              </span>
              Filtros
              {filtrosActivos === 0 ? null : (
                <span className="rounded-full bg-acento-contraste px-1.5 text-sm text-acento">{filtrosActivos}</span>
              )}
            </button>

            {/* Compartir vive en la cabecera porque se comparten varias a la vez, no la que estés mirando. */}
            {alCompartir === undefined || archivoVacio ? null : (
              <button
                ref={refDelBotonDeCompartir as RefObject<HTMLButtonElement | null>}
                type="button"
                onClick={alCompartir}
                className="flex h-10 cursor-pointer items-center gap-2 rounded-full bg-acento-tenue px-4 text-base text-texto-tenue transition-colors hover:text-texto"
              >
                <span aria-hidden="true" className="material-symbols-rounded icono-contorno text-lg">
                  ios_share
                </span>
                Compartir
              </button>
            )}

            <SelectorDeVista opciones={VISTAS} valor={vista} alCambiar={setVista} />

            {/* El `span` lleva el ancla: envuelve exactamente la caja del botón. */}
            <span ref={refDelBotonDeCarga} className="inline-flex">
              <BotonPildora variante="primario" icono="upload" onClick={alCargarConferencia}>
                Cargar conferencia
              </BotonPildora>
            </span>
          </div>
        </div>

        {migas.length === 0 ? null : (
          <nav aria-label="Ubicación">
            <ol className="flex flex-wrap items-center gap-1 text-sm">
              {migas.map((miga, indice) => {
                /* La última es dónde estás: se ve, no se pulsa. */
                const esUltima = indice === migas.length - 1
                const contenido = (
                  <>
                    <span aria-hidden="true" className="material-symbols-rounded icono-relleno shrink-0 text-base">
                      {miga.icono}
                    </span>
                    <span className="max-w-70 truncate">{miga.etiqueta}</span>
                  </>
                )

                return (
                  <li key={miga.clave} className="flex min-w-0 items-center gap-1">
                    {indice === 0 ? null : (
                      <span
                        aria-hidden="true"
                        className="material-symbols-rounded icono-contorno shrink-0 text-base text-texto-tenue"
                      >
                        chevron_right
                      </span>
                    )}

                    {esUltima ? (
                      <span aria-current="page" className="flex min-w-0 items-center gap-1.5 px-2 py-1 text-texto">
                        {contenido}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={miga.onClick}
                        className="flex min-w-0 cursor-pointer items-center gap-1.5 rounded-full px-2 py-1 text-texto-tenue transition-colors hover:bg-acento-tenue hover:text-texto"
                      >
                        {contenido}
                      </button>
                    )}
                  </li>
                )
              })}
            </ol>
          </nav>
        )}
      </div>

      {cargando ? (
        <Esqueleto filas={4} etiqueta="Cargando el archivo" variante="columnas" />
      ) : error !== null ? (
        <PanelDeError mensaje={error} />
      ) : /*
        Archivo vacío: las dos columnas de navegación se quedan puestas pero
        mudas, y lo único que habla es el panel de la derecha. Antes cada
        columna repetía su propio "no hay nada", que era decir tres veces lo
        mismo y dar a entender que se podía navegar por algo que no existe.
        Sin conferencias no hay eventos, ni temas, ni fichas: no hay recorrido.
      */
      archivoVacio ? (
        <div className="flex min-h-0 flex-1 gap-2">
          <Columna ancho={304}>{null}</Columna>
          <Columna ancho={304}>{null}</Columna>
          <section className="flex min-w-0 flex-1 flex-col items-center justify-center rounded-[24px] bg-fondo p-6 shadow-[inset_0_0_0_1px_var(--bitacora-filete)]">
            <EstadoVacioIlustrado icono="upload_file" mensaje="Crea una conferencia para ver lo que dice" />
          </section>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-2">
          {columnaDeEventos}
          {columnaDeRamas}
          {columnaDeFichas}
          {enCompleta && nivelActual !== 'detalle' ? null : detalle}
        </div>
      )}

      {/*
        Los filtros acotan qué conferencias entran al explorador entero: los
        eventos, las conferencias, los temas y las fichas salen todos de lo
        que sobrevive a esto.
      */}
      <Modal
        abierto={filtrosAbiertos}
        alCerrar={() => setFiltrosAbiertos(false)}
        titulo="Filtros y orden"
        anclaje="disparador"
        anclaEn={botonDeFiltros}
        /*
          Ancho y no angosto: con 440px cada grupo de pastillas se partía en
          dos o tres renglones y el panel entero se salía por abajo.
        */
        ancho="normal"
        limites={marco}
      >
        {/*
          Pastillas de elección de la referencia: la elegida crece y empuja a
          sus vecinas (ver `EleccionEnPastillas`). Antes eran segmentados con
          una pieza que se deslizaba y pastillas sueltas de otro estilo.
        */}
        <EleccionEnPastillas
          etiqueta="Procedencia"
          opciones={PROCEDENCIAS}
          valor={criterios.segmento}
          alCambiar={(segmento) => alCambiarCriterios({ segmento })}
        />

        <EleccionEnPastillas
          etiqueta="Estado"
          opciones={ESTADOS}
          valor={criterios.estado}
          alCambiar={(estado) => alCambiarCriterios({ estado })}
        />

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium text-texto-tenue">Etiquetas</legend>
          <SelectorDeEtiquetas
            etiquetas={etiquetas}
            marcadas={criterios.etiquetas}
            alAlternar={alAlternarEtiquetaDelFiltro}
            alCrear={alCrearEtiqueta}
            {...(alEliminarEtiqueta === undefined ? {} : { alEliminar: alEliminarEtiqueta })}
            vacio="Todavía no tienes etiquetas. Crea una para agrupar conferencias a tu manera."
          />
        </fieldset>

        <EleccionEnPastillas
          etiqueta="Ordenar eventos"
          opciones={ORDENES_DE_EVENTOS}
          valor={criterios.ordenDeEventos}
          alCambiar={(ordenDeEventos) => alCambiarCriterios({ ordenDeEventos })}
        />

        <EleccionEnPastillas
          etiqueta="Ordenar conferencias"
          opciones={ORDENES_DE_CONFERENCIAS}
          valor={criterios.orden}
          alCambiar={(orden) => alCambiarCriterios({ orden })}
        />

        <EleccionEnPastillas
          etiqueta="Ordenar fichas"
          opciones={ORDENES_DE_FICHAS}
          valor={criterios.ordenDeFichas}
          alCambiar={(ordenDeFichas) => alCambiarCriterios({ ordenDeFichas })}
        />

        {/* Quitar los filtros deja el orden como está: ordenar no es filtrar, y perderlo al limpiar sorprendería. */}
        {filtrosActivos === 0 ? null : (
          <button
            type="button"
            onClick={() =>
              alCambiarCriterios({
                segmento: CRITERIOS_POR_DEFECTO.segmento,
                estado: CRITERIOS_POR_DEFECTO.estado,
                etiquetas: CRITERIOS_POR_DEFECTO.etiquetas,
              })
            }
            className="h-10 cursor-pointer rounded-full bg-acento-tenue text-base text-texto transition-colors hover:bg-acento hover:text-acento-contraste"
          >
            Quitar los filtros
          </button>
        )}
      </Modal>

      {/*
        La conferencia entera en un modal central: sus datos y lo que se le
        puede hacer, en el mismo sitio.

        Antes estaban repartidos en dos pasos anclados —"Opciones" y dentro de
        el "Corregir los datos"— colgando de un boton en el pie de la columna
        de fichas. Eso ponia la conferencia a dos clics de donde se la ve, y
        el pie de una columna es el peor sitio para editarla: no es donde esta
        la conferencia, es donde estan sus fichas.

        El evento no se edita aqui: cambiarlo moveria la charla de carpeta, que
        es una reorganizacion del archivo y no una correccion de datos.
      */}
      <Modal
        abierto={idEnDetalle !== null}
        alCerrar={() => setIdEnDetalle(null)}
        titulo="Conferencia"
        ancho="angosto"
        anclaEn={botonDeDetalle}
        limites={marco}
      >
        {conferenciaEnDetalle === undefined ? null : (
          <>
            <div className="flex flex-col gap-3">
              <input
                value={edicion.titulo}
                onChange={(cambio) => setEdicion((a) => ({ ...a, titulo: cambio.target.value }))}
                aria-label="Título de la conferencia"
                placeholder="Título"
                className={CAMPO_DE_TEXTO}
              />
              <SelectorDePonente
                evento={conferenciaEnDetalle.conferencia.evento}
                ponente={edicion.ponente}
                eventos={eventosDelDirectorio}
                ponentes={ponentesDelDirectorio}
                crearPonente={crearPonente}
                eliminarPonente={eliminarPonente}
                alCambiar={(ponente) => setEdicion((a) => ({ ...a, ponente }))}
              />
              <SelectorDeFecha
                etiquetaAccesible="Fecha del evento"
                vacio="Fecha del evento"
                valor={edicion.fechaDelEvento === '' ? null : edicion.fechaDelEvento}
                /* Hasta hoy, igual que al cargarla: ver `ModalDeCarga`. */
                maximo={hoyEnIso()}
                alElegir={(iso) => setEdicion((a) => ({ ...a, fechaDelEvento: iso }))}
              />

              {/*
                La descripcion es de quien la subio, no del analisis.

                `resumen` lo escribe el modelo y lo reescribe en cada analisis,
                asi que no se puede escribir ahi nada que deba sobrevivir. Esto
                es para lo que el analisis no puede saber: por que esta charla
                importa o para que articulo se guardo.
              */}
              <textarea
                value={edicion.descripcion}
                onChange={(cambio) => setEdicion((a) => ({ ...a, descripcion: cambio.target.value }))}
                aria-label="Descripción"
                placeholder="Descripción · opcional"
                rows={3}
                className={`${CAMPO_DE_TEXTO} h-auto resize-none py-3 leading-relaxed`}
              />
            </div>

            <button
              type="button"
              disabled={edicion.titulo.trim() === '' || edicion.ponente.trim() === ''}
              onClick={() => {
                alRenombrarConferencia?.(conferenciaEnDetalle.conferencia.id, edicion)
                setIdEnDetalle(null)
              }}
              className="h-12 cursor-pointer rounded-full bg-acento text-base font-medium text-acento-contraste transition-opacity disabled:cursor-default disabled:opacity-40"
            >
              Guardar
            </button>

            {/*
              Las fuentes que la charla cita, con su evidencia. Viven en el
              detalle de la conferencia y no en cada ficha porque son de la
              charla entera: la misma fuente se nombra en varios momentos, y
              quien arma una bibliografía las quiere juntas.
            */}
            {alBuscarReferencias === undefined ? null : (
              <FuentesCitadas
                referencias={conferenciaEnDetalle.conferencia.referencias ?? []}
                buscando={buscandoReferencias}
                error={errorDeReferencias}
                alBuscar={() => {
                  setBuscandoReferencias(true)
                  setErrorDeReferencias(null)
                  void alBuscarReferencias(conferenciaEnDetalle.conferencia.id).then((fallo) => {
                    setBuscandoReferencias(false)
                    setErrorDeReferencias(fallo)
                  })
                }}
              />
            )}

            <div className="mt-2 flex flex-col border-t border-filete pt-2">
              {alAnalizar !== undefined &&
              sePuedeAnalizar(
                conferenciaEnDetalle.conferencia.estado,
                estadoParaMostrar(conferenciaEnDetalle.conferencia, tareas.get(conferenciaEnDetalle.conferencia.id)),
              ) ? (
                <AccionDeColumna
                  icono="auto_awesome"
                  onClick={() => {
                    alAnalizar(conferenciaEnDetalle.conferencia.id)
                    setIdEnDetalle(null)
                  }}
                >
                  {conferenciaEnDetalle.conferencia.estado === 'fallida'
                    ? 'Reintentar el analisis'
                    : 'Analizar ahora'}
                </AccionDeColumna>
              ) : null}

              {/*
                Las etiquetas salen en un panel sobre el modal, no en otro
                modal que lo sustituya.

                Antes esto cerraba el detalle y abría un segundo modal: se
                perdía de vista la conferencia que se estaba editando, y como
                el botón que lo pidió acababa de desmontarse, el panel no tenía
                a qué anclarse y aparecía suelto a media pantalla. Un `Popover`
                se queda colgado de su propio botón —que sigue ahí— y se dibuja
                por encima (z 60 contra el 50 del modal), así que poner una
                etiqueta ya no cuesta salir de donde estabas.
              */}
              <Popover
                alinear="izquierda"
                etiquetaAccesible="Etiquetas de la conferencia"
                claseDelBoton={`${FILA} text-texto transition-colors hover:bg-acento-tenue`}
                claseDelPanel="w-[22rem] max-w-[90vw] p-3"
                boton={
                  <>
                    <span
                      aria-hidden="true"
                      className="material-symbols-rounded icono-contorno shrink-0 text-xl"
                    >
                      label
                    </span>
                    Etiquetas
                    {etiquetasPropiasDelDetalle.length === 0 ? null : (
                      <span className="ml-auto rounded-full bg-acento px-2 text-sm text-acento-contraste">
                        {etiquetasPropiasDelDetalle.length}
                      </span>
                    )}
                  </>
                }
              >
                {() => (
                  <SelectorDeEtiquetas
                    etiquetas={etiquetas}
                    marcadas={etiquetasPropiasDelDetalle}
                    alAlternar={(idEtiqueta) =>
                      alAlternarAsignacion(idEtiqueta, conferenciaEnDetalle.conferencia.id)
                    }
                    alCrear={alCrearEtiqueta}
                    {...(alEliminarEtiqueta === undefined ? {} : { alEliminar: alEliminarEtiqueta })}
                    vacio="Todavía no tienes etiquetas. Crea la primera aquí abajo."
                  />
                )}
              </Popover>

              {alEliminarConferencia === undefined ||
              conferenciaEnDetalle.procedencia !== 'propia' ? null : (
                /*
                  La confirmación cuelga del propio botón, sobre el modal, igual
                  que las etiquetas. Antes el detalle se cerraba al pulsar y la
                  confirmación salía centrada, lejos de donde se había pedido:
                  el botón ya no existía y no había a qué anclarla.
                */
                <Popover
                  alinear="izquierda"
                  etiquetaAccesible="Borrar la conferencia"
                  claseDelBoton={`${FILA} text-error transition-colors hover:bg-acento-tenue`}
                  claseDelPanel="w-[22rem] max-w-[90vw] p-5"
                  boton={
                    <>
                      <span aria-hidden="true" className="material-symbols-rounded icono-contorno shrink-0 text-xl">
                        delete
                      </span>
                      Borrar la conferencia
                    </>
                  }
                >
                  {(cerrar) => (
                    <div className="flex flex-col gap-4">
                      <ul className="flex flex-col gap-2 text-sm leading-relaxed text-texto-tenue">
                        <li>
                          Se pierden sus{' '}
                          {porEvento.filter((e) => e.conferencia.id === conferenciaEnDetalle.conferencia.id).length}{' '}
                          fichas.
                        </li>
                        <li>Se borra el audio o la transcripción que subiste.</li>
                        <li>Quien la tuviera compartida deja de verla.</li>
                      </ul>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          autoFocus
                          onClick={cerrar}
                          className="h-10 cursor-pointer rounded-full px-4 text-sm text-texto transition-colors hover:bg-acento-tenue"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const id = conferenciaEnDetalle.conferencia.id
                            cerrar()
                            setIdEnDetalle(null)
                            alEliminarConferencia(id)
                            if (id === rama) {
                              setRama(null)
                              setIdFicha(null)
                            }
                          }}
                          className="h-10 cursor-pointer rounded-full bg-error px-4 text-sm font-medium text-acento-contraste"
                        >
                          Borrar
                        </button>
                      </div>
                    </div>
                  )}
                </Popover>
              )}
            </div>
          </>
        )}
      </Modal>

      {/*
        Apunta a `idParaBorrar` y no a la rama activa: ahora se puede pedir el
        borrado desde el modal de la conferencia o deslizando su fila, y en el
        segundo caso puede no ser la que esta abierta en las columnas.
      */}
      <ModalDeConfirmacion
        abierto={idParaBorrar !== null}
        alCerrar={() => setIdParaBorrar(null)}
        titulo="Borrar la conferencia"
        accion="Borrar"
        anclaEn={botonDeBorrado}
        limites={marco}
        consecuencias={[
          `Se pierden sus ${porEvento.filter((e) => e.conferencia.id === idParaBorrarMostrado).length} fichas y habría que volver a analizarla desde cero.`,
          'Se borra el audio o la transcripción que subiste.',
          'Quien la tuviera compartida deja de verla.',
        ]}
        alConfirmar={() => {
          if (idParaBorrar !== null) {
            alEliminarConferencia?.(idParaBorrar)

            /* Solo se sale de la rama si lo borrado era justo lo que se estaba mirando. */
            if (idParaBorrar === rama) {
              setRama(null)
              setIdFicha(null)
            }
          }

          setIdParaBorrar(null)
        }}
      >
        <p className="text-base text-texto">
          «{conferenciaParaBorrar?.conferencia.titulo ?? ''}»
        </p>
      </ModalDeConfirmacion>

      {/*
        La transcripción original frente a lo que se lee, en un modal centrado
        que crece desde su botón. Se llamaba "Cómo se dijo", y no decía que ahí
        estaba el texto de la transcripción.

        Tres versiones, en el orden en que se revisan: lo que se dijo
        (intocable, con su contexto alrededor), lo que condensó el análisis, y
        la versión escrita a mano. La tercera es la única que se edita, y
        convive con las otras dos en vez de pisarlas: el día que alguien quiera
        saber qué se dijo o qué entendió el análisis, sigue ahí.
      */}
      <Modal
        abierto={literalAbierta}
        alCerrar={() => setLiteralAbierta(false)}
        titulo="Transcripción original"
        /* Ancho, no angosto: son textos que se comparan. */
        ancho="normal"
        anclaEn={botonDeLiteral}
        limites={marco}
      >
        {activa === undefined ? null : (
          <div className="flex flex-col gap-5">
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium text-texto-tenue">Tal como se dijo</h3>
              <div className="rounded-[20px] bg-acento-tenue p-4">
                <CitaEnContexto contexto={activa.ficha.contextoMinimo} fragmento={activa.ficha.fragmento} />
              </div>
            </section>

            {fueCondensada(activa.ficha) ? (
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-medium text-texto-tenue">Condensada por el análisis</h3>
                <div className="rounded-[20px] bg-acento-tenue p-4">
                  <p className="text-[19px] leading-relaxed text-texto">{activa.ficha.condensado}</p>
                </div>
              </section>
            ) : null}

            {/*
              Borrar la ficha se confirma sobre el propio botón, como las
              etiquetas y como los eventos: el mismo gesto en toda la app.
              No hay papelera porque el análisis es reproducible —volver a
              analizar la conferencia devuelve todas sus fichas—, y eso se
              dice aquí en vez de guardarlas en un cajón que nadie abre.
            */}
            {activaEsPropia && alEliminarFicha !== undefined ? (
              <div className="flex items-center gap-3">
                {fichaPorBorrar === activa.ficha.id ? (
                  <ConfirmacionEnSitio
                    nombre="esta ficha"
                    alCancelar={() => setFichaPorBorrar(null)}
                    alConfirmar={() => {
                      setFichaPorBorrar(null)
                      setIdFicha(null)
                      alEliminarFicha(activa.ficha.id)
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setFichaPorBorrar(activa.ficha.id)}
                    className="flex h-9 cursor-pointer items-center gap-2 rounded-full px-3 text-sm text-texto-tenue transition-colors hover:bg-acento-tenue hover:text-error"
                  >
                    <span aria-hidden="true" className="material-symbols-rounded icono-contorno text-lg">
                      delete
                    </span>
                    Borrar la ficha
                  </button>
                )}
              </div>
            ) : null}

            {activaEsPropia && alEditarFicha !== undefined ? (
              <section className="flex flex-col gap-2">
                <h3 className="flex items-center gap-2 text-sm font-medium text-texto-tenue">
                  Tu versión
                  {fueEditada(activa.ficha) ? (
                    <span className="rounded-full bg-pildora-ambar px-2 py-0.5 text-xs text-pildora-ambar-texto">
                      Modificada
                    </span>
                  ) : null}
                </h3>
                <textarea
                  value={borrador}
                  onChange={(evento) => setBorrador(evento.target.value)}
                  rows={4}
                  aria-label="Tu versión de la ficha"
                  className="w-full resize-none rounded-[20px] bg-acento-tenue p-4 text-[19px] leading-relaxed text-texto focus:outline-2 focus:outline-offset-2 focus:outline-acento"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={guardandoEdicion || borrador.trim() === '' || borrador.trim() === textoDeFicha(activa.ficha)}
                    onClick={() => {
                      setGuardandoEdicion(true)
                      void alEditarFicha(activa.ficha.id, borrador).then(() => setGuardandoEdicion(false))
                    }}
                    className="h-10 cursor-pointer rounded-full bg-acento px-4 text-sm font-medium text-acento-contraste transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Guardar mi versión
                  </button>
                  {/* Quitarla no borra nada más: la ficha vuelve a leerse como la dejó el análisis. */}
                  {fueEditada(activa.ficha) ? (
                    <button
                      type="button"
                      disabled={guardandoEdicion}
                      onClick={() => {
                        setGuardandoEdicion(true)
                        void alEditarFicha(activa.ficha.id, '').then(() => {
                          setGuardandoEdicion(false)
                          setBorrador(activa.ficha.condensado === '' ? activa.ficha.fragmento : activa.ficha.condensado)
                        })
                      }}
                      className="h-10 cursor-pointer rounded-full px-4 text-sm text-texto-tenue transition-colors hover:text-texto"
                    >
                      Volver a la del análisis
                    </button>
                  ) : null}
                </div>
              </section>
            ) : fueEditada(activa.ficha) ? (
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-medium text-texto-tenue">Versión de quien la subió</h3>
                <div className="rounded-[20px] bg-acento-tenue p-4">
                  <p className="text-[19px] leading-relaxed text-texto">{activa.ficha.editado}</p>
                </div>
              </section>
            ) : null}
          </div>
        )}
      </Modal>
    </div>
  )
}

/*
  Las fuentes que cita una charla, tal como se copiarían a una bibliografía.

  Cada una dice de dónde salió —la dijo el ponente, estaba en una diapositiva,
  o la propuso la IA— y guarda la evidencia: el trozo donde aparece. Sin eso
  una bibliografía generada no se puede comprobar, y comprobarla es justo lo
  que hace que se pueda usar.
*/
const ORIGEN_DE_LA_FUENTE: Record<ReferenciaDeConferencia['origen'], { etiqueta: string; color: ColorDePildora }> = {
  dicha: { etiqueta: 'La dijo', color: 'verde' },
  diapositiva: { etiqueta: 'En diapositiva', color: 'azul' },
  inferida: { etiqueta: 'Inferida', color: 'ambar' },
}

/* Una fila escrita a mano en la base podría traer otro origen: cae en `dicha`. */
function comoSeEncontro(origen: ReferenciaDeConferencia['origen']) {
  return ORIGEN_DE_LA_FUENTE[origen] ?? ORIGEN_DE_LA_FUENTE.dicha
}

function FuentesCitadas({
  referencias,
  buscando,
  error,
  alBuscar,
}: {
  referencias: readonly ReferenciaDeConferencia[]
  buscando: boolean
  error: string | null
  alBuscar: () => void
}): ReactElement {
  return (
    <div className="mt-2 flex flex-col gap-3 border-t border-filete pt-4">
      <div className="flex items-center justify-between gap-3 px-2">
        <p className="text-sm font-medium text-texto-tenue">Fuentes que cita</p>
        <button
          type="button"
          disabled={buscando}
          onClick={alBuscar}
          className="h-8 cursor-pointer rounded-full bg-acento-tenue px-3 text-xs text-texto transition-colors hover:bg-ilustracion disabled:cursor-default disabled:opacity-60"
        >
          {buscando ? 'Buscando…' : referencias.length === 0 ? 'Buscar' : 'Buscar otra vez'}
        </button>
      </div>

      {error === null ? null : (
        <p role="alert" className="px-2 text-sm text-error">
          {error}
        </p>
      )}

      {referencias.length === 0 ? (
        <p className="px-2 text-sm leading-relaxed text-texto-tenue">
          {buscando
            ? 'Leyendo la transcripción y las diapositivas…'
            : 'Se buscan en lo que se dijo y en el material de apoyo, con el trozo donde aparece cada una.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {referencias.map((referencia) => (
            <li key={referencia.cita} className="flex flex-col gap-1.5 rounded-[20px] bg-fondo px-4 py-3">
              <p className="text-sm leading-relaxed text-texto">{referencia.cita}</p>

              <div className="flex items-center gap-2">
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${CLASES_DE_PILDORA[comoSeEncontro(referencia.origen).color]}`}
                >
                  {comoSeEncontro(referencia.origen).etiqueta}
                </span>

                <button
                  type="button"
                  onClick={() => void navigator.clipboard?.writeText(referencia.cita)}
                  className="cursor-pointer rounded-full px-2 py-0.5 text-xs text-texto-tenue transition-colors hover:bg-acento-tenue hover:text-texto"
                >
                  Copiar
                </button>
              </div>

              {/* La evidencia, para comprobarla sin volver a la grabación. */}
              <p className="text-xs leading-relaxed text-texto-tenue">«{referencia.evidencia}»</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
