import type { ReactElement, RefObject } from 'react'
import { Link, useLocation } from 'react-router'
import { useSession } from '@/features/auth/session'
import { MenuDeCuenta } from './MenuDeCuenta'
import { CampanaDeAvisos } from './CampanaDeAvisos'
import { ACCIONES_DE_NAVEGACION, SECCIONES_DE_NAVEGACION, esSeccionActiva } from './navegacion'

type PropiedadesBarraLateral = {
  /** Identificador que el botón del cajón referencia con aria-controls. */
  id: string
  /** Solo aplica bajo 768px: sobre ese ancho el dock está siempre visible. */
  abierta: boolean
  /** Se invoca al elegir una sección, para cerrar el cajón en pantallas angostas. */
  alNavegar: () => void
  /** El shell lo enfoca al abrir el cajón y recorre lo enfocable de dentro. */
  refDelCajon: RefObject<HTMLElement | null>
  /** Solo en escritorio: el dock plegado se va del todo y deja el ancho al contenido. */
  plegada: boolean
  alPlegar: () => void
}

/*
  Dock de Menti Vault.

  Es tipografía y nada más: sin iconos, sin pastillas, sin color. El ítem
  activo no se marca con un fondo — crece de 24 a 28px y sube de peso, y el
  `line-height` se queda clavado en 24px para que la fila siga midiendo 40px
  y la columna no salte al cambiar de sección. Todo el movimiento vive en
  `.item-de-dock` (`styles/index.css`).

  Dos bloques: a dónde ir, y qué hacer. El chat vive en el segundo junto a
  las acciones de crear, porque no es un destino sino algo que se hace sobre
  todo lo demás; tenerlo entre las secciones lo hacía parecer una pantalla
  más a la que se navega.
*/

/*
  36px de alto, 8px de padding, line-height clavado en 24px.

  Más pequeño que el de la referencia (40px de fila, 24 → 28px de letra, 280
  de ancho): a ese tamaño el dock se comía la pantalla y saturaba. Se bajó
  todo en la misma proporción —fila 36, letra 20 → 24, ancho 240— para que
  la jerarquía siga siendo la misma, solo que más callada.
*/
const FILA = 'item-de-dock flex h-9 w-full items-center px-2 text-left leading-6'

function clasesDeItem(activo: boolean): string {
  return activo
    ? `${FILA} text-2xl font-semibold text-nav-activo`
    : `${FILA} text-xl font-normal text-nav-tenue`
}

