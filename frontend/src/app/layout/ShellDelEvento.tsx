import type { ReactElement } from 'react'
import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useSession } from '@/features/auth/session'
import { useEvento } from '@/features/evento/useEvento'
import { anclaDelDock } from '@/features/evento/anclaDelDock'
import { elegirEvento } from '@/features/evento/eventoElegido'
import { crearEvento, listarEventos } from '@/features/evento/repositorio'
import type { ResumenDeEvento } from '@/features/evento/tipos'
import { Icono } from '@/features/evento/components/piezas'
import { Modal } from '@/shared/ui'
import { ProveedorDeApiKey } from '@/features/configuracion/ProveedorDeApiKey'

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
  { etiqueta: 'Nuevo ponente', ruta: '/ponentes?invitar=1', icono: 'person_add' },
  { etiqueta: 'Subir grabación', ruta: '/ponencias?subir=1', icono: 'upload' },
  { etiqueta: 'Nueva memoria', ruta: '/memorias-del-evento?nueva=1', icono: 'note_add' },
  { etiqueta: 'Nuevo artículo', ruta: '/articulos?nueva=1', icono: 'edit_note' },
]

function Item({
  entrada,
  activa,
  alPulsar,
}: {
  entrada: Entrada
  activa: boolean
  alPulsar?: (boton: HTMLElement) => void
}): ReactElement {
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
    <button type="button" className="item-mind" data-activo={false} onClick={(evento) => alPulsar(evento.currentTarget)}>
      {contenido}
    </button>
  )
}

export function ShellDelEvento(): ReactElement {
  const { usuario } = useSession()
  const { datos } = useEvento()
  const navegar = useNavigate()
  const { pathname } = useLocation()

  /*
    El proveedor de la clave de IA envuelve el shell porque el flujo de carga
    (que se reusa del armazón anterior) lo exige: sin él, abrir Ponencias
    tumbaba la app entera con la pantalla en blanco.
  */
  return (
    <ProveedorDeApiKey>
      <div className="flex h-dvh overflow-hidden bg-fondo font-sans text-texto">
        <nav
          aria-label="Navegación principal"
          className="dock-mind flex w-56 shrink-0 flex-col px-3 py-4"
        >
          <SelectorDeEvento nombre={datos?.evento.nombre ?? '…'} />

          <ul className="flex flex-col">
            {SECCIONES.map((seccion) => (
              <li key={seccion.ruta}>
                <Item
                  entrada={seccion}
                  activa={pathname === seccion.ruta || pathname.startsWith(`${seccion.ruta}/`)}
                />
              </li>
            ))}
          </ul>

          <p className="mt-4 flex h-10 items-center px-6 font-['Inter_Variable'] text-base font-medium text-filete-fuerte">
            Opciones
          </p>
          <ul className="flex flex-col">
            {ACCIONES.map((accion) => (
              <li key={accion.ruta}>
                <Item
                entrada={accion}
                activa={false}
                alPulsar={(boton) => {
                  anclaDelDock.current = boton
                  void navegar(`${accion.ruta}&desde=dock`)
                }}
              />
              </li>
            ))}
          </ul>

          <div className="mt-auto flex flex-col pt-6">
            <Item
              entrada={{
                etiqueta: usuario?.nombre.split(' ')[0] ?? 'Cuenta',
                ruta: '/ajustes',
                icono: 'settings',
              }}
              activa={pathname === '/ajustes'}
            />
          </div>
        </nav>

        <main className="flex min-w-0 flex-1 flex-col overflow-y-auto p-4 pl-2">
          <Outlet />
        </main>
      </div>
    </ProveedorDeApiKey>
  )
}

