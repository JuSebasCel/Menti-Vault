import type { ReactElement, ReactNode } from 'react'
import { useSession } from '@/features/auth/session'
import { cambiarCierreDelSitio, useCierreDelSitio } from '@/features/configuracion/cierreDelSitio'
import { useTema } from '@/shared/tema'
import type { Tema } from '@/shared/tema'
import { Avatar, BotonMind, Chip, EncabezadoDePagina, Icono, Tarjeta } from '../components/piezas'
import { cambiarDemostracion, useDemostracion } from '../demostracion'
import { iniciales } from '../formato'

/*
  Ajustes de la persona y de la app: apariencia, quién puede entrar y la
  cuenta. Lo del evento (fechas, ejes, formato) vive en el propio evento. Las claves de IA salen de aquí porque las pone la
  plataforma, no cada persona.
*/
export function PantallaAjustes(): ReactElement {
  return <Ajustes />
}

function Ajustes(): ReactElement {
  const { usuario, cerrarSesion } = useSession()
  const { tema, establecerTema } = useTema()
  const cierre = useCierreDelSitio(usuario?.id ?? '')
  const demostracion = useDemostracion()

  return (
    <div className="flex flex-col gap-4">
      <EncabezadoDePagina titulo="Ajustes" />

      <div className="entrar-escalonado grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-2">
          <Seccion titulo="Apariencia" icono="contrast">
            <div className="flex gap-2">
              {(
                [
                  ['claro', 'Claro'],
                  ['oscuro', 'Oscuro'],
                  ['sistema', 'Como el sistema'],
                ] as [Tema, string][]
              ).map(([valor, etiqueta]) => (
                <Chip key={valor} elegido={tema === valor} onClick={() => establecerTema(valor)}>
                  {etiqueta}
                </Chip>
              ))}
            </div>
          </Seccion>

          <Seccion titulo="Modo demostración" icono="slideshow">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-texto-tenue">
                {demostracion
                  ? 'Crear sesiones, ponentes, grabaciones o piezas se recorre entero, pero no se guarda.'
                  : 'Todo lo que se crea se guarda en el evento.'}
              </span>
              <div className="flex shrink-0 gap-2">
                <Chip elegido={demostracion} onClick={() => cambiarDemostracion(true)}>
                  Encendido
                </Chip>
                <Chip elegido={!demostracion} onClick={() => cambiarDemostracion(false)}>
                  Apagado
                </Chip>
              </div>
            </div>
          </Seccion>

          {cierre.soyAdministracion ? (
            <Seccion titulo="Acceso a la app" icono="lock">
              <div className="flex items-center justify-between gap-4">
                <span>{cierre.cerrado ? 'Cerrada para los demás' : 'Abierta para todos'}</span>
                <BotonMind variante="tenue" icono={cierre.cerrado ? 'lock_open' : 'lock'} onClick={() => void cambiarCierreDelSitio(!cierre.cerrado)}>
                  {cierre.cerrado ? 'Abrir' : 'Cerrar'}
                </BotonMind>
              </div>
            </Seccion>
          ) : null}

        </div>
        <div className="flex flex-col gap-2">
          <Seccion titulo="Cuenta" icono="person">
            <div className="flex items-center gap-3">
              <Avatar texto={iniciales(usuario?.nombre ?? '?')} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{usuario?.nombre}</span>
                <span className="truncate text-sm text-texto-tenue">{usuario?.correo}</span>
              </span>
              <BotonMind variante="tenue" icono="logout" onClick={cerrarSesion}>
                Salir
              </BotonMind>
            </div>
          </Seccion>
        </div>
      </div>
    </div>
  )
}

function Seccion({ titulo, icono, children }: { titulo: string; icono: string; children: ReactNode }): ReactElement {
  return (
    <Tarjeta className="flex flex-col gap-5">
      <span className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-full bg-acento text-acento-contraste">
          <Icono nombre={icono} className="text-xl" />
        </span>
        <span className="text-2xl font-medium">{titulo}</span>
      </span>
      {children}
    </Tarjeta>
  )
}
