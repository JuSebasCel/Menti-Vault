import type { ReactElement } from 'react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useSession } from '@/features/auth/session'
import { CargaDelEvento } from '../components/CargaDelEvento'
import { BotonMind, Chip, EncabezadoDePagina, Icono, Tarjeta, Vacio } from '../components/piezas'
import { estaAprobada } from '../formato'
import type { DatosDelEvento } from '../tipos'

/*
  El inicio, con la misma forma que el de Melon Mind: saludo con la cifra
  grande, dos tarjetas de "cómo va" a la derecha, las sesiones del día con
  chips debajo y, al lado, las solicitudes —lo que espera una respuesta de
  alguien—.

  Las solicitudes reemplazan al ciclo en pasos de la versión anterior: un
  evento no avanza en orden de casilla en casilla, y lo que el organizador
  necesita al abrir es saber a quién tiene que perseguir hoy.
*/
export function PantallaInicio(): ReactElement {
  return <CargaDelEvento>{(datos) => <Inicio datos={datos} />}</CargaDelEvento>
}

const HOY = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
const DIA_CORTO = new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric' })

type Solicitud = { id: string; icono: string; titulo: string; detalle: string; ruta: string }

function Inicio({ datos }: { datos: DatosDelEvento }): ReactElement {
  const { usuario } = useSession()
  const navegar = useNavigate()
  const { ponentes, ponencias, memorias, producciones } = datos

  const dias = useMemo(() => [...new Set(ponencias.map((ponencia) => ponencia.fecha))].sort(), [ponencias])
  const [dia, setDia] = useState(dias[0] ?? '')

  const porAprobar = ponencias.filter((ponencia) => !estaAprobada(ponencia.aprobacion)).length
  const sinConsentir = ponentes.filter((ponente) => ponente.consentimiento !== 'aceptado').length
  const general = memorias.find((memoria) => memoria.alcance === 'evento')

  const solicitudes: Solicitud[] = [
    ...ponentes
      .filter((ponente) => ponente.consentimiento === 'enviado')
      .map((ponente) => ({
        id: ponente.id,
        icono: 'mark_email_unread',
        titulo: ponente.nombre,
        detalle: 'No ha respondido la invitación',
        ruta: `/ponentes?ver=${ponente.id}`,
      })),
    ...ponencias
      .filter((ponencia) => ponencia.aprobacion === 'enviada')
      .map((ponencia) => ({
        id: ponencia.id,
        icono: 'rate_review',
        titulo: ponencia.titulo,
        detalle: `En revisión de ${ponencia.ponente}`,
        ruta: `/ponencias?ver=${ponencia.id}`,
      })),
    ...ponencias
      .filter((ponencia) => ponencia.comentarioDelPonente !== '')
      .map((ponencia) => ({
        id: `${ponencia.id}-cambios`,
        icono: 'edit_note',
        titulo: ponencia.titulo,
        detalle: `${ponencia.ponente.split(' ')[0] ?? ''} pidió un cambio`,
        ruta: `/ponencias?ver=${ponencia.id}`,
      })),
  ]

  return (
    <div className="flex flex-1 flex-col gap-2">
      <div className="pb-2">
        <EncabezadoDePagina titulo="Inicio">
          <BotonMind icono="add" onClick={() => void navegar('/agenda?nueva=1')}>
            Crear
          </BotonMind>
        </EncabezadoDePagina>
      </div>

      <div className="entrar-escalonado grid grid-cols-3 gap-2">
        <Tarjeta variante="rellena" className="relative flex flex-col gap-6">
          <div className="flex flex-col">
            <span className="text-2xl font-semibold">Hola {usuario?.nombre.split(' ')[0] ?? ''}</span>
            <span className="text-sm text-texto-tenue first-letter:uppercase">{HOY.format(new Date())}</span>
          </div>
          <div className="flex flex-col gap-3">
            <span className="text-base leading-none font-medium opacity-80">El evento tiene</span>
            <span className="text-[45px] leading-none font-semibold">{ponencias.length} ponencias</span>
          </div>
          <button
            type="button"
            onClick={() => void navegar('/agenda')}
            aria-label="Abrir la agenda"
            className="absolute right-4 bottom-4 flex size-12 cursor-pointer items-center justify-center rounded-full bg-acento text-acento-contraste transition-transform hover:scale-105"
          >
            <Icono nombre="calendar_month" className="text-2xl" />
          </button>
        </Tarjeta>

        <Tarjeta className="flex flex-col justify-center gap-1">
          <span className="text-2xl text-texto-tenue">Por aprobar:</span>
          <span className="text-2xl font-semibold">
            {porAprobar === 0 ? 'Todo aprobado' : `${porAprobar} ${porAprobar === 1 ? 'ponencia' : 'ponencias'}`}
          </span>
        </Tarjeta>

        <Tarjeta className="flex flex-col justify-center gap-1">
          <span className="text-2xl text-texto-tenue">Sin consentimiento:</span>
          <span className="text-2xl font-semibold">
            {sinConsentir === 0 ? 'Nadie' : `${sinConsentir} ${sinConsentir === 1 ? 'ponente' : 'ponentes'}`}
          </span>
        </Tarjeta>
      </div>

      <div className="entrar-escalonado grid flex-1 grid-cols-3 gap-2">
        <Tarjeta className="flex flex-col gap-4 p-2">
          <div className="flex flex-col gap-3 px-4 pt-4">
            <span className="text-2xl font-medium">Sesiones</span>
            <div className="flex gap-2">
              {dias.map((uno) => (
                <Chip key={uno} elegido={dia === uno} onClick={() => setDia(uno)}>
                  <span className="capitalize">{DIA_CORTO.format(new Date(`${uno}T12:00:00`))}</span>
                </Chip>
              ))}
            </div>
          </div>
          <ol key={dia} className="entrar-escalonado flex flex-col gap-1">
            {ponencias
              .filter((ponencia) => ponencia.fecha === dia)
              .map((ponencia) => (
                <li key={ponencia.id}>
                  <button
                    type="button"
                    onClick={() => void navegar(`/ponencias?ver=${ponencia.id}`)}
                    className="flex w-full cursor-pointer gap-3 rounded-[16px] px-4 py-3 text-left transition-colors hover:bg-panel"
                  >
                    <span className="w-11 shrink-0 font-mono text-sm">{ponencia.horaInicio ?? '—'}</span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[15px] font-medium">{ponencia.titulo}</span>
                      <span className="truncate text-sm text-texto-tenue">{ponencia.ponente}</span>
                    </span>
                  </button>
                </li>
              ))}
          </ol>
        </Tarjeta>

        <Tarjeta className="col-span-2 flex flex-col gap-4 p-2">
          <div className="flex flex-col gap-3 px-4 pt-4">
            <span className="text-2xl font-medium">Solicitudes</span>
          </div>
          {solicitudes.length === 0 ? (
            <Vacio icono="checklist" texto="No hay solicitudes" />
          ) : (
            <ul className="flex flex-col gap-1">
              {solicitudes.map((solicitud) => (
                <li key={solicitud.id}>
                  <button
                    type="button"
                    onClick={() => void navegar(solicitud.ruta)}
                    className="flex w-full cursor-pointer items-center gap-4 rounded-[16px] px-4 py-3 text-left transition-colors hover:bg-panel"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-acento text-acento-contraste">
                      <Icono nombre={solicitud.icono} className="text-xl" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[15px] font-medium">{solicitud.titulo}</span>
                      <span className="text-sm text-texto-tenue">{solicitud.detalle}</span>
                    </span>
                    <Icono nombre="arrow_outward" className="text-lg" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-auto grid grid-cols-2 gap-2 p-2">
            <button
              type="button"
              onClick={() => void navegar('/memorias-del-evento')}
              className="flex cursor-pointer items-center gap-3 rounded-[20px] bg-panel p-4 text-left transition-colors hover:bg-[var(--mind-neutro)]"
            >
              <Icono nombre="menu_book" className="text-2xl" />
              <span className="flex min-w-0 flex-col">
                <span className="font-medium">Memoria general</span>
                <span className="truncate text-sm text-texto-tenue">{general === undefined ? 'Sin generar' : 'Lista para entregar'}</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => void navegar('/articulos')}
              className="flex cursor-pointer items-center gap-3 rounded-[20px] bg-panel p-4 text-left transition-colors hover:bg-[var(--mind-neutro)]"
            >
              <Icono nombre="school" className="text-2xl" />
              <span className="flex min-w-0 flex-col">
                <span className="font-medium">Artículos</span>
                <span className="truncate text-sm text-texto-tenue">
                  {producciones.length} {producciones.length === 1 ? 'listo' : 'listos'}
                </span>
              </span>
            </button>
          </div>
        </Tarjeta>
      </div>
    </div>
  )
}