/*
  El evento abierto, arriba del dock, y desde ahí el cambio de evento: una
  organización puede tener varios. Lo que se elige se recuerda en este
  navegador (`eventoElegido`). Configurar el evento —fechas, ejes, formato—
  también sale de aquí, porque es del evento y no de la cuenta.
*/
function SelectorDeEvento({ nombre }: { nombre: string }): ReactElement {
  const [abierto, setAbierto] = useState(false)
  const [eventos, setEventos] = useState<readonly ResumenDeEvento[]>([])
  const [creando, setCreando] = useState(false)
  const [nuevo, setNuevo] = useState('')
  const boton = useRef<HTMLButtonElement>(null)
  const navegar = useNavigate()

  useEffect(() => {
    if (abierto) {
      void listarEventos().then((resultado) => resultado.ok && setEventos(resultado.datos))
    } else {
      setCreando(false)
      setNuevo('')
    }
  }, [abierto])

  const crear = (): void => {
    const nombreNuevo = nuevo.trim()
    void crearEvento(nombreNuevo).then((resultado) => {
      if (resultado.ok) {
        elegirEvento(nombreNuevo)
        setAbierto(false)
        void navegar('/evento')
      }
    })
  }

  const fila = 'flex h-12 w-full cursor-pointer items-center gap-3 rounded-[24px] px-4 text-left text-[15px] transition-colors'

  return (
    <div className="mb-4">
      <button
        ref={boton}
        type="button"
        onClick={() => setAbierto(true)}
        aria-haspopup="dialog"
        className="flex w-full cursor-pointer items-center gap-2 rounded-[20px] bg-panel px-4 py-3 text-left transition-colors hover:bg-[var(--mind-variante)]"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[11px] font-medium tracking-wide text-texto-tenue uppercase">Evento</span>
          <span className="truncate text-[15px] font-semibold text-texto">{nombre}</span>
        </span>
        <Icono nombre="unfold_more" className="text-xl text-texto-tenue" />
      </button>

      <Modal abierto={abierto} alCerrar={() => setAbierto(false)} titulo="Eventos" anclaje="disparador" anclaEn={boton} crecerHacia="desde-el-borde" ancho="angosto">
        <div className="flex flex-col gap-1 pb-2">
          {eventos.map((evento) => {
            const actual = evento.nombre === nombre
            return (
              <button
                key={evento.id}
                type="button"
                onClick={() => {
                  elegirEvento(evento.nombre)
                  setAbierto(false)
                }}
                className={`${fila} ${actual ? 'bg-[var(--mind-tonal)] font-semibold [color:var(--mind-tonal-texto)]' : 'hover:bg-panel'}`}
              >
                <Icono nombre={actual ? 'check_circle' : 'event'} relleno={actual} className="text-xl" />
                <span className="min-w-0 flex-1 truncate">{evento.nombre}</span>
                <span className="text-sm opacity-70">
                  {evento.ponencias} {evento.ponencias === 1 ? 'ponencia' : 'ponencias'}
                </span>
              </button>
            )
          })}

          <span className="mx-4 my-2 h-px bg-filete" />

          <button
            type="button"
            onClick={() => {
              setAbierto(false)
              void navegar('/evento')
            }}
            className={`${fila} hover:bg-panel`}
          >
            <Icono nombre="tune" className="text-xl" /> Configurar {nombre}
          </button>

          {creando ? (
            <div className="flex h-12 items-center gap-2 rounded-[24px] bg-panel py-1 pr-1 pl-4">
              <Icono nombre="add" className="text-xl text-texto-tenue" />
              <input
                autoFocus
                value={nuevo}
                onChange={(evento) => setNuevo(evento.target.value)}
                onKeyDown={(evento) => {
                  if (evento.key === 'Enter' && nuevo.trim() !== '') {
                    crear()
                  }
                }}
                placeholder="Nombre del evento"
                className="min-w-0 flex-1 bg-transparent text-[15px] outline-none"
              />
              <button
                type="button"
                disabled={nuevo.trim() === ''}
                onClick={crear}
                className="flex h-10 cursor-pointer items-center rounded-full bg-acento px-4 text-sm font-medium text-acento-contraste disabled:opacity-40"
              >
                Crear
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setCreando(true)} className={`${fila} hover:bg-panel`}>
              <Icono nombre="add" className="text-xl" /> Nuevo evento
            </button>
          )}
        </div>
      </Modal>
    </div>
  )
}
