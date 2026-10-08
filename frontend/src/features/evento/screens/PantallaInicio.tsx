import type { ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { useSession } from '@/features/auth/session'
import { BotonMind, Cifra, EncabezadoDePagina, Icono, Tarjeta } from '../components/piezas'
import { CargaDelEvento } from '../components/CargaDelEvento'
import { estaAprobada, fecha } from '../formato'
import type { DatosDelEvento } from '../tipos'

/*
  El panel del evento. Responde de un vistazo a lo que un organizador
  pregunta primero: a quién le falta consentir, qué textos siguen en
  revisión y qué está listo para entregar.

  El ciclo va de izquierda a derecha en el orden real del trabajo, y cada
  paso cuenta solo lo que el anterior dejó pasar: una ponencia sin
  aprobación no cuenta para la memoria, igual que en la base no entra.
*/
export function PantallaInicio(): ReactElement {
  return <CargaDelEvento>{(datos) => <Inicio datos={datos} />}</CargaDelEvento>
}

function Inicio({ datos }: { datos: DatosDelEvento }): ReactElement {
  const { usuario } = useSession()
  const navegar = useNavigate()
  const { evento, ponentes, ponencias, memorias, producciones, publicaciones } = datos

  const consintieron = ponentes.filter((ponente) => ponente.consentimiento === 'aceptado').length
  const esperando = ponentes.filter((ponente) => ponente.consentimiento === 'enviado')
  const aprobadas = ponencias.filter((ponencia) => estaAprobada(ponencia.aprobacion)).length
  const enRevision = ponencias.filter((ponencia) => ponencia.aprobacion === 'enviada')
  const memoriaGeneral = memorias.find((memoria) => memoria.alcance === 'evento')
  const programadas = publicaciones.filter((publicacion) => publicacion.estado === 'programada').length

  const ciclo = [
    { icono: 'verified_user', titulo: 'Consentimiento', valor: `${consintieron}/${ponentes.length}`, ruta: '/ponentes' },
    { icono: 'graphic_eq', titulo: 'Transcripción', valor: `${ponencias.length}/${ponencias.length}`, ruta: '/ponencias' },
    { icono: 'description', titulo: 'Memorias', valor: `${memorias.filter((memoria) => memoria.alcance === 'ponencia').length}`, ruta: '/memorias-del-evento' },
    { icono: 'task_alt', titulo: 'Aprobación', valor: `${aprobadas}/${ponencias.length}`, ruta: '/ponencias' },
    { icono: 'school', titulo: 'Producción', valor: `${producciones.length}`, ruta: '/produccion' },
    { icono: 'campaign', titulo: 'Difusión', valor: `${publicaciones.length}`, ruta: '/publicaciones' },
  ]

  return (
    <div className="flex flex-col gap-4">
      <EncabezadoDePagina titulo="Inicio">
        <BotonMind icono="person_add" onClick={() => void navegar('/ponentes?invitar=1')}>
          Invitar ponente
        </BotonMind>
      </EncabezadoDePagina>

      <div className="entrar-escalonado grid grid-cols-3 gap-2">
        <Tarjeta variante="rellena" className="flex flex-col justify-between gap-6">
          <div className="flex flex-col gap-1">
            <span className="text-2xl font-semibold">Hola {usuario?.nombre.split(' ')[0] ?? ''}</span>
            <span className="text-sm text-texto-tenue">
              {evento.nombre} · {fecha(evento.fechaInicio)} al {fecha(evento.fechaFin)} · {evento.lugar}
            </span>
          </div>
          <Cifra rotulo="El evento tiene" valor={`${ponencias.length} ponencias`} detalle={`${ponentes.length} ponentes`} />
        </Tarjeta>

        <Tarjeta className="flex flex-col justify-between gap-6">
          <span className="text-2xl text-texto-tenue">Consentimientos</span>
          <Cifra
            rotulo="Aceptados"
            valor={`${consintieron} de ${ponentes.length}`}
            detalle={esperando.length === 0 ? 'Nadie pendiente' : `${esperando.length} esperando respuesta`}
          />
        </Tarjeta>

        <Tarjeta className="flex flex-col justify-between gap-6">
          <span className="text-2xl text-texto-tenue">Aprobaciones</span>
          <Cifra
            rotulo="Textos aprobados"
            valor={`${aprobadas} de ${ponencias.length}`}
            detalle={enRevision.length === 0 ? 'Todo aprobado' : `${enRevision.length} en revisión del ponente`}
          />
        </Tarjeta>
      </div>

      {/* El ciclo editorial entero, en el orden del trabajo. */}
      <Tarjeta className="entrar-escalonado flex flex-col gap-5">
        <span className="text-2xl">Ciclo del evento</span>
        <ol className="grid grid-cols-6 gap-2">
          {ciclo.map((paso, indice) => (
            <li key={paso.titulo}>
              <button
                type="button"
                onClick={() => void navegar(paso.ruta)}
                className="group flex w-full cursor-pointer flex-col gap-3 rounded-[20px] bg-panel p-4 text-left transition-colors hover:bg-acento-tenue"
              >
                <span className="flex items-center justify-between">
                  <span className="flex size-10 items-center justify-center rounded-full bg-acento text-acento-contraste">
                    <Icono nombre={paso.icono} className="text-xl" />
                  </span>
                  <span className="text-xs text-texto-tenue">Paso {indice + 1}</span>
                </span>
                <span className="text-sm text-texto-tenue">{paso.titulo}</span>
                <span className="text-[28px] leading-none font-semibold">{paso.valor}</span>
              </button>
            </li>
          ))}
        </ol>
      </Tarjeta>

      <div className="entrar-escalonado grid grid-cols-2 gap-2">
        <Tarjeta className="flex flex-col gap-4">
          <span className="text-2xl">Pendiente</span>
          <ul className="flex flex-col gap-2">
            {esperando.map((ponente) => (
              <FilaPendiente
                key={ponente.id}
                icono="mark_email_unread"
                texto={`${ponente.nombre} no ha respondido la invitación`}
                accion="Ver"
                alPulsar={() => void navegar(`/ponentes?ver=${ponente.id}`)}
              />
            ))}
            {enRevision.map((ponencia) => (
              <FilaPendiente
                key={ponencia.id}
                icono="rate_review"
                texto={`«${ponencia.titulo}» sigue en revisión de ${ponencia.ponente}`}
                accion="Ver"
                alPulsar={() => void navegar(`/ponencias?ver=${ponencia.id}`)}
              />
            ))}
            {esperando.length + enRevision.length === 0 ? (
              <li className="text-sm text-texto-tenue">No hay nada pendiente.</li>
            ) : null}
          </ul>
        </Tarjeta>

        <Tarjeta className="flex flex-col gap-4">
          <span className="text-2xl">Listo para entregar</span>
          <ul className="flex flex-col gap-2">
            {memoriaGeneral === undefined ? null : (
              <FilaPendiente
                icono="menu_book"
                texto="Memoria general del evento"
                accion="Abrir"
                alPulsar={() => void navegar('/memorias-del-evento')}
              />
            )}
            {producciones.map((produccion) => (
              <FilaPendiente
                key={produccion.id}
                icono="article"
                texto={produccion.titulo}
                accion="Abrir"
                alPulsar={() => void navegar(`/produccion?ver=${produccion.id}`)}
              />
            ))}
            <FilaPendiente
              icono="campaign"
              texto={`${publicaciones.length} publicaciones para redes · ${programadas} programadas`}
              accion="Ver"
              alPulsar={() => void navegar('/publicaciones')}
            />
          </ul>
        </Tarjeta>
      </div>
    </div>
  )
}

function FilaPendiente({
  icono,
  texto,
  accion,
  alPulsar,
}: {
  icono: string
  texto: string
  accion: string
  alPulsar: () => void
}): ReactElement {
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-panel py-2 pr-2 pl-4">
      <Icono nombre={icono} relleno={false} className="text-xl text-texto-tenue" />
      <span className="min-w-0 flex-1 truncate text-sm">{texto}</span>
      <button
        type="button"
        onClick={alPulsar}
        className="flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-full px-3 text-sm font-medium transition-colors hover:bg-acento-tenue"
      >
        <Icono nombre="arrow_outward" className="text-base" />
        {accion}
      </button>
    </li>
  )
}
