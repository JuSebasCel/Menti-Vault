import type { ReactElement } from 'react'
import { useRef, useState } from 'react'
import { useSession } from '@/features/auth/session'
import { Modal } from '@/shared/ui'
import { CargaDelEvento } from '../components/CargaDelEvento'
import { Avatar, BotonMind, Chip, Dato, EncabezadoDePagina, Estado, Icono, Tarjeta } from '../components/piezas'
import { fecha, iniciales } from '../formato'
import type { DatosDelEvento } from '../tipos'

/*
  La organización que hace el evento y quiénes trabajan en ella.

  Un congreso lo prepara un equipo, no una persona: la administración invita
  a sus colegas con un rol (administrar, editar o solo consultar) y todos ven
  el mismo evento. Las invitaciones de miembros llegan con las organizaciones
  en la base; aquí se ve el flujo completo.
*/
export function PantallaOrganizacion(): ReactElement {
  return <CargaDelEvento>{(datos) => <Organizacion datos={datos} />}</CargaDelEvento>
}

type Rol = 'administrador' | 'editor' | 'lector'

const ROLES: Record<Rol, { etiqueta: string; detalle: string }> = {
  administrador: { etiqueta: 'Administrador', detalle: 'Invita miembros y gestiona el evento' },
  editor: { etiqueta: 'Editor', detalle: 'Prepara memorias, producción y publicaciones' },
  lector: { etiqueta: 'Lector', detalle: 'Consulta todo, sin cambiar nada' },
}

function Organizacion({ datos }: { datos: DatosDelEvento }): ReactElement {
  const { usuario } = useSession()
  const [invitando, setInvitando] = useState(false)
  const boton = useRef<HTMLButtonElement>(null)

  return (
    <div className="flex flex-col gap-4">
      <EncabezadoDePagina titulo="Organización">
        <BotonMind ref={boton} icono="add" onClick={() => setInvitando(true)}>
          Invitar miembro
        </BotonMind>
      </EncabezadoDePagina>

      <div className="entrar-escalonado grid grid-cols-3 gap-2">
        <Tarjeta variante="rellena" className="col-span-2 flex flex-col gap-5">
          <span className="flex size-14 items-center justify-center rounded-full bg-acento text-acento-contraste">
            <Icono nombre="domain" className="text-3xl" />
          </span>
          <div className="flex flex-col gap-1">
            <span className="text-2xl font-semibold">Equipo de {datos.evento.nombre}</span>
            <span className="text-sm text-texto-tenue">{datos.evento.descripcion}</span>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Dato rotulo="Eventos">1</Dato>
            <Dato rotulo="Fechas">
              {fecha(datos.evento.fechaInicio)} al {fecha(datos.evento.fechaFin)}
            </Dato>
            <Dato rotulo="Modalidad">{datos.evento.lugar}</Dato>
          </div>
        </Tarjeta>
        <Tarjeta className="flex flex-col gap-3">
          <span className="text-2xl text-texto-tenue">Correos del evento</span>
          <div className="mt-auto rounded-2xl bg-panel px-4 py-3 text-sm">{datos.evento.nombre} vía Menti Vault</div>
        </Tarjeta>
      </div>

      <div className="tarjeta-borde overflow-hidden rounded-[24px]">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-filete">
              <th className="px-3 py-3 font-normal">Miembro</th>
              <th className="px-3 py-3 font-normal">Rol</th>
              <th className="px-3 py-3 font-normal">Estado</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="px-3 py-2.5">
                <span className="flex items-center gap-3">
                  <Avatar texto={iniciales(usuario?.nombre ?? '?')} />
                  <span className="flex flex-col">
                    <span>{usuario?.nombre}</span>
                    <span className="text-xs text-texto-tenue">{usuario?.correo}</span>
                  </span>
                </span>
              </td>
              <td className="px-3 py-2.5">Administrador</td>
              <td className="px-3 py-2.5">
                <Estado etiqueta="Activo" tono="verde" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <Modal abierto={invitando} alCerrar={() => setInvitando(false)} titulo="Invitar miembro" anclaEn={boton} ancho="angosto">
        <InvitarMiembro alTerminar={() => setInvitando(false)} />
      </Modal>
    </div>
  )
}

function InvitarMiembro({ alTerminar }: { alTerminar: () => void }): ReactElement {
  const [correo, setCorreo] = useState('')
  const [rol, setRol] = useState<Rol>('editor')
  const [hecho, setHecho] = useState(false)

  if (hecho) {
    return (
      <div className="entrar-escalonado flex flex-col items-center gap-4 py-6 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-acento text-acento-contraste">
          <Icono nombre="check" className="text-3xl" />
        </span>
        <span className="text-[28px] leading-none font-semibold">Invitación lista</span>
        <p className="text-sm text-texto-tenue">
          {correo} entrará como {ROLES[rol].etiqueta.toLowerCase()} cuando acepte.
        </p>
        <BotonMind variante="tenue" onClick={alTerminar} className="w-full justify-center">
          Salir
        </BotonMind>
      </div>
    )
  }

  return (
    <div className="entrar-escalonado flex flex-col gap-5 pb-2">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-texto-tenue">Correo de tu colega</span>
        <input
          type="email"
          value={correo}
          onChange={(evento) => setCorreo(evento.target.value)}
          placeholder="Ej. coordinacion@universidad.edu.co"
          className="h-12 rounded-2xl bg-panel px-4 text-base outline-none shadow-[0_0_0_1px_var(--bitacora-filete-fuerte)] focus:shadow-[0_0_0_3px_var(--mind-tonal),0_0_0_1px_var(--bitacora-filete-fuerte)]"
        />
      </label>
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          {(Object.keys(ROLES) as Rol[]).map((uno) => (
            <Chip key={uno} elegido={rol === uno} onClick={() => setRol(uno)}>
              {ROLES[uno].etiqueta}
            </Chip>
          ))}
        </div>
        <span className="text-sm text-texto-tenue">{ROLES[rol].detalle}</span>
      </div>
      <BotonMind disabled={!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim())} onClick={() => setHecho(true)} className="justify-center">
        Enviar invitación <Icono nombre="send" className="text-lg" />
      </BotonMind>
    </div>
  )
}
