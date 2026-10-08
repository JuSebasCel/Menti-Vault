import type { ReactElement } from 'react'
import { useEffect } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useSession } from '@/features/auth/session'
import { useEvento } from '@/features/evento/useEvento'
import { Icono } from '@/features/evento/components/piezas'
import { MarcaDeMenti } from '@/shared/ui'
import { useTema } from '@/shared/tema'

/*
  El armazón del producto reorientado: un evento y su ciclo editorial.

  Sigue el patrón de app-shell ya aprobado (el documento no desplaza; solo
  el contenido tiene `overflow-y-auto`), pero con el dock de la referencia
  nueva: icono y texto, píldora negra de vidrio en la sección activa, y un
  segundo grupo de **acciones** que abren su flujo directamente, para no
  obligar a entrar a una sección solo para empezar algo.
*/

type Seccion = { etiqueta: string; ruta: string; icono: string }

const SECCIONES_DEL_EVENTO: readonly Seccion[] = [
  { etiqueta: 'Inicio', ruta: '/inicio', icono: 'home' },
  { etiqueta: 'Ponentes', ruta: '/ponentes', icono: 'groups' },
  { etiqueta: 'Ponencias', ruta: '/ponencias', icono: 'mic' },
  { etiqueta: 'Memorias', ruta: '/memorias-del-evento', icono: 'description' },
  { etiqueta: 'Producción académica', ruta: '/produccion', icono: 'school' },
  { etiqueta: 'Publicaciones', ruta: '/publicaciones', icono: 'campaign' },
  { etiqueta: 'Organización', ruta: '/organizacion', icono: 'domain' },
]

const ACCIONES: readonly Seccion[] = [
  { etiqueta: 'Invitar ponente', ruta: '/ponentes?invitar=1', icono: 'person_add' },
  { etiqueta: 'Subir ponencia', ruta: '/conferencias?nuevo=1', icono: 'upload' },
  { etiqueta: 'Nueva producción', ruta: '/produccion?nueva=1', icono: 'edit_note' },
  { etiqueta: 'Configuración', ruta: '/configuracion', icono: 'settings' },
]

export function ShellDelEvento(): ReactElement {
  const { usuario, cerrarSesion } = useSession()
  const { datos } = useEvento()
  const navegar = useNavigate()
  const { pathname } = useLocation()
  const { tema, establecerTema } = useTema()

  /*
    El dialecto nuevo solo está medido en claro: su píldora negra de vidrio y
    sus grises no tienen todavía un oscuro aprobado, y con los tokens oscuros
    del lenguaje anterior la píldora se perdía contra el fondo. Mientras tanto
    el shell se ve en claro y, al salir, devuelve el tema que había.
  */
  useEffect(() => {
    const anterior = tema
    if (anterior !== 'claro') {
      establecerTema('claro')
    }
    return () => {
      if (anterior !== 'claro') {
        establecerTema(anterior)
      }
    }
    // Solo al montar y desmontar: seguir `tema` lo volvería a forzar en cada cambio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex h-dvh overflow-hidden bg-fondo font-sans text-texto">
      <nav aria-label="Navegación principal" className="flex w-56 shrink-0 flex-col px-3 py-6">
        <div className="flex items-center gap-3 px-3 pb-1">
          <MarcaDeMenti tamano={24} />
          <span className="text-base font-medium text-texto">Menti Vault</span>
        </div>

        {/* El evento abierto: hoy uno solo, mañana el selector de eventos. */}
        <div className="mx-3 mt-3 mb-5 flex flex-col rounded-2xl bg-panel px-3 py-2.5">
          <span className="text-[11px] font-medium tracking-wide text-texto-tenue uppercase">Evento</span>
          <span className="truncate text-sm font-semibold text-texto">{datos?.evento.nombre ?? '…'}</span>
        </div>

        <ul className="flex flex-col">
          {SECCIONES_DEL_EVENTO.map((seccion) => {
            const activa = pathname === seccion.ruta || pathname.startsWith(`${seccion.ruta}/`)
            return (
              <li key={seccion.ruta}>
                <NavLink to={seccion.ruta} className="item-mind" data-activo={activa}>
                  <Icono nombre={seccion.icono} relleno={activa} />
                  <span className="truncate">{seccion.etiqueta}</span>
                </NavLink>
              </li>
            )
          })}
        </ul>

        <p className="mt-6 mb-1 px-3 text-[11px] font-medium text-filete-fuerte">Opciones</p>
        <ul className="flex flex-col">
          {ACCIONES.map((accion) => (
            <li key={accion.ruta}>
              <button type="button" className="item-mind" onClick={() => void navegar(accion.ruta)}>
                <Icono nombre={accion.icono} relleno={false} />
                <span className="truncate">{accion.etiqueta}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-auto flex items-center gap-3 px-3 pt-4">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-acento text-xs font-semibold text-acento-contraste">
            {(usuario?.nombre ?? '?').slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm text-texto">{usuario?.nombre ?? ''}</span>
          <button
            type="button"
            onClick={cerrarSesion}
            aria-label="Cerrar sesión"
            className="flex size-8 cursor-pointer items-center justify-center rounded-full text-texto-tenue transition-colors hover:bg-panel hover:text-texto"
          >
            <Icono nombre="logout" relleno={false} className="text-lg" />
          </button>
        </div>
      </nav>

      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto p-4 pl-2">
        <Outlet />
      </main>
    </div>
  )
}
