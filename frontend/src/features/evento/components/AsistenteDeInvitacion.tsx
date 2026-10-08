import type { ReactElement, ReactNode } from 'react'
import { useState } from 'react'
import { mensajeDeError } from '@/shared/errors'
import { fecha } from '../formato'
import { useEvento } from '../useEvento'
import { asignarPonente, crearPonenteInvitado, registrarInvitacion } from '../repositorio'
import { USOS_DEL_CONSENTIMIENTO } from '../tipos'
import type { DatosDelEvento, UsoDelConsentimiento } from '../tipos'
import { BotonMind, Icono } from './piezas'
import { CorreoDeInvitacion } from './VistaDelPonente'

/*
  Invitar a un ponente, por pasos como en la referencia: quién, a qué correo,
  qué usos se le piden, y un resumen con el correo tal como le va a llegar.

  Los usos vienen todos marcados porque es lo habitual, pero se pueden
  quitar uno por uno: un evento que no va a publicar en redes no tiene por qué
  pedir ese permiso, y pedir de más es lo que hace que la gente diga que no.
*/
type Paso = 'quien' | 'sesion' | 'correo' | 'usos' | 'resumen' | 'hecho'

export function AsistenteDeInvitacion({
  datos,
  idInicial = null,
  alTerminar,
}: {
  datos: DatosDelEvento
  /** El ponente ya elegido cuando se invita desde su fila: el asistente empieza en el correo. */
  idInicial?: string | null
  alTerminar: () => void
}): ReactElement {
  const { invalidar: refrescar } = useEvento()
  const [paso, setPaso] = useState<Paso>(idInicial === null ? 'quien' : 'correo')
  const [idPonente] = useState<string | null>(idInicial)
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [correo, setCorreo] = useState(datos.ponentes.find((ponente) => ponente.id === idInicial)?.correo ?? '')
  const [usos, setUsos] = useState<UsoDelConsentimiento[]>(USOS_DEL_CONSENTIMIENTO.map((uso) => uso.clave))
  const [idSesion, setIdSesion] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nombre = idPonente === null ? nombreNuevo.trim() : (datos.ponentes.find((ponente) => ponente.id === idPonente)?.nombre ?? '')
  const correoValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim())

  const enviar = async (): Promise<void> => {
    setEnviando(true)
    setError(null)
    const resultado =
      idPonente === null
        ? await crearPonenteInvitado(datos.evento.id, nombre, correo.trim(), usos)
        : await registrarInvitacion(idPonente, correo.trim(), usos)
    setEnviando(false)
    if (!resultado.ok) {
      setError(mensajeDeError(resultado.codigo))
      return
    }
    if (idSesion !== null) {
      await asignarPonente(idSesion, nombre)
    }
    refrescar()
    setPaso('hecho')
  }

  return (
    <div key={paso} className="entrar-escalonado flex flex-col items-center gap-6 px-6 pt-2 pb-4 text-center">
      {paso === 'quien' ? (
        <>
          <Cabecera icono="person_add" titulo="Nuevo ponente" texto="Quién va a participar." />
          <div className="flex w-full max-w-sm flex-col gap-3 text-left">
            <Campo valor={nombreNuevo} alCambiar={setNombreNuevo} rotulo="Nombre completo" ejemplo="Ej. Ana López" />
          </div>
          <Botonera>
            <BotonMind disabled={nombre === ''} onClick={() => setPaso('sesion')} className="w-full justify-center">
              Continuar <Icono nombre="arrow_forward" className="text-lg" />
            </BotonMind>
          </Botonera>
        </>
      ) : null}

      {paso === 'sesion' ? (
        <>
          <Cabecera icono="event" titulo="Su sesión" texto="Elige la sesión de la agenda que va a dar." />
          <div className="flex max-h-72 w-full max-w-md flex-col gap-2 overflow-y-auto text-left">
            {datos.ponencias
              .filter((ponencia) => ponencia.horaInicio !== null)
              .map((ponencia) => (
                <button
                  key={ponencia.id}
                  type="button"
                  onClick={() => setIdSesion(idSesion === ponencia.id ? null : ponencia.id)}
                  className={`flex cursor-pointer flex-col rounded-2xl px-4 py-3 text-left transition-colors ${idSesion === ponencia.id ? 'bg-acento text-acento-contraste' : 'bg-panel hover:bg-[var(--mind-variante)]'}`}
                >
                  <span className="truncate font-medium">{ponencia.titulo}</span>
                  <span className={`text-sm ${idSesion === ponencia.id ? 'opacity-70' : 'text-texto-tenue'}`}>
                    {fecha(ponencia.fecha)} · {ponencia.horaInicio} · {ponencia.ponente || 'sin ponente'}
                  </span>
                </button>
              ))}
          </div>
          <Botonera>
            <BotonMind variante="tenue" icono="arrow_back" onClick={() => setPaso('quien')}>
              Atrás
            </BotonMind>
            <BotonMind onClick={() => setPaso('correo')}>
              {idSesion === null ? 'La asigno después' : 'Continuar'} <Icono nombre="arrow_forward" className="text-lg" />
            </BotonMind>
          </Botonera>
        </>
      ) : null}

      {paso === 'correo' ? (
        <>
          <Cabecera icono="mail" titulo="Contacto" texto="A dónde le llega la solicitud de autorización." />
          <div className="w-full max-w-sm text-left">
            <Campo valor={correo} alCambiar={setCorreo} rotulo="Correo electrónico" ejemplo="Ej. ana@universidad.edu.co" tipo="email" />
          </div>
          <Botonera>
            {idInicial === null ? (
              <BotonMind variante="tenue" icono="arrow_back" onClick={() => setPaso('sesion')}>
                Atrás
              </BotonMind>
            ) : (
              <span />
            )}
            <BotonMind disabled={!correoValido} onClick={() => setPaso('usos')}>
              Continuar <Icono nombre="arrow_forward" className="text-lg" />
            </BotonMind>
          </Botonera>
        </>
      ) : null}

      {paso === 'usos' ? (
        <>
          <Cabecera icono="verified_user" titulo="Su autorización" texto="Le llegará un correo para que autorice cómo usaremos su ponencia. Quita lo que no vayas a hacer." />
          <div className="flex w-full max-w-md flex-col gap-2 text-left">
            {USOS_DEL_CONSENTIMIENTO.map((uso) => {
              const marcado = usos.includes(uso.clave)
              return (
                <button
                  key={uso.clave}
                  type="button"
                  onClick={() => setUsos(marcado ? usos.filter((otro) => otro !== uso.clave) : [...usos, uso.clave])}
                  className="flex cursor-pointer items-center gap-3 rounded-2xl bg-panel px-4 py-3 text-left transition-colors hover:bg-acento-tenue"
                >
                  <Icono nombre={marcado ? 'check_box' : 'check_box_outline_blank'} className="text-xl" />
                  {uso.etiqueta}
                </button>
              )
            })}
          </div>
          <Botonera>
            <BotonMind variante="tenue" icono="arrow_back" onClick={() => setPaso('correo')}>
              Atrás
            </BotonMind>
            <BotonMind disabled={usos.length === 0} onClick={() => setPaso('resumen')}>
              Continuar <Icono nombre="arrow_forward" className="text-lg" />
            </BotonMind>
          </Botonera>
        </>
      ) : null}

      {paso === 'resumen' ? (
        <>
          <span className="text-[36px] leading-none font-semibold">Así le llega</span>
          <div className="w-full text-left">
            <CorreoDeInvitacion nombre={nombre} correo={correo.trim()} evento={datos.evento.nombre} />
          </div>
          {error === null ? null : <p className="w-full rounded-2xl bg-[var(--mind-alerta)] px-4 py-3 text-sm [color:var(--mind-alerta-texto)]">{error}</p>}
          <Botonera>
            <BotonMind variante="tenue" icono="arrow_back" onClick={() => setPaso('usos')}>
              Ir atrás
            </BotonMind>
            <BotonMind disabled={enviando} onClick={() => void enviar()}>
              {enviando ? 'Guardando…' : 'Agregar y pedir autorización'} <Icono nombre="send" className="text-lg" />
            </BotonMind>
          </Botonera>
        </>
      ) : null}

      {paso === 'hecho' ? (
        <>
          <span className="flex size-14 items-center justify-center rounded-full bg-acento text-acento-contraste">
            <Icono nombre="check" className="text-3xl" />
          </span>
          <span className="text-[36px] leading-none font-semibold">Ponente agregado</span>
          <BotonMind variante="tenue" onClick={alTerminar} className="w-full max-w-sm justify-center">
            Salir
          </BotonMind>
        </>
      ) : null}
    </div>
  )
}

