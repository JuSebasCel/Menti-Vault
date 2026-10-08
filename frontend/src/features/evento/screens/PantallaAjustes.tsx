import type { ReactElement, ReactNode } from 'react'
import { useState } from 'react'
import { useSession } from '@/features/auth/session'
import { cambiarCierreDelSitio, useCierreDelSitio } from '@/features/configuracion/cierreDelSitio'
import { invalidarCacheConPrefijo } from '@/shared/cache/useConsultaCacheada'
import { mensajeDeError } from '@/shared/errors'
import { useTema } from '@/shared/tema'
import type { Tema } from '@/shared/tema'
import { CargaDelEvento } from '../components/CargaDelEvento'
import { Avatar, BotonMind, Chip, EncabezadoDePagina, Icono, Tarjeta } from '../components/piezas'
import { iniciales } from '../formato'
import { actualizarEvento } from '../repositorio'
import { CLAVE_DEL_EVENTO } from '../useEvento'
import type { DatosDelEvento } from '../tipos'

/*
  Ajustes, dentro del armazón nuevo: el evento, la apariencia, quién puede
  entrar y la cuenta. Las claves de IA salen de aquí porque las pone la
  plataforma, no cada persona.
*/
export function PantallaAjustes(): ReactElement {
  return <CargaDelEvento>{(datos) => <Ajustes datos={datos} />}</CargaDelEvento>
}

function Ajustes({ datos }: { datos: DatosDelEvento }): ReactElement {
  const { usuario, cerrarSesion } = useSession()
  const { tema, establecerTema } = useTema()
  const cierre = useCierreDelSitio(usuario?.id ?? '')

  return (
    <div className="flex flex-col gap-4">
      <EncabezadoDePagina titulo="Ajustes" />

      <div className="entrar-escalonado grid grid-cols-2 gap-2">
        <Seccion titulo="Evento" icono="event">
          <FormularioDelEvento datos={datos} />
        </Seccion>

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

function FormularioDelEvento({ datos }: { datos: DatosDelEvento }): ReactElement {
  const [valores, setValores] = useState({
    descripcion: datos.evento.descripcion,
    lugar: datos.evento.lugar,
    fechaInicio: datos.evento.fechaInicio ?? '',
    fechaFin: datos.evento.fechaFin ?? '',
  })
  const [estado, setEstado] = useState<'quieto' | 'guardando' | 'guardado'>('quieto')
  const [error, setError] = useState<string | null>(null)

  const guardar = async (): Promise<void> => {
    setEstado('guardando')
    setError(null)
    const resultado = await actualizarEvento(datos.evento.id, valores)
    if (!resultado.ok) {
      setError(mensajeDeError(resultado.codigo))
      setEstado('quieto')
      return
    }
    invalidarCacheConPrefijo(CLAVE_DEL_EVENTO)
    setEstado('guardado')
  }

  const campo = 'h-12 rounded-2xl bg-panel px-4 text-base text-texto shadow-[0_0_0_1px_var(--bitacora-filete-fuerte)] outline-none transition-shadow duration-500 focus:shadow-[0_0_0_3px_var(--mind-tonal),0_0_0_1px_var(--bitacora-filete-fuerte)]'

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-texto-tenue">Nombre</span>
        <input value={datos.evento.nombre} disabled className={`${campo} opacity-70`} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-texto-tenue">Descripción</span>
        <textarea
          rows={3}
          value={valores.descripcion}
          onChange={(evento) => setValores({ ...valores, descripcion: evento.target.value })}
          className={`${campo} h-auto resize-none py-3`}
        />
      </label>
      <div className="grid grid-cols-3 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-texto-tenue">Empieza</span>
          <input type="date" value={valores.fechaInicio} onChange={(evento) => setValores({ ...valores, fechaInicio: evento.target.value })} className={campo} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-texto-tenue">Termina</span>
          <input type="date" value={valores.fechaFin} onChange={(evento) => setValores({ ...valores, fechaFin: evento.target.value })} className={campo} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-texto-tenue">Lugar</span>
          <input value={valores.lugar} onChange={(evento) => setValores({ ...valores, lugar: evento.target.value })} className={campo} />
        </label>
      </div>
      {error === null ? null : <p className="rounded-2xl bg-[var(--mind-alerta)] px-4 py-3 text-sm [color:var(--mind-alerta-texto)]">{error}</p>}
      <BotonMind disabled={estado === 'guardando'} onClick={() => void guardar()} className="w-fit">
        {estado === 'guardando' ? 'Guardando…' : estado === 'guardado' ? 'Guardado' : 'Guardar'}
      </BotonMind>
    </div>
  )
}
