import type { ReactElement } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useSession } from '@/features/auth/session'
import { useEvento } from '@/features/evento/useEvento'
import { MarcaDeMenti } from '@/shared/ui'

/*
  El armazón del producto reorientado: un evento y su ciclo editorial.

  Sigue el patrón de app-shell ya aprobado (el documento no desplaza; solo
  el contenido tiene `overflow-y-auto`), con el dock de Melon Mind calcado:
  icono y texto, la píldora que nace del icono, y un segundo grupo de
  **acciones** que abren su flujo directamente, para no obligar a entrar a
  una sección solo para empezar algo.

  Las secciones siguen el orden del trabajo: primero la estructura (agenda),
  luego la gente y lo que dijo, y al final lo que se entrega.
*/

type Entrada = { etiqueta: string; ruta: string; icono: string }

const SECCIONES: readonly Entrada[] = [
  { etiqueta: 'Inicio', ruta: '/inicio', icono: 'home' },
  { etiqueta: 'Agenda', ruta: '/agenda', icono: 'event' },
  { etiqueta: 'Ponentes', ruta: '/ponentes', icono: 'groups' },
  { etiqueta: 'Ponencias', ruta: '/ponencias', icono: 'mic' },
  { etiqueta: 'Memorias', ruta: '/memorias-del-evento', icono: 'description' },
  { etiqueta: 'Artículos', ruta: '/articulos', icono: 'school' },
  { etiqueta: 'Redes', ruta: '/redes', icono: 'campaign' },
  { etiqueta: 'Organización', ruta: '/organizacion', icono: 'home_work' },
]

const ACCIONES: readonly Entrada[] = [
  { etiqueta: 'Nueva sesión', ruta: '/agenda?nueva=1', icono: 'calendar_add_on' },
  { etiqueta: 'Invitar ponente', ruta: '/ponentes?invitar=1', icono: 'person_add' },
  { etiqueta: 'Subir ponencia', ruta: '/conferencias?nuevo=1', icono: 'upload' },
  { etiqueta: 'Nuevo artículo', ruta: '/articulos?nueva=1', icono: 'edit_note' },
]

function Item({ entrada, activa, alPulsar }: { entrada: Entrada; activa: boolean; alPulsar?: () => void }): ReactElement {
  const contenido = (
    <>
      <span className="soporte">
        <span aria-hidden="true" className="material-symbols-rounded glifo">
          {entrada.icono}
        </span>
      </span>
      <span className="rotulo">{entrada.etiqueta}</span>
    </>
  )

  return alPulsar === undefined ? (
    <NavLink to={entrada.ruta} className="item-mind" data-activo={activa}>
      {contenido}
    </NavLink>
  ) : (
    <button type="button" className="item-mind" data-activo={false} onClick={alPulsar}>
      {contenido}
    </button>
  )
}

export function ShellDelEvento(): ReactElement {
  const { usuario } = useSession()
  const { datos } = useEvento()
  const navegar = useNavigate()
  const { pathname } = useLocation()

  return (
    <div className="flex h-dvh overflow-hidden bg-fondo font-sans text-texto">
      <nav aria-label="Navegación principal" className="dock-mind flex w-56 shrink-0 flex-col overflow-y-auto px-3 py-6">
        <div className="flex h-10 items-center gap-3 px-6">
          <MarcaDeMenti tamano={24} />
          <span className="truncate font-['Inter_Variable'] text-base font-medium text-texto">
            {datos?.evento.nombre ?? 'Menti Vault'}
          </span>
        </div>

        <ul className="flex flex-col">
          {SECCIONES.map((seccion) => (
            <li key={seccion.ruta}>
              <Item entrada={seccion} activa={pathname === seccion.ruta || pathname.startsWith(`${seccion.ruta}/`)} />
            </li>
          ))}
        </ul>

        <p className="mt-6 flex h-10 items-center px-6 font-['Inter_Variable'] text-base font-medium text-filete-fuerte">Opciones</p>
        <ul className="flex flex-col">
          {ACCIONES.map((accion) => (
            <li key={accion.ruta}>
              <Item entrada={accion} activa={false} alPulsar={() => void navegar(accion.ruta)} />
            </li>
          ))}
        </ul>

        <div className="mt-auto flex flex-col pt-6">
          <Item
            entrada={{ etiqueta: usuario?.nombre.split(' ')[0] ?? 'Cuenta', ruta: '/ajustes', icono: 'settings' }}
            activa={pathname === '/ajustes'}
          />
        </div>
      </nav>

      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto p-4 pl-2">
        <Outlet />
      </main>
    </div>
  )
}