function Cabecera({ icono, titulo, texto }: { icono: string; titulo: string; texto: string }): ReactElement {
  return (
    <div className="flex flex-col items-center gap-3">
      <Icono nombre={icono} className="text-[44px]" />
      <span className="text-[36px] leading-none font-semibold">{titulo}</span>
      <p className="max-w-md text-xl text-texto-tenue">{texto}</p>
    </div>
  )
}

function Botonera({ children }: { children: ReactNode }): ReactElement {
  return <div className="flex w-full max-w-sm items-center justify-between gap-2">{children}</div>
}

function Campo({
  valor,
  alCambiar,
  rotulo,
  ejemplo,
  tipo = 'text',
}: {
  valor: string
  alCambiar: (valor: string) => void
  rotulo: string
  ejemplo: string
  tipo?: string
}): ReactElement {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs text-texto-tenue">{rotulo}</span>
      <input
        type={tipo}
        value={valor}
        placeholder={ejemplo}
        onChange={(evento) => alCambiar(evento.target.value)}
        className="h-12 rounded-2xl bg-panel px-4 text-base text-texto shadow-[0_0_0_1px_var(--bitacora-filete-fuerte)] transition-shadow duration-500 outline-none focus:shadow-[0_0_0_3px_var(--mind-tonal),0_0_0_1px_var(--bitacora-filete-fuerte)]"
      />
    </label>
  )
}
