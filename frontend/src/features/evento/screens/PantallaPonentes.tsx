import type { ReactElement } from 'react'
import { useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Modal } from '@/shared/ui'
import { AsistenteDeInvitacion } from '../components/AsistenteDeInvitacion'
import { CargaDelEvento } from '../components/CargaDelEvento'
import { PanelLateral } from '../components/PanelLateral'
import { VistaDelPonente } from '../components/VistaDelPonente'
import { Avatar, BotonMind, Chip, Cifra, Dato, EncabezadoDePagina, Estado, Icono, Tarjeta } from '../components/piezas'
import { CONSENTIMIENTO, APROBACION, fechaYHora, iniciales, mismoPonente } from '../formato'
import { USOS_DEL_CONSENTIMIENTO } from '../tipos'
import type { DatosDelEvento, Ponente } from '../tipos'

/*
  Los ponentes del evento y lo que cada uno autorizó.

  El consentimiento es por usos y se ve por usos: decir "consintió" sin decir
  a qué invitaría a usar una cita en redes de alguien que solo autorizó la
  memoria. Por eso el detalle enseña la lista entera, con lo que no aceptó
  tachado, y la producción y las publicaciones la respetan.
*/
export function PantallaPonentes(): ReactElement {
  return <CargaDelEvento>{(datos) => <Ponentes datos={datos} />}</CargaDelEvento>
}

type Filtro = 'todos' | 'aceptado' | 'enviado' | 'sin-enviar'

