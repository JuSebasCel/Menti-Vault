import type { ReactElement, ReactNode } from 'react'
import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useSession } from '@/features/auth/session'
import { Modal } from '@/shared/ui'
import { CargaDelEvento } from '../components/CargaDelEvento'
import { Miniatura } from '../components/MiniaturaDeMemoria'
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
  const [creando, setCreando] = useState(false)
  const botonCrear = useRef<HTMLButtonElement>(null)

  const porAprobar = ponencias.filter((ponencia) => !estaAprobada(ponencia.aprobacion)).length
  const sinConsentir = ponentes.filter((ponente) => ponente.consentimiento !== 'aceptado').length

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
          <BotonMind ref={botonCrear} icono="add" onClick={() => setCreando(true)}>
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
          {/* Lo que ya se puede entregar, con su primera página: se reconoce sin abrirlo. */}
          <div className="grid min-h-0 grid-cols-2 gap-2 overflow-y-auto px-4 pb-2">
            {memorias
              .filter((memoria) => (memoria.alcance === 'evento' || memoria.alcance === 'agrupacion') && memoria.archivoPdf !== null)
              .sort((una, otra) => (una.alcance === 'evento' ? -1 : otra.alcance === 'evento' ? 1 : 0))
              .map((memoria) => (
                <button
                  key={memoria.id}
                  type="button"
                  onClick={() => void navegar('/memorias-del-evento')}
                  className="flex cursor-pointer flex-col gap-1.5 rounded-[16px] text-left transition-transform hover:scale-[1.02]"
                >
                  <Miniatura rutaPdf={memoria.archivoPdf ?? ''} titulo={memoria.nombre} />
                  <span className="truncate px-1 text-sm font-medium">{memoria.alcance === 'evento' ? 'Memoria general' : memoria.agrupacion}</span>
                </button>
              ))}
          </div>
          <div className="mt-auto flex shrink-0 flex-col gap-2 px-2 pb-2">
            <Fila
              alPulsar={() => void navegar('/memorias-del-evento')}
              inicio={<Icono nombre="description" className="text-2xl" />}
              titulo={`${memorias.filter((memoria) => memoria.alcance === 'ponencia').length} memorias por ponencia`}
              detalle="Aprobadas por sus ponentes"
            />
            <Fila
              alPulsar={() => void navegar('/articulos')}
              inicio={<Icono nombre="school" className="text-2xl" />}
              titulo={producciones[0]?.titulo ?? 'Sin artículos todavía'}
              detalle={producciones.length === 0 ? 'Crea uno desde Artículos' : `${producciones.length} ${producciones.length === 1 ? 'artículo listo' : 'artículos listos'}`}
            />
          </div>
        </Columna>
      </div>

      {/* El menú de crear de la referencia: nace del botón y lleva a cada flujo. */}
      <Modal abierto={creando} alCerrar={() => setCreando(false)} titulo="Crear" anclaje="disparador" anclaEn={botonCrear} ancho="angosto">
        <div className="flex flex-col gap-1 pb-2">
          {(
            [
              ['calendar_add_on', 'Nueva sesión', '/agenda?nueva=1'],
              ['person_add', 'Nuevo ponente', '/ponentes?invitar=1'],
              ['upload', 'Subir ponencia', '/ponencias?subir=1'],
              ['note_add', 'Nueva memoria', '/memorias-del-evento?nueva=1'],
              ['edit_note', 'Nuevo artículo', '/articulos?nueva=1'],
            ] as const
          ).map(([icono, etiqueta, ruta]) => (
            <button
              key={ruta}
              type="button"
              onClick={() => {
                setCreando(false)
                void navegar(ruta)
              }}
              className="flex h-12 cursor-pointer items-center gap-3 rounded-[24px] px-4 text-left text-[15px] transition-colors hover:bg-panel"
            >
              <Icono nombre={icono} className="text-xl" />
              {etiqueta}
            </button>
          ))}
        </div>
      </Modal>
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
