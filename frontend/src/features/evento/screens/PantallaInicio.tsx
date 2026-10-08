import type { ReactElement, ReactNode } from 'react'
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
        ruta: `/ponencias?ver=${ponencia.id}&pestana=aprobacion`,
      })),
    ...ponencias
      .filter((ponencia) => ponencia.comentarioDelPonente !== '')
      .map((ponencia) => ({
        id: `${ponencia.id}-cambios`,
        icono: 'edit_note',
        titulo: ponencia.titulo,
        detalle: `${ponencia.ponente.split(' ')[0] ?? ''} pidió: «${ponencia.comentarioDelPonente}»`,
        ruta: `/ponencias?ver=${ponencia.id}&pestana=aprobacion`,
      })),
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="shrink-0 pb-2">
        <EncabezadoDePagina titulo="Inicio">
          <BotonMind icono="add" onClick={() => void navegar('/agenda?nueva=1')}>
            Crear
          </BotonMind>
        </EncabezadoDePagina>
      </div>

      <div className="entrar-escalonado grid shrink-0 grid-cols-3 gap-2">
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
          <span className="text-2xl text-texto-tenue">Sin autorizar:</span>
          <span className="text-2xl font-semibold">
            {sinConsentir === 0 ? 'Nadie' : `${sinConsentir} ${sinConsentir === 1 ? 'ponente' : 'ponentes'}`}
          </span>
        </Tarjeta>
      </div>

      <div className="entrar-escalonado grid min-h-0 flex-1 grid-cols-3 gap-2">
        <Columna titulo="Sesiones">
          <div className="flex shrink-0 gap-2 px-4">
            {dias.map((uno) => (
              <Chip key={uno} elegido={dia === uno} onClick={() => setDia(uno)}>
                <span className="capitalize">{DIA_CORTO.format(new Date(`${uno}T12:00:00`))}</span>
              </Chip>
            ))}
          </div>
          <ol key={dia} className="entrar-escalonado flex min-h-0 flex-col gap-2 overflow-y-auto px-2 pb-2">
            {ponencias
              .filter((ponencia) => ponencia.fecha === dia)
              .map((ponencia) => (
                <li key={ponencia.id}>
                  <Fila
                    alPulsar={() => void navegar(`/ponencias?ver=${ponencia.id}`)}
                    inicio={<span className="w-11 shrink-0 font-mono text-sm">{ponencia.horaInicio ?? '—'}</span>}
                    titulo={ponencia.titulo}
                    detalle={ponencia.ponente}
                  />
                </li>
              ))}
          </ol>
        </Columna>

        <Columna titulo="Solicitudes">
          {solicitudes.length === 0 ? (
            <Vacio icono="checklist" texto="No hay solicitudes" />
          ) : (
            <ul className="flex min-h-0 flex-col gap-2 overflow-y-auto px-2 pb-2">
              {solicitudes.map((solicitud) => (
                <li key={solicitud.id}>
                  <Fila
                    alPulsar={() => void navegar(solicitud.ruta)}
                    inicio={
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-acento text-acento-contraste">
                        <Icono nombre={solicitud.icono} className="text-xl" />
                      </span>
                    }
                    titulo={solicitud.titulo}
                    detalle={solicitud.detalle}
                  />
                </li>
              ))}
            </ul>
          )}
        </Columna>

        <Columna titulo="Entregables">
          <ul className="flex min-h-0 flex-col gap-2 overflow-y-auto px-2 pb-2">
            <li>
              <Fila
                alPulsar={() => void navegar('/memorias-del-evento')}
                inicio={<Icono nombre="menu_book" className="text-2xl" />}
                titulo="Memoria general"
                detalle={general === undefined ? 'Sin generar' : 'Lista para entregar'}
              />
            </li>
            <li>
              <Fila
                alPulsar={() => void navegar('/memorias-del-evento')}
                inicio={<Icono nombre="description" className="text-2xl" />}
                titulo="Memorias por ponencia"
                detalle={`${memorias.filter((memoria) => memoria.alcance === 'ponencia').length} de ${ponencias.length}`}
              />
            </li>
            <li>
              <Fila
                alPulsar={() => void navegar('/articulos')}
                inicio={<Icono nombre="school" className="text-2xl" />}
                titulo="Artículos"
                detalle={`${producciones.length} ${producciones.length === 1 ? 'listo' : 'listos'}`}
              />
            </li>
            <li>
              <Fila
                alPulsar={() => void navegar('/redes')}
                inicio={<Icono nombre="campaign" className="text-2xl" />}
                titulo="Redes"
                detalle={`${datos.publicaciones.length} piezas`}
              />
            </li>
          </ul>
        </Columna>
      </div>
    </div>
  )
}

function Columna({ titulo, children }: { titulo: string; children: ReactNode }): ReactElement {
  return (
    <section className="tarjeta-borde flex min-h-0 flex-col gap-4 rounded-[24px] bg-fondo pt-6">
      <h2 className="shrink-0 px-6 text-2xl font-medium">{titulo}</h2>
      {children}
    </section>
  )
}

/* Cada dato en su propia caja gris, separada de la siguiente: sin eso la columna se leía como un solo bloque. */
function Fila({ alPulsar, inicio, titulo, detalle }: { alPulsar: () => void; inicio: ReactNode; titulo: string; detalle: string }): ReactElement {
  return (
    <button
      type="button"
      onClick={alPulsar}
      className="flex w-full cursor-pointer items-center gap-3 rounded-[16px] bg-panel px-4 py-3 text-left transition-colors hover:bg-[var(--mind-variante)]"
    >
      {inicio}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] font-medium">{titulo}</span>
        <span className="truncate text-sm text-texto-tenue">{detalle}</span>
      </span>
    </button>
  )
}