export function BarraLateral({
  id,
  abierta,
  alNavegar,
  refDelCajon,
  plegada,
  alPlegar,
}: PropiedadesBarraLateral): ReactElement {
  const visibilidad = abierta ? 'flex' : 'hidden md:flex'
  const ubicacion = useLocation()
  const { usuario, cerrarSesion } = useSession()

  return (
    <nav
      ref={refDelCajon}
      id={id}
      /* Enfocable por programa, nunca por tabulación: recibe el foco al abrir el cajón. */
      tabIndex={-1}
      aria-label="Secciones de Menti Vault"
      /* El filete de la derecha separa el dock del contenido sin pesar: es el mismo `filete` del sistema. */
      /*
        Plegado va a ancho cero, no a un carril estrecho: este dock es
        tipografía y nada más, así que no tiene iconos a los que encogerse.
        Reducirlo dejaría una columna de palabras cortadas; quitarlo entero
        le da la pantalla al contenido, que es de lo que se trataba.

        `overflow-hidden` mientras se cierra para que el contenido se recorte
        en vez de re-partirse línea a línea durante la transición.

        Abierto, `overflow-x-hidden` va explícito y no es redundante. Con solo
        `overflow-y-auto`, el navegador pone también el eje X en `auto` —un eje
        no puede quedar `visible` si el otro no lo es—. Y los ítems crecen a
        `scale(1.2)` al pasar el cursor, con origen a la izquierda: su caja es
        de ancho completo (247px desde x=16), así que al 120% acababa en x≈312
        con el dock terminando en 280, y aparecía una barra de desplazamiento
        abajo cada vez que se tocaba el menú. Medido: lo que desborda es la
        caja, no las letras — el texto agrandado más largo, "Cargar
        conferencia", llega justo a 280. Recortar el eje X no esconde nada que
        se lea.
      */
      style={{ width: plegada ? 0 : undefined }}
      className={`${visibilidad} dock-de-menti dock-entra fixed inset-y-0 left-0 z-30 w-60 shrink-0 flex-col border-r border-filete bg-fondo transition-[width] duration-500 ease-(--ease-entrada) focus:outline-none md:sticky md:z-auto md:h-dvh ${
        plegada ? 'overflow-hidden border-transparent' : 'overflow-x-hidden overflow-y-auto'
      }`}
    >
      {/*
        `min-width` y no `width`: al plegarse el dock va a ancho cero, y sin un
        minimo el contenido se re-partiria linea a linea durante la transicion
        en vez de recortarse. Se fija como minimo y no como ancho exacto porque
        el ancho exacto tampoco descontaba el filete de 1px del borde derecho,
        y ese pixel de mas sacaba una barra de scroll horizontal en el dock.

        El relleno vive aquí y no en el dock. Estaba en el dock y pasaba de
        16px a 0 de golpe al plegarlo —solo el ancho se animaba—, así que todo
        el contenido saltaba 16px arriba y a la izquierda en el primer cuadro
        y después se recortaba: se veía como si el dock se truncara y subiera.
        Aquí dentro, con el ancho fijo, el contenido se queda quieto mientras
        el dock se cierra sobre él.
      */}
      <div className="flex w-full min-w-[calc(15rem-1px)] flex-1 flex-col p-4">
        {/*
        La cuenta vive aquí, no en una barra superior. Esa barra solo repetía
        el nombre de la sección —que el dock y el título de la pantalla ya
        decían— para sostener un par de controles.

        La campana volvió, pero solo con lo que pide una respuesta: las
        conferencias que te compartieron y lo que contestaron a las tuyas.
      */}
        {/*
          Los iconos van en su propio renglon, encima de la cuenta.

          Compartiendo fila con ella le dejaban unos 104px al nombre y lo
          cortaban en "Sebastia...", teniendo el dock 280px. Arriba ocupan una
          franja que igual estaba vacia y la cuenta se queda con todo el ancho.
        */}
        {/*
          Arriba, el logo de la app: abre el menú de la cuenta (Configuración,
          tema, cerrar sesión). Sustituye a la tarjeta con avatar, nombre y
          correo, que ocupaba medio dock para decir quién eres, algo que no
          hace falta leer cada vez. La tarjeta sigue en `MenuDeCuenta`.
        */}
        <div className="flex h-10 items-center gap-0.5">
          {usuario === null ? null : (
            <div data-recorrido="cuenta" className="min-w-0 flex-1">
              <MenuDeCuenta usuario={usuario} cerrarSesion={cerrarSesion} disparador="logo" />
            </div>
          )}

          {/* La campana en el mismo renglón que el logo: sola en uno aparte se veía suelta. */}
          {usuario === null ? null : (
            <div data-recorrido="avisos" className="shrink-0">
              <CampanaDeAvisos idUsuario={usuario.id} />
            </div>
          )}
        </div>


        {/*
        Sin el nombre del producto: el avatar ya ancla la identidad arriba, y
        repetir la marca en cada pantalla no orienta a nadie que ya está
        dentro. La referencia tampoco lo pone.
      */}
        <div className="mt-3 flex flex-col">
          {SECCIONES_DE_NAVEGACION.map((seccion) => (
            <Link
              key={seccion.ruta}
              to={seccion.ruta}
              data-recorrido={seccion.ruta.slice(1)}
              onClick={alNavegar}
              aria-current={esSeccionActiva(seccion, ubicacion.pathname) ? 'page' : undefined}
              className={clasesDeItem(esSeccionActiva(seccion, ubicacion.pathname))}
            >
              {seccion.etiqueta}
            </Link>
          ))}
        </div>

        <p className="mt-5 flex h-9 items-center px-2 text-sm leading-6 text-nav-tenue">
          Acciones
        </p>

        <div className="flex flex-col">
          {ACCIONES_DE_NAVEGACION.map((accion) => (
            <Link
              key={accion.ruta}
              to={accion.ruta}
              data-recorrido={`accion-${accion.etiqueta.toLowerCase().replaceAll(' ', '-')}`}
              onClick={alNavegar}
              className={`${FILA} text-xl font-normal text-nav-tenue`}
            >
              {accion.etiqueta}
            </Link>
          ))}

          {/*
            El chat, bloqueado: se ve dónde va a estar, pero no se abre. El
            panel que decía "en camino" se quitó; un clic que solo lleva a
            un aviso de que no hay nada es peor que no poder hacer clic.
          */}
          <button
            type="button"
            disabled
            aria-disabled="true"
            className="flex h-9 w-full cursor-not-allowed items-center gap-2 px-2 text-left text-xl leading-6 text-nav-tenue opacity-40"
          >
            Chat
            <span aria-hidden="true" className="material-symbols-rounded icono-contorno text-base">
              lock
            </span>
          </button>
        </div>

        {/*
          Plegar vive abajo, al pie del dock, y no en el renglón del logo: ahí
          le quitaba el sitio al nombre, que se cortaba en "Menti Va…". Al pie
          no compite con nada, y es donde se busca un control que no es de
          navegar.
        */}
        <div className="mt-auto hidden pt-4 md:flex">
          <button
            type="button"
            onClick={alPlegar}
            aria-label="Ocultar el panel lateral"
            className="flex h-9 cursor-pointer items-center gap-2 rounded-full px-2.5 text-sm text-texto-tenue transition-colors hover:bg-acento-tenue hover:text-texto"
          >
            <span aria-hidden="true" className="material-symbols-rounded icono-contorno text-xl">
              left_panel_close
            </span>
            Ocultar
          </button>
        </div>
      </div>
    </nav>
  )
}
