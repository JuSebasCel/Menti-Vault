import type { ReactElement } from 'react'
import { useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { mensajeDeError } from '@/shared/errors'
import { Modal } from '@/shared/ui'
import { AsistenteDeInvitacion } from '../components/AsistenteDeInvitacion'
import { anclaDelDock } from '../anclaDelDock'
import { CargaDelEvento } from '../components/CargaDelEvento'
import { Filtros } from '../components/Filtros'
import { PanelLateral } from '../components/PanelLateral'
import { VistaDelPonente } from '../components/VistaDelPonente'
import { Avatar, BotonMind, Chip, Cifra, Dato, EncabezadoDePagina, Estado, Icono, Tarjeta } from '../components/piezas'
import { APROBACION, CONSENTIMIENTO, fechaYHora, iniciales, mismoPonente } from '../formato'
import { actualizarPonente, eliminarPonente } from '../repositorio'
import { useEvento } from '../useEvento'
import { USOS_DEL_CONSENTIMIENTO } from '../tipos'
import type { DatosDelEvento, Ponente } from '../tipos'

/*
  Los ponentes del evento y lo que cada uno autorizó.

  Un ponente se agrega ya invitado: "Nuevo ponente" pide nombre, correo y los
  usos, y envía la invitación en el mismo paso. No existe un ponente "por
  invitar" esperando en el directorio, porque no hay nada que hacer con él
  hasta que se le pide la autorización.

  La autorización es por usos y se ve por usos: decir "autorizó" sin decir a
  qué invitaría a usar una cita en redes de alguien que solo autorizó la
  memoria.
*/
export function PantallaPonentes(): ReactElement {
  return <CargaDelEvento>{(datos) => <Ponentes datos={datos} />}</CargaDelEvento>
}

type Filtro = 'todos' | 'aceptado' | 'enviado' | 'rechazado'
type Orden = 'nombre' | 'ponencias'

function Ponentes({ datos }: { datos: DatosDelEvento }): ReactElement {
  const [parametros, setParametros] = useSearchParams()
  const desdeDock = parametros.get('desde') === 'dock'
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [orden, setOrden] = useState<Orden>('nombre')
  const [origen, setOrigen] = useState<DOMRect | null>(null)
  const botonNuevo = useRef<HTMLButtonElement>(null)

  const idAbierto = parametros.get('ver')
  const invitar = parametros.get('invitar')
  const abierto = datos.ponentes.find((ponente) => ponente.id === idAbierto) ?? null

  const visibles = useMemo(() => {
    const ponenciasDe = (ponente: Ponente): number =>
      datos.ponencias.filter((ponencia) => mismoPonente(ponencia.ponente, ponente.nombre)).length
    const filtrados = datos.ponentes.filter(
      (ponente) =>
        filtro === 'todos' || ponente.consentimiento === filtro || (filtro === 'enviado' && ponente.consentimiento === 'sin-enviar'),
    )
    return orden === 'nombre' ? filtrados : [...filtrados].sort((uno, otro) => ponenciasDe(otro) - ponenciasDe(uno))
  }, [datos.ponentes, datos.ponencias, filtro, orden])

  const ponenciasDe = (ponente: Ponente): number =>
    datos.ponencias.filter((ponencia) => mismoPonente(ponencia.ponente, ponente.nombre)).length
  const cuenta = (estado: Ponente['consentimiento']): number => datos.ponentes.filter((ponente) => ponente.consentimiento === estado).length

  const cambiar = (clave: string, valor: string | null): void => {
    const siguientes = new URLSearchParams(parametros)
    if (valor === null) {
      siguientes.delete(clave)
      siguientes.delete('desde')
    } else {
      siguientes.set(clave, valor)
    }
    setParametros(siguientes, { replace: true })
  }

  return (
    <div className="flex flex-col gap-4">
      <EncabezadoDePagina titulo="Ponentes">
        <Filtros
          grupos={[
            {
              clave: 'autorizacion',
              rotulo: 'Autorización',
              icono: 'verified_user',
              valor: filtro,
              porDefecto: 'todos',
              alCambiar: (valor) => setFiltro(valor as Filtro),
              opciones: [
                { valor: 'todos', etiqueta: 'Todas' },
                { valor: 'aceptado', etiqueta: 'Autorizó' },
                { valor: 'enviado', etiqueta: 'Esperando respuesta' },
                { valor: 'rechazado', etiqueta: 'No autorizó' },
              ],
            },
            {
              clave: 'orden',
              rotulo: 'Ordenar por',
              icono: 'sort',
              valor: orden,
              porDefecto: 'nombre',
              alCambiar: (valor) => setOrden(valor as Orden),
              opciones: [
                { valor: 'nombre', etiqueta: 'Nombre' },
                { valor: 'ponencias', etiqueta: 'Ponencias' },
              ],
            },
          ]}
        />
        <BotonMind ref={botonNuevo} icono="add" onClick={() => cambiar('invitar', '1')}>
          Nuevo ponente
        </BotonMind>
      </EncabezadoDePagina>

      <div className="entrar-escalonado grid grid-cols-4 gap-2">
        <Tarjeta variante="rellena">
          <Cifra rotulo="Totales" valor={datos.ponentes.length} />
        </Tarjeta>
        <Tarjeta variante="rellena">
          <Cifra rotulo="Autorizaron" valor={cuenta('aceptado')} />
        </Tarjeta>
        <Tarjeta variante="rellena">
          <Cifra rotulo="Esperando respuesta" valor={cuenta('enviado') + cuenta('sin-enviar')} />
        </Tarjeta>
        <Tarjeta variante="rellena">
          <Cifra rotulo="No autorizaron" valor={cuenta('rechazado')} />
        </Tarjeta>
      </div>

      <div className="tarjeta-borde overflow-hidden rounded-[24px]">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-filete text-texto">
              <th className="px-3 py-3 font-normal">Nombre</th>
              <th className="px-3 py-3 font-normal">Ponencias</th>
              <th className="px-3 py-3 font-normal">Autorización</th>
              <th className="px-3 py-3 font-normal">Usos autorizados</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {visibles.map((ponente) => (
              <tr key={ponente.id} className="border-b border-filete last:border-0">
                <td className="px-3 py-2.5">
                  <span className="flex items-center gap-3">
                    <Avatar texto={iniciales(ponente.nombre)} />
                    <span className="flex flex-col">
                      <span>{ponente.nombre}</span>
                      <span className="text-xs text-texto-tenue">{ponente.correo ?? 'Sin correo'}</span>
                    </span>
                  </span>
                </td>
                <td className="px-3 py-2.5">{ponenciasDe(ponente)}</td>
                <td className="px-3 py-2.5">
                  <Estado {...CONSENTIMIENTO[ponente.consentimiento]} />
                </td>
                <td className="px-3 py-2.5">
                  {ponente.consentimiento === 'aceptado'
                    ? `${Object.values(ponente.usos).filter(Boolean).length} de ${USOS_DEL_CONSENTIMIENTO.length}`
                    : '—'}
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
            ))}
          </tbody>
        </table>
      </div>

      <PanelLateral abierto={abierto !== null} alCerrar={() => cambiar('ver', null)} origen={origen} titulo={abierto?.nombre ?? 'Ponente'}>
        {abierto === null ? null : (
          <DetalleDelPonente
            key={abierto.id}
            ponente={abierto}
            datos={datos}
            alReenviar={() => cambiar('invitar', abierto.id)}
            alEliminar={() => cambiar('ver', null)}
          />
        )}
      </PanelLateral>

      <Modal
        abierto={invitar !== null}
        alCerrar={() => cambiar('invitar', null)}
        titulo={invitar === '1' ? 'Nuevo ponente' : 'Reenviar invitación'}
        anclaEn={desdeDock ? anclaDelDock : botonNuevo}
        anclaje="disparador"
        {...(desdeDock ? { crecerHacia: 'derecha' as const } : {})}
        ancho="normal"
        cerrarAlPulsarElVelo={false}
      >
        <AsistenteDeInvitacion
          key={invitar ?? ''}
          datos={datos}
          idInicial={invitar === '1' ? null : invitar}
          alTerminar={() => cambiar('invitar', null)}
        />
      </Modal>
    </div>
  )
}

const CAMPO =
  'h-12 rounded-2xl bg-panel px-4 text-base text-texto shadow-[0_0_0_1px_var(--bitacora-filete-fuerte)] outline-none transition-shadow duration-500 focus:shadow-[0_0_0_3px_var(--mind-tonal),0_0_0_1px_var(--bitacora-filete-fuerte)]'

function DetalleDelPonente({
  ponente,
  datos,
  alReenviar,
  alEliminar,
}: {
  ponente: Ponente
  datos: DatosDelEvento
  alReenviar: () => void
  alEliminar: () => void
}): ReactElement {
  const { invalidar } = useEvento()
  const [pestana, setPestana] = useState<'autorizacion' | 'ponencias' | 'editar'>('autorizacion')
  const [viendoLoQueRecibe, setViendoLoQueRecibe] = useState(false)
  const [valores, setValores] = useState({ nombre: ponente.nombre, correo: ponente.correo ?? '', institucion: ponente.institucion })
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const botonVista = useRef<HTMLButtonElement>(null)
  const ponencias = datos.ponencias.filter((ponencia) => mismoPonente(ponencia.ponente, ponente.nombre))
  const aceptado = ponente.consentimiento === 'aceptado'

  const guardar = async (): Promise<void> => {
    setError(null)
    const resultado = await actualizarPonente(ponente, datos.evento.nombre, {
      nombre: valores.nombre.trim(),
      correo: valores.correo.trim(),
      institucion: valores.institucion.trim(),
    })
    if (!resultado.ok) {
      setError(mensajeDeError(resultado.codigo))
      return
    }
    invalidar()
    setPestana('autorizacion')
  }

  const borrar = async (): Promise<void> => {
    const resultado = await eliminarPonente(ponente.id)
    if (!resultado.ok) {
      setError(mensajeDeError(resultado.codigo))
      return
    }
    invalidar()
    alEliminar()
  }

  return (
    <div className="entrar-escalonado flex flex-col gap-2 pt-2">
      <Tarjeta variante="rellena" className="flex flex-col gap-5">
        <div className="flex items-start justify-between">
          <Avatar texto={iniciales(ponente.nombre)} grande />
          <Estado {...CONSENTIMIENTO[ponente.consentimiento]} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-2xl font-medium">{ponente.nombre}</span>
          <span className="text-sm text-texto-tenue">
            {[ponente.correo ?? 'Sin correo', ponente.institucion].filter((parte) => parte !== '').join(' · ')}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <BotonMind ref={botonVista} icono="visibility" onClick={() => setViendoLoQueRecibe(true)}>
            Ver lo que recibe
          </BotonMind>
          {aceptado ? null : (
            <BotonMind variante="tenue" icono="send" onClick={alReenviar}>
              Reenviar invitación
            </BotonMind>
          )}
          <BotonMind variante="tenue" icono="edit" onClick={() => setPestana('editar')}>
            Editar
          </BotonMind>
        </div>
      </Tarjeta>

      <div className="flex gap-2 py-2">
        <Chip elegido={pestana === 'autorizacion'} onClick={() => setPestana('autorizacion')}>
          Autorización
        </Chip>
        <Chip elegido={pestana === 'ponencias'} onClick={() => setPestana('ponencias')}>
          Ponencias ({ponencias.length})
        </Chip>
        <Chip elegido={pestana === 'editar'} onClick={() => setPestana('editar')}>
          Editar
        </Chip>
      </div>

      {pestana === 'autorizacion' ? (
        <Tarjeta className="flex flex-col gap-5">
          {aceptado ? (
            <ul className="flex flex-col gap-2">
              {USOS_DEL_CONSENTIMIENTO.map((uso) => {
                const si = ponente.usos[uso.clave] === true
                return (
                  <li key={uso.clave} className="flex items-center gap-3 rounded-2xl bg-panel px-4 py-3">
                    <Icono
                      nombre={si ? 'check_circle' : 'cancel'}
                      className={`text-xl ${si ? '[color:var(--tono-verde-texto)]' : '[color:var(--tono-rojo-texto)]'}`}
                    />
                    <span className={si ? '' : 'text-texto-tenue line-through'}>{uso.etiqueta}</span>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-texto-tenue">
              {ponente.consentimiento === 'rechazado'
                ? 'No autorizó el uso de su ponencia.'
                : 'Recibió la invitación y todavía no responde. Hasta que autorice, su ponencia no entra en memorias, artículos ni redes.'}
            </p>
          )}
          <div className="grid grid-cols-3 gap-4">
            <Dato rotulo="Invitación enviada">{fechaYHora(ponente.enviadoEl)}</Dato>
            <Dato rotulo="Respondió">{fechaYHora(ponente.respondidoEl)}</Dato>
            <Dato rotulo="Versión del texto">{ponente.versionDelConsentimiento ?? '—'}</Dato>
          </div>
        </Tarjeta>
      ) : null}

      {pestana === 'ponencias' ? (
        <Tarjeta className="flex flex-col gap-2">
          {ponencias.map((ponencia) => (
            <div key={ponencia.id} className="flex flex-col gap-2 rounded-2xl bg-panel px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate">{ponencia.titulo}</span>
                <Estado {...APROBACION[ponencia.aprobacion]} />
              </div>
              {ponencia.comentarioDelPonente === '' ? null : (
                <span className="text-sm [color:var(--tono-azul-texto)]">Pidió cambiar: «{ponencia.comentarioDelPonente}»</span>
              )}
            </div>
          ))}
          {ponencias.length === 0 ? <p className="text-texto-tenue">Todavía no tiene ponencias en el evento.</p> : null}
        </Tarjeta>
      ) : null}

      {pestana === 'editar' ? (
        <Tarjeta className="flex flex-col gap-4">
          {(
            [
              ['nombre', 'Nombre completo'],
              ['correo', 'Correo'],
              ['institucion', 'Institución'],
            ] as const
          ).map(([clave, rotulo]) => (
            <label key={clave} className="flex flex-col gap-1.5">
              <span className="text-xs text-texto-tenue">{rotulo}</span>
              <input
                value={valores[clave]}
                onChange={(evento) => setValores({ ...valores, [clave]: evento.target.value })}
                className={CAMPO}
              />
            </label>
          ))}
          {error === null ? null : (
            <p className="rounded-2xl bg-[var(--tono-rojo)] px-4 py-3 text-sm [color:var(--tono-rojo-texto)]">{error}</p>
          )}
          <div className="flex items-center justify-between gap-2 pt-2">
            {confirmandoBorrado ? (
              <span className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void borrar()}
                  className="flex h-10 cursor-pointer items-center gap-2 rounded-full bg-[var(--tono-rojo)] px-5 text-sm font-medium [color:var(--tono-rojo-texto)]"
                >
                  <Icono nombre="delete" className="text-lg" /> Sí, eliminar
                </button>
                <BotonMind variante="tenue" onClick={() => setConfirmandoBorrado(false)}>
                  No
                </BotonMind>
              </span>
            ) : (
              <BotonMind variante="tenue" icono="delete" onClick={() => setConfirmandoBorrado(true)}>
                Eliminar ponente
              </BotonMind>
            )}
            <BotonMind disabled={valores.nombre.trim() === ''} onClick={() => void guardar()}>
              Guardar
            </BotonMind>
          </div>
          {confirmandoBorrado && ponencias.length > 0 ? (
            <p className="text-sm text-texto-tenue">Sus {ponencias.length} ponencias se quedan en el evento, sin ficha de ponente.</p>
          ) : null}
        </Tarjeta>
      ) : null}

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
