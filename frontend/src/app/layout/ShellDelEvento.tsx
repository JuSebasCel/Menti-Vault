import type { ReactElement } from 'react'
import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useSession } from '@/features/auth/session'
import { useEvento } from '@/features/evento/useEvento'
import { elegirEvento } from '@/features/evento/eventoElegido'
import { crearEvento, listarEventos } from '@/features/evento/repositorio'
import type { ResumenDeEvento } from '@/features/evento/tipos'
import { Icono } from '@/features/evento/components/piezas'
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
  { etiqueta: 'Invitar ponente', ruta: '/ponentes?invitar=1', icono: 'person_add' },
  { etiqueta: 'Subir ponencia', ruta: '/ponencias?subir=1', icono: 'upload' },
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
  alPulsar?: () => void
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
                <Item entrada={accion} activa={false} alPulsar={() => void navegar(accion.ruta)} />
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
  const [nuevo, setNuevo] = useState('')
  const caja = useRef<HTMLDivElement>(null)
  const navegar = useNavigate()

  useEffect(() => {
    if (!abierto) {
      return
    }
    void listarEventos().then((resultado) => resultado.ok && setEventos(resultado.datos))
    const alPulsarFuera = (evento: MouseEvent): void => {
      if (!caja.current?.contains(evento.target as Node)) {
        setAbierto(false)
      }
    }
    window.addEventListener('mousedown', alPulsarFuera)
    return () => window.removeEventListener('mousedown', alPulsarFuera)
  }, [abierto])

  return (
    <div ref={caja} className="relative mb-4">
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        aria-expanded={abierto}
        className="flex w-full cursor-pointer items-center gap-2 rounded-[20px] bg-panel px-4 py-3 text-left transition-colors hover:bg-[var(--mind-variante)]"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[11px] font-medium tracking-wide text-texto-tenue uppercase">
            Evento
          </span>
          <span className="truncate text-[15px] font-semibold text-texto">{nombre}</span>
        </span>
        <Icono nombre="unfold_more" className="text-xl text-texto-tenue" />
      </button>

      {!abierto ? null : (
        <div className="entrar-escalonado absolute inset-x-0 top-full z-30 mt-2 flex flex-col gap-1 rounded-[24px] bg-fondo p-2 shadow-[0_0_0_1px_var(--bitacora-filete),0_12px_32px_-12px_rgb(0_0_0/0.25)]">
          {eventos.map((evento) => (
            <button
              key={evento.id}
              type="button"
              onClick={() => {
                elegirEvento(evento.nombre)
                setAbierto(false)
              }}
              className={`flex cursor-pointer items-center justify-between gap-2 rounded-[16px] px-3 py-2.5 text-left text-sm transition-colors ${evento.nombre === nombre ? 'bg-acento text-acento-contraste' : 'hover:bg-panel'}`}
            >
              <span className="truncate font-medium">{evento.nombre}</span>
              <span className="shrink-0 opacity-70">{evento.ponencias}</span>
            </button>
          ))}
          <span className="my-1 h-px bg-filete" />
          <button
            type="button"
            onClick={() => {
              setAbierto(false)
              void navegar('/evento')
            }}
            className="flex cursor-pointer items-center gap-2 rounded-[16px] px-3 py-2.5 text-left text-sm hover:bg-panel"
          >
            <Icono nombre="tune" className="text-lg" /> Configurar evento
          </button>
          <div className="flex items-center gap-1 rounded-[16px] bg-panel py-1 pr-1 pl-3">
            <input
              value={nuevo}
              onChange={(evento) => setNuevo(evento.target.value)}
              placeholder="Nuevo evento"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
            <button
              type="button"
              disabled={nuevo.trim() === ''}
              aria-label="Crear evento"
              onClick={() => {
                const nombreNuevo = nuevo.trim()
                void crearEvento(nombreNuevo).then((resultado) => {
                  if (resultado.ok) {
                    elegirEvento(nombreNuevo)
                    setNuevo('')
                    setAbierto(false)
                    void navegar('/evento')
                  }
                })
              }}
              className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-acento text-acento-contraste disabled:opacity-40"
            >
              <Icono nombre="add" className="text-lg" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
