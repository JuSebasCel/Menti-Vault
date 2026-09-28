import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useId, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { Link } from 'react-router'
import type { UsuarioSesion } from '@/features/auth/session'
import { useApiKey } from '@/features/configuracion/useApiKey'
import { useTema, type Tema } from '@/shared/tema'
import { Modal } from '@/shared/ui'
import { MarcaDeMenti } from '@/shared/ui/Logo'
import { inicialesDe } from './inicialesDe'

const OPCIONES_DE_TEMA: ReadonlyArray<{ valor: Tema; etiqueta: string; icono: string }> = [
  { valor: 'claro', etiqueta: 'Claro', icono: 'light_mode' },
  { valor: 'oscuro', etiqueta: 'Oscuro', icono: 'dark_mode' },
  { valor: 'sistema', etiqueta: 'Sistema', icono: 'desktop_windows' },
]

const FILA =
  'flex h-12 w-full cursor-pointer items-center gap-3 rounded-2xl px-3 text-base transition-colors hover:bg-acento-tenue'

/*
  El menú de la cuenta, en el modal del sistema anclado a la tarjeta: crece
  desde ella, igual que la campana crece desde su botón. Antes era el
  popover suelto del diseño anterior, con filetes entre filas, iconos de
  otra familia y el tema en botones de 11 px.

  Lleva lo que se hace con la cuenta y nada más: el aviso de la clave si
  falta, el tema, Configuración y cerrar sesión. El nombre y el correo no se
  repiten dentro: ya están en la tarjeta que lo abre.

  Tiene dos disparadores. La `tarjeta` con avatar, nombre y correo es el que
  tuvo el dock hasta ahora; el `logo` es el actual, más pequeño, que deja el
  dock para navegar. Con el logo, el nombre y el correo sí van dentro del
  menú, porque ya no hay tarjeta que los diga. La tarjeta se conserva para
  volver a ella si hace falta.

  Perfil y Apariencia aparecen deshabilitados: son pantallas que vienen, y
  dejarlas a la vista (en gris, sin reaccionar) dice dónde van a estar sin
  prometer una fecha.
*/
export function MenuDeCuenta({
  usuario,
  cerrarSesion,
  disparador = 'tarjeta',
}: {
  usuario: UsuarioSesion
  cerrarSesion: () => void
  disparador?: 'tarjeta' | 'logo'
}): ReactElement {
  const { tema, establecerTema } = useTema()
  /* Con las claves compartidas por la administración, a nadie le falta una. */
  const { puedeUsarIa, cargando: cargandoApiKey } = useApiKey()
  const apiKeyFaltante = !cargandoApiKey && !puedeUsarIa
  const nombreVisible = usuario.nombre === '' ? usuario.correo : usuario.nombre
  const reducirMovimiento = useReducedMotion()
  const [abierto, setAbierto] = useState(false)
  const boton = useRef<HTMLButtonElement>(null)
  const idDelPanel = useId()

  const cerrar = (): void => setAbierto(false)

  return (
    <>
      {disparador === 'logo' ? (
        <button
          ref={boton}
          type="button"
          onClick={() => setAbierto(true)}
          aria-haspopup="dialog"
          aria-expanded={abierto}
          aria-controls={idDelPanel}
          aria-label={
            apiKeyFaltante ? `Cuenta de ${nombreVisible}, falta configurar la API key` : `Cuenta de ${nombreVisible}`
          }
          className="relative flex max-w-full min-w-0 cursor-pointer items-center gap-2 rounded-full p-1.5 pr-3 text-texto transition-colors hover:bg-acento-tenue"
        >
          <span className="shrink-0">
            <MarcaDeMenti tamano={24} />
          </span>
          <span className="truncate font-titulo text-base leading-none font-semibold tracking-tight">Menti Vault</span>
          {apiKeyFaltante ? (
            <span aria-hidden="true" className="absolute top-1 left-6 size-2.5 rounded-full bg-pendiente ring-2 ring-fondo" />
          ) : null}
        </button>
      ) : (
        <button
          ref={boton}
          type="button"
          onClick={() => setAbierto(true)}
          aria-haspopup="dialog"
          aria-expanded={abierto}
          aria-controls={idDelPanel}
          aria-label={
            apiKeyFaltante ? `Cuenta de ${nombreVisible}, falta configurar la API key` : `Cuenta de ${nombreVisible}`
          }
          className="flex w-full cursor-pointer items-center gap-3 rounded-[20px] p-2 text-left transition-colors hover:bg-acento-tenue"
        >
          {/*
            Dos círculos concéntricos, como la referencia: un aro gris de 40px que
            lo despega del fondo y, dentro, el disco con las iniciales.
          */}
          <span aria-hidden="true" className="relative flex min-w-0 flex-1 items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-acento-tenue">
              <span className="flex size-9 items-center justify-center rounded-full bg-acento text-sm font-semibold text-acento-contraste">
                {inicialesDe(usuario.nombre, usuario.correo)}
              </span>
            </span>

            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-semibold text-texto">{nombreVisible}</span>
              <span className="truncate text-xs text-texto-tenue">{usuario.correo}</span>
            </span>

            <AnimatePresence>
              {apiKeyFaltante ? (
                <motion.span
                  initial={reducirMovimiento ? false : { opacity: 0, scale: 0.4 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.4 }}
                  transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute top-0 left-8 size-2.5 rounded-full bg-pendiente ring-2 ring-fondo"
                />
              ) : null}
            </AnimatePresence>
          </span>
        </button>
      )}

      {/*
        Nace sobre el propio logo: su borde izquierdo se alinea con el del
        botón y crece hacia la derecha. Alineado por la derecha —lo que hace
        un modal anclado por defecto— se salía por el borde izquierdo de la
        pantalla; puesto a la derecha del dock, aparecía lejos de lo que se
        acababa de pulsar.
      */}
      <Modal
        abierto={abierto}
        alCerrar={cerrar}
        titulo="Tu cuenta"
        ancho="angosto"
        anclaje="disparador"
        anclaEn={boton}
        crecerHacia="desde-el-borde"
      >
        <div id={idDelPanel} className="flex flex-col gap-5 pb-1">
          {disparador === 'logo' ? (
            <div className="flex items-center gap-3 px-1">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-acento text-sm font-semibold text-acento-contraste">
                {inicialesDe(usuario.nombre, usuario.correo)}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-semibold text-texto">{nombreVisible}</span>
                <span className="truncate text-xs text-texto-tenue">{usuario.correo}</span>
              </span>
            </div>
          ) : null}

          {apiKeyFaltante ? (
            <Link
              to="/configuracion#config-api-key"
              onClick={cerrar}
              className="flex items-start gap-3 rounded-[20px] bg-ilustracion p-4 text-ilustracion-texto transition-opacity hover:opacity-90"
            >
              <span aria-hidden="true" className="material-symbols-rounded icono-relleno text-[22px]">
                key
              </span>
              <span className="text-sm leading-relaxed">
                Falta tu API key. Configúrala para poder cargar conferencias.
              </span>
            </Link>
          ) : null}

          <div className="flex flex-col gap-2">
            <p className="px-1 text-sm font-medium text-texto-tenue">Tema</p>
            {/*
              El tema elegido lleva la superficie clara dentro del carril, como
              una pastilla que se desliza entre tres. Cambiarlo no cierra el
              menú: se prueba y se compara sin tener que volver a abrirlo.
            */}
            <div className="grid grid-cols-3 gap-1 rounded-full bg-acento-tenue p-1">
              {OPCIONES_DE_TEMA.map(({ valor, etiqueta, icono }) => (
                <button
                  key={valor}
                  type="button"
                  onClick={() => establecerTema(valor)}
                  aria-pressed={tema === valor}
                  className={`flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-full text-sm transition-colors ${
                    tema === valor ? 'bg-fondo font-medium text-texto' : 'text-texto-tenue hover:text-texto'
                  }`}
                >
                  <span aria-hidden="true" className="material-symbols-rounded icono-contorno text-lg">
                    {icono}
                  </span>
                  {etiqueta}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col">
            {[{ etiqueta: 'Perfil', icono: 'person' }].map((fila) => (
              <span
                key={fila.etiqueta}
                aria-disabled="true"
                className="flex h-12 w-full cursor-not-allowed items-center gap-3 rounded-2xl px-3 text-base text-texto-tenue opacity-50"
              >
                <span aria-hidden="true" className="material-symbols-rounded icono-contorno text-xl">
                  {fila.icono}
                </span>
                {fila.etiqueta}
                <span aria-hidden="true" className="material-symbols-rounded icono-contorno ml-auto text-base">
                  lock
                </span>
              </span>
            ))}

            {/* Apariencia ya existe: lleva a su sección dentro de Configuración. */}
            <Link to="/configuracion#apariencia" onClick={cerrar} className={`${FILA} text-texto`}>
              <span aria-hidden="true" className="material-symbols-rounded icono-contorno text-xl text-texto-tenue">
                palette
              </span>
              Apariencia
            </Link>

            <Link to="/configuracion" onClick={cerrar} className={`${FILA} text-texto`}>
              <span aria-hidden="true" className="material-symbols-rounded icono-contorno text-xl text-texto-tenue">
                settings
              </span>
              Configuración
            </Link>

            <button
              type="button"
              onClick={() => {
                cerrar()
                cerrarSesion()
              }}
              className={`${FILA} text-texto-tenue hover:text-error`}
            >
              <span aria-hidden="true" className="material-symbols-rounded icono-contorno text-xl">
                logout
              </span>
              Cerrar sesión
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}