function Ponentes({ datos }: { datos: DatosDelEvento }): ReactElement {
  const [parametros, setParametros] = useSearchParams()
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [origen, setOrigen] = useState<DOMRect | null>(null)
  const botonInvitar = useRef<HTMLButtonElement>(null)

  const idAbierto = parametros.get('ver')
  const invitando = parametros.get('invitar') === '1'
  const abierto = datos.ponentes.find((ponente) => ponente.id === idAbierto) ?? null

  const visibles = useMemo(
    () => datos.ponentes.filter((ponente) => filtro === 'todos' || ponente.consentimiento === filtro),
    [datos.ponentes, filtro],
  )

  const cuenta = (estado: Ponente['consentimiento']): number =>
    datos.ponentes.filter((ponente) => ponente.consentimiento === estado).length

  const cambiar = (clave: string, valor: string | null): void => {
    const siguientes = new URLSearchParams(parametros)
    if (valor === null) {
      siguientes.delete(clave)
    } else {
      siguientes.set(clave, valor)
    }
    setParametros(siguientes, { replace: true })
  }

  return (
    <div className="flex flex-col gap-4">
      <EncabezadoDePagina titulo="Ponentes">
        <BotonMind ref={botonInvitar} icono="add" onClick={() => cambiar('invitar', '1')}>
          Invitar ponente
        </BotonMind>
      </EncabezadoDePagina>

      <div className="entrar-escalonado grid grid-cols-4 gap-2">
        <Tarjeta variante="rellena">
          <Cifra rotulo="Totales" valor={datos.ponentes.length} />
        </Tarjeta>
        <Tarjeta variante="rellena">
          <Cifra rotulo="Consintieron" valor={cuenta('aceptado')} />
        </Tarjeta>
        <Tarjeta variante="rellena">
          <Cifra rotulo="Esperando respuesta" valor={cuenta('enviado')} />
        </Tarjeta>
        <Tarjeta variante="rellena">
          <Cifra rotulo="Sin invitar" valor={cuenta('sin-enviar')} />
        </Tarjeta>
      </div>

      <div className="flex gap-2">
        {(
          [
            ['todos', 'Todos'],
            ['aceptado', 'Consintieron'],
            ['enviado', 'Esperando'],
            ['sin-enviar', 'Sin invitar'],
          ] as const
        ).map(([valor, etiqueta]) => (
          <Chip key={valor} elegido={filtro === valor} onClick={() => setFiltro(valor)}>
            {etiqueta}
          </Chip>
        ))}
      </div>

      <div className="tarjeta-borde overflow-hidden rounded-[24px]">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-filete text-texto">
              <th className="px-3 py-3 font-normal">Nombre</th>
              <th className="px-3 py-3 font-normal">Ponencias</th>
              <th className="px-3 py-3 font-normal">Consentimiento</th>
              <th className="px-3 py-3 font-normal">Usos autorizados</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {visibles.map((ponente) => {
              const ponencias = datos.ponencias.filter((ponencia) => mismoPonente(ponencia.ponente, ponente.nombre))
              const autorizados = Object.values(ponente.usos).filter(Boolean).length
              return (
                <tr key={ponente.id} className="border-b border-filete last:border-0">
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-3">
                      <Avatar texto={iniciales(ponente.nombre)} />
                      {ponente.nombre}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-texto-tenue">{ponencias.length}</td>
                  <td className="px-3 py-2.5">
                    <Estado {...CONSENTIMIENTO[ponente.consentimiento]} />
                  </td>
                  <td className="px-3 py-2.5 text-texto-tenue">
                    {ponente.consentimiento === 'aceptado' ? `${autorizados} de ${USOS_DEL_CONSENTIMIENTO.length}` : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={(evento) => {
                        setOrigen(evento.currentTarget.getBoundingClientRect())
                        cambiar('ver', ponente.id)
                      }}
                      className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-full px-3 font-medium transition-colors hover:bg-[var(--mind-neutro)]"
                    >
                      <Icono nombre="arrow_outward" className="text-base" />
                      Abrir
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <PanelLateral
        abierto={abierto !== null}
        alCerrar={() => cambiar('ver', null)}
        origen={origen}
        titulo={abierto?.nombre ?? 'Ponente'}
      >
        {abierto === null ? null : <DetalleDelPonente ponente={abierto} datos={datos} />}
      </PanelLateral>

      <Modal
        abierto={invitando}
        alCerrar={() => cambiar('invitar', null)}
        titulo="Invitar ponente"
        anclaEn={botonInvitar}
        ancho="normal"
        cerrarAlPulsarElVelo={false}
      >
        <AsistenteDeInvitacion datos={datos} alTerminar={() => cambiar('invitar', null)} />
      </Modal>
    </div>
  )
}

function DetalleDelPonente({ ponente, datos }: { ponente: Ponente; datos: DatosDelEvento }): ReactElement {
  const [pestana, setPestana] = useState<'consentimiento' | 'ponencias'>('consentimiento')
  const [viendoLoQueRecibe, setViendoLoQueRecibe] = useState(false)
  const botonVista = useRef<HTMLButtonElement>(null)
  const ponencias = datos.ponencias.filter((ponencia) => mismoPonente(ponencia.ponente, ponente.nombre))

  return (
    <div className="entrar-escalonado flex flex-col gap-2 pt-2">
      <Tarjeta variante="rellena" className="flex flex-col gap-5">
        <div className="flex items-start justify-between">
          <Avatar texto={iniciales(ponente.nombre)} grande />
          <Estado {...CONSENTIMIENTO[ponente.consentimiento]} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-2xl font-medium">{ponente.nombre}</span>
          <span className="text-sm text-texto-tenue">{ponente.correo ?? 'Sin correo registrado'}</span>
        </div>
        <div className="flex gap-2">
          <BotonMind ref={botonVista} icono="visibility" onClick={() => setViendoLoQueRecibe(true)}>
            Ver lo que recibe
          </BotonMind>
          {ponente.consentimiento === 'aceptado' ? null : (
            <BotonMind variante="tenue" icono="send">
              Reenviar invitación
            </BotonMind>
          )}
        </div>
      </Tarjeta>

      <div className="flex gap-2 py-2">
        <Chip elegido={pestana === 'consentimiento'} onClick={() => setPestana('consentimiento')}>
          Consentimiento
        </Chip>
        <Chip elegido={pestana === 'ponencias'} onClick={() => setPestana('ponencias')}>
          Ponencias ({ponencias.length})
        </Chip>
      </div>

      {pestana === 'consentimiento' ? (
        <Tarjeta className="flex flex-col gap-5">
          <span className="text-2xl">Qué autorizó</span>
          {ponente.consentimiento === 'aceptado' ? (
            <ul className="flex flex-col gap-2">
              {USOS_DEL_CONSENTIMIENTO.map((uso) => {
                const si = ponente.usos[uso.clave] === true
                return (
                  <li key={uso.clave} className="flex items-center gap-3 rounded-2xl bg-panel px-4 py-3">
                    <Icono
                      nombre={si ? 'check_circle' : 'cancel'}
                      className={`text-xl ${si ? 'text-validado' : 'text-error'}`}
                    />
                    <span className={si ? '' : 'text-texto-tenue line-through'}>{uso.etiqueta}</span>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-texto-tenue">
              {ponente.consentimiento === 'enviado' ? 'Sin respuesta todavía.' : 'Sin invitar.'}
            </p>
          )}
          <div className="grid grid-cols-3 gap-4">
            <Dato rotulo="Invitación enviada">{fechaYHora(ponente.enviadoEl)}</Dato>
            <Dato rotulo="Respondió">{fechaYHora(ponente.respondidoEl)}</Dato>
            <Dato rotulo="Versión del texto">{ponente.versionDelConsentimiento ?? '—'}</Dato>
          </div>
        </Tarjeta>
      ) : (
        <Tarjeta className="flex flex-col gap-2">
          {ponencias.map((ponencia) => (
            <div key={ponencia.id} className="flex items-center justify-between gap-3 rounded-2xl bg-panel px-4 py-3">
              <div className="flex min-w-0 flex-col">
                <span className="truncate">{ponencia.titulo}</span>
                <span className="text-sm text-texto-tenue">{ponencia.agrupacion}</span>
              </div>
              <Estado {...APROBACION[ponencia.aprobacion]} />
            </div>
          ))}
        </Tarjeta>
      )}

      <Modal
        abierto={viendoLoQueRecibe}
        alCerrar={() => setViendoLoQueRecibe(false)}
        titulo={`Lo que recibe ${ponente.nombre.split(' ')[0] ?? ''}`}
        anclaEn={botonVista}
        ancho="normal"
      >
        <VistaDelPonente ponente={ponente} datos={datos} />
      </Modal>
    </div>
  )
}
