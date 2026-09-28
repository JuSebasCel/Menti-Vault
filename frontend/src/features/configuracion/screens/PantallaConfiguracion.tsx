import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { ReactElement, ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import { useSession } from '@/features/auth/session'
import { useConferenciasVisibles } from '@/features/conferencias/components'
import { nombreDePersona } from '@/features/conferencias/data'
import { privacidadEfectiva } from '@/features/conferencias/query'
import type { ConferenciaVisible } from '@/features/conferencias/query'
import { Button, CLASES_DE_PILDORA, EleccionEnPastillas, Field, Input, MensajeDeFormulario } from '@/shared/ui'
import type { ColorDePildora } from '@/shared/ui'
import { ACENTOS, cambiarApariencia, useApariencia } from '@/shared/tema/apariencia'
import { PROPOSITOS } from '../contextoApiKey'
import type { AjustesDeIa, PropositoDeClave } from '../contextoApiKey'
import { useApiKey } from '../useApiKey'
import { cambiarPreferencia, usePreferencias } from '../preferencias'
import { cambiarCierreDelSitio, useCierreDelSitio } from '../cierreDelSitio'
import { iniciarRecorrido } from '@/app/recorrido/recorridoGuiado'
import { ConfirmacionEnSitio } from '@/shared/ui/ConfirmacionEnSitio'
import { eliminarComparticion } from '../comparticiones/repositorio'

const ID_CAMPO_API_KEY = 'config-api-key'

/*
  Configuración: las claves de OpenAI y lo que otras personas compartieron
  contigo.

  Con el lenguaje de las demás pantallas: título grande, paneles de radio
  24 sobre el fondo, sin filetes ni sombras. Se fue lo que ya no hacía
  nada: los permisos de "incluye pendientes" y "puedes validar" de cada
  compartida hablaban de la validación de fichas, que salió de la interfaz.

  Compartir una conferencia no vive aquí: está en la propia conferencia,
  que es donde se decide hacerlo.
*/

/*
  Una clave por uso. Con Groq cada cuenta tiene sus propios límites, así que
  repartir los usos entre cuentas multiplica lo que aguanta el servicio. Con
  una sola clave basta: la que falte se cubre con la primera que haya, en
  este mismo orden.
*/
const USOS: readonly {
  proposito: PropositoDeClave
  titulo: string
  descripcion: string
  icono: string
}[] = [
  {
    proposito: 'transcripcion',
    titulo: 'Transcripción',
    descripcion: 'Convierte el audio de las conferencias en texto.',
    icono: 'graphic_eq',
  },
  {
    proposito: 'fichas',
    titulo: 'Fichas y memorias',
    descripcion: 'Analiza lo que se dijo, escribe las fichas y redacta las memorias.',
    icono: 'auto_awesome',
  },
  {
    proposito: 'chat',
    titulo: 'Chat',
    descripcion: 'Responde las preguntas del chat.',
    icono: 'forum',
  },
]

const NOMBRE_DE_USO: Record<PropositoDeClave, string> = {
  transcripcion: 'Transcripción',
  fichas: 'Fichas y memorias',
  chat: 'Chat',
}

/* Lo justo para reconocer cuál es sin poder copiarla: `sk-…a1b2`. */
function claveAbreviada(clave: string): string {
  return `${clave.slice(0, 3)}…${clave.slice(-4)}`
}

function TarjetaDeClave({
  proposito,
  titulo,
  descripcion,
  icono,
}: {
  proposito: PropositoDeClave
  titulo: string
  descripcion: string
  icono: string
}): ReactElement {
  const { claves, cargando, guardar, borrar } = useApiKey()
  const clave = claves[proposito]
  /* La que cubre este uso cuando no tiene la suya: la primera que haya, en el orden de respaldo. */
  const deRespaldo = PROPOSITOS.find((otro) => otro !== proposito && claves[otro] !== null)
  const [valor, setValor] = useState('')
  const [mensaje, setMensaje] = useState<{ texto: string; esError: boolean } | null>(null)
  const [enviando, setEnviando] = useState(false)
  const reducirMovimiento = useReducedMotion()

  async function alGuardar(): Promise<void> {
    if (enviando) return
    setEnviando(true)

    const resultado = await guardar(valor, proposito)
    setMensaje(resultado.ok ? { texto: 'Clave guardada.', esError: false } : { texto: resultado.mensaje, esError: true })
    if (resultado.ok) {
      setValor('')
    }
    setEnviando(false)
  }

  async function alQuitar(): Promise<void> {
    if (enviando) return
    setEnviando(true)

    const resultado = await borrar(proposito)
    setMensaje(resultado.ok ? { texto: 'Clave quitada.', esError: false } : { texto: resultado.mensaje, esError: true })
    setEnviando(false)
  }

  const estado =
    cargando ? null : clave !== null ? (
      <Estado color="verde">Guardada · {claveAbreviada(clave)}</Estado>
    ) : deRespaldo !== undefined ? (
      <Estado color="azul">Usa la de {NOMBRE_DE_USO[deRespaldo]}</Estado>
    ) : (
      <Estado color="rosa">Falta</Estado>
    )

  return (
    <section aria-label={`Clave de ${titulo.toLowerCase()}`} className="flex flex-col gap-5 rounded-[24px] bg-panel p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-ilustracion text-ilustracion-texto">
          <span aria-hidden="true" className="material-symbols-rounded icono-relleno text-[22px]">
            {icono}
          </span>
        </div>
        {estado}
      </div>

      <div className="flex flex-col gap-1.5">
        <h2 className="font-titulo text-xl leading-tight font-semibold text-texto">{titulo}</h2>
        <p className="text-sm leading-relaxed text-texto-tenue">{descripcion}</p>
      </div>

      <Field
        id={proposito === 'transcripcion' ? ID_CAMPO_API_KEY : `config-api-key-${proposito}`}
        etiqueta={clave === null ? 'Pega tu clave' : 'Reemplazar por otra'}
      >
        <Input
          type="password"
          autoComplete="off"
          value={valor}
          onChange={(evento) => setValor(evento.target.value)}
          onKeyDown={(evento) => {
            if (evento.key === 'Enter') {
              void alGuardar()
            }
          }}
          placeholder="gsk_… o sk-…"
        />
      </Field>

      <AnimatePresence mode="wait">
        {mensaje === null ? null : (
          <motion.div
            key={mensaje.texto}
            initial={reducirMovimiento ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
          >
            {mensaje.esError ? (
              <MensajeDeFormulario id={`config-api-key-${proposito}-error`}>{mensaje.texto}</MensajeDeFormulario>
            ) : (
              <p className="text-sm text-texto-tenue">{mensaje.texto}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-auto flex gap-2">
        <Button
          variante="primario"
          cargando={enviando}
          disabled={valor.trim() === ''}
          onClick={() => {
            void alGuardar()
          }}
        >
          Guardar
        </Button>

        {cargando || clave === null ? null : (
          <Button
            variante="sutil"
            disabled={enviando}
            onClick={() => {
              void alQuitar()
            }}
          >
            Quitar
          </Button>
        )}
      </div>
    </section>
  )
}

/* El estado de cada clave en su color: verde lista, rosa falta, azul prestada de la de análisis. */
function Estado({ color, children }: { color: ColorDePildora; children: ReactNode }): ReactElement {
  return (
    <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm ${CLASES_DE_PILDORA[color]}`}>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  )
}

const PASOS_PARA_CONSEGUIR_UNA_CLAVE: readonly ReactElement[] = [
  <>
    Entra a{' '}
    <a
      href="https://console.groq.com/keys"
      target="_blank"
      rel="noreferrer"
      className="font-medium text-texto underline underline-offset-2"
    >
      console.groq.com/keys
    </a>{' '}
    con tu cuenta de Groq.
  </>,
  <>Pulsa «Create API Key» y ponle un nombre, por ejemplo «Menti Vault».</>,
  <>Copia la clave, que empieza por «gsk_», y pégala arriba. Groq solo la muestra una vez.</>,
]

function ComoConseguirUnaClave(): ReactElement {
  return (
    <section aria-label="Cómo conseguir una clave" className="flex flex-col gap-4 rounded-[24px] bg-panel p-6">
      <h2 className="font-titulo text-xl leading-tight font-semibold text-texto">Cómo conseguir una clave</h2>

      <ol className="grid grid-cols-3 gap-3">
        {PASOS_PARA_CONSEGUIR_UNA_CLAVE.map((paso, indice) => (
          <li key={indice} className="flex gap-3 rounded-[20px] bg-fondo p-4 text-sm leading-relaxed text-texto-tenue">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-acento-tenue text-sm font-semibold text-texto">
              {indice + 1}
            </span>
            <p>{paso}</p>
          </li>
        ))}
      </ol>

    </section>
  )
}

/*
  Solo para la cuenta administradora: si todos usan sus claves o cada quien
  las suyas. Con las suyas compartidas, lo que gastan todos sale de sus
  cuentas, así que va con el cupo de audio de hoy a la vista.
*/
/*
  Cómo se comporta la app para esta persona. Pastillas y no interruptores:
  cada opción dice lo que pasa, en vez de un "sí/no" que obliga a leer la
  pregunta dos veces para saber qué significa apagado.
*/
/*
  Cómo se ve la app. Va antes de las preferencias de comportamiento porque es
  lo que se toca una vez y se deja: el color del acento y el tamaño del dock.

  El tema (claro/oscuro/sistema) sigue en el menú de la cuenta, donde se
  prueba mirando la app; repetirlo aquí sería el mismo control en dos sitios.
*/
function SeccionDeApariencia(): ReactElement {
  const { acento, dock } = useApariencia()

  return (
    <section id="apariencia" aria-label="Apariencia" className="flex flex-col gap-5 rounded-[24px] bg-panel p-6">
      <h2 className="font-titulo text-xl leading-tight font-semibold text-texto">Apariencia</h2>

      <div className="flex flex-col gap-2">
        <p className="px-1 text-xs text-texto-tenue">Color del acento</p>

        <div className="flex flex-wrap gap-2">
          {ACENTOS.map((opcion) => (
            <button
              key={opcion.valor}
              type="button"
              aria-pressed={acento === opcion.valor}
              onClick={() => cambiarApariencia({ acento: opcion.valor })}
              className={`flex h-10 cursor-pointer items-center gap-2 rounded-full px-3 text-sm transition-colors ${
                acento === opcion.valor ? 'bg-acento text-acento-contraste' : 'bg-acento-tenue text-texto-tenue hover:text-texto'
              }`}
            >
              <span
                aria-hidden="true"
                style={{ background: opcion.muestra }}
                className="size-4 shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.15)]"
              />
              {opcion.etiqueta}
            </button>
          ))}
        </div>
      </div>

      <EleccionEnPastillas
        etiqueta="Tamaño del dock"
        opciones={[
          { valor: 'normal', etiqueta: 'Normal', icono: 'vertical_split' },
          { valor: 'compacto', etiqueta: 'Compacto', icono: 'compress' },
        ]}
        valor={dock}
        alCambiar={(valor) => cambiarApariencia({ dock: valor })}
      />
    </section>
  )
}

function SeccionDePreferencias(): ReactElement {
  const { analizarAlCargar, avisarAlTerminar, citasInferidas } = usePreferencias()

  return (
    <section aria-label="Preferencias" className="flex flex-col gap-5 rounded-[24px] bg-panel p-6">
      <h2 className="font-titulo text-xl leading-tight font-semibold text-texto">Preferencias</h2>

      <EleccionEnPastillas
        etiqueta="Al cargar una conferencia"
        opciones={[
          { valor: 'analizar', etiqueta: 'Analizarla en seguida', icono: 'auto_awesome' },
          { valor: 'esperar', etiqueta: 'Dejarla en cola', icono: 'schedule' },
        ]}
        valor={analizarAlCargar ? 'analizar' : 'esperar'}
        alCambiar={(valor) => void cambiarPreferencia('analizarAlCargar', valor === 'analizar')}
      />

      <EleccionEnPastillas
        etiqueta="Cuando termina un análisis o una memoria"
        opciones={[
          { valor: 'avisar', etiqueta: 'Sonido y aviso en la pestaña', icono: 'notifications_active' },
          { valor: 'callar', etiqueta: 'Sin aviso', icono: 'notifications_off' },
        ]}
        valor={avisarAlTerminar ? 'avisar' : 'callar'}
        alCambiar={(valor) => void cambiarPreferencia('avisarAlTerminar', valor === 'avisar')}
      />

      {/*
        Las fuentes que cita una charla se recogen con su evidencia. Inferir
        va aparte y apagado: un modelo al que se le pide bibliografía completa
        de memoria el año, el título y hasta el DOI, y una referencia
        inventada en un documento académico es el error más caro de esta app.
      */}
      <EleccionEnPastillas
        etiqueta="Fuentes que cita una charla"
        opciones={[
          { valor: 'constan', etiqueta: 'Solo las que constan', icono: 'fact_check' },
          { valor: 'inferir', etiqueta: 'Dejar que la IA infiera', icono: 'lightbulb' },
        ]}
        valor={citasInferidas ? 'inferir' : 'constan'}
        alCambiar={(valor) => void cambiarPreferencia('citasInferidas', valor === 'inferir')}
      />

      <button
        type="button"
        onClick={() => iniciarRecorrido()}
        className="flex h-10 w-fit cursor-pointer items-center gap-2 rounded-full bg-acento-tenue px-4 text-sm text-texto transition-colors hover:bg-ilustracion"
      >
        <span aria-hidden="true" className="material-symbols-rounded icono-contorno text-lg">
          tour
        </span>
        Ver el recorrido guiado
      </button>
    </section>
  )
}

function SeccionDeAdministracion(): ReactElement {
  const { ajustes, cambiarClavesCompartidas } = useApiKey()
  const [error, setError] = useState<string | null>(null)
  const { usuario } = useSession()
  const { cerrado } = useCierreDelSitio(usuario?.id ?? '')

  return (
    <section aria-label="Administración" className="flex flex-col gap-4 rounded-[24px] bg-panel p-6">
      <div className="flex items-center gap-3">
        <span className={`flex size-11 items-center justify-center rounded-full ${CLASES_DE_PILDORA.violeta}`}>
          <span aria-hidden="true" className="material-symbols-rounded icono-relleno text-[22px]">
            admin_panel_settings
          </span>
        </span>
        <h2 className="font-titulo text-xl leading-tight font-semibold text-texto">Administración</h2>
      </div>

      <EleccionEnPastillas
        etiqueta="Claves de IA"
        opciones={[
          { valor: 'propias', etiqueta: 'Cada quien las suyas', icono: 'person' },
          { valor: 'compartidas', etiqueta: 'Todos usan las mías', icono: 'group' },
        ]}
        valor={ajustes.clavesCompartidas ? 'compartidas' : 'propias'}
        alCambiar={(valor) => {
          void cambiarClavesCompartidas(valor === 'compartidas').then((resultado) =>
            setError(resultado.ok ? null : resultado.mensaje),
          )
        }}
      />

      {/*
        Cerrar la app a los demás mientras se trabaja en ella: ven una
        pantalla de "estamos trabajando" y la administración sigue entrando.
      */}
      <EleccionEnPastillas
        etiqueta="Acceso a la app"
        opciones={[
          { valor: 'abierta', etiqueta: 'Abierta', icono: 'lock_open' },
          { valor: 'cerrada', etiqueta: 'Cerrada, en construcción', icono: 'construction' },
        ]}
        valor={cerrado ? 'cerrada' : 'abierta'}
        alCambiar={(valor) => {
          void cambiarCierreDelSitio(valor === 'cerrada').then((resultado) =>
            setError(resultado.ok ? null : 'No se pudo cambiar el acceso. Vuelve a intentarlo.'),
          )
        }}
      />

      {error === null ? null : <MensajeDeFormulario id="config-administracion-error">{error}</MensajeDeFormulario>}

      {ajustes.clavesCompartidas ? <CupoDeHoy ajustes={ajustes} /> : null}
    </section>
  )
}

/* El audio que ya se transcribió hoy con las claves compartidas, contra el techo diario. */
function CupoDeHoy({ ajustes }: { ajustes: AjustesDeIa }): ReactElement {
  const minutos = (segundos: number): number => Math.round(segundos / 60)
  const proporcion =
    ajustes.limiteDiarioDeAudioS > 0 ? Math.min(1, ajustes.audioUsadoHoyS / ajustes.limiteDiarioDeAudioS) : 0

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        Audio de hoy: {minutos(ajustes.audioUsadoHoyS)} de {minutos(ajustes.limiteDiarioDeAudioS)} minutos
      </p>
      <div className="h-2 overflow-hidden rounded-full bg-fondo">
        <div style={{ width: `${proporcion * 100}%` }} className="h-full rounded-full bg-acento" />
      </div>
    </div>
  )
}

const ESTADO_DE_LA_INVITACION = {
  pendiente: 'Sin responder',
  aceptada: 'La aceptó',
  rechazada: 'La rechazó',
} as const

/*
  Lo que compartiste, con quién, y la forma de retirarlo. Antes compartir no
  tenía vuelta atrás desde la interfaz: la invitación existía y no había un
  sitio donde verla ni quitarla. Retirarla corta las fichas y el audio en la
  siguiente consulta del invitado (los dos dependen de la misma fila).
*/
function SeccionLoQueCompartiste({
  visibles,
  alCambiar,
}: {
  visibles: readonly ConferenciaVisible[]
  alCambiar: () => void
}): ReactElement {
  const [porQuitar, setPorQuitar] = useState<string | null>(null)
  const filas = visibles
    .filter((visible) => visible.procedencia === 'propia')
    .flatMap((visible) =>
      visible.conferencia.comparticiones.map((comparticion) => ({ conferencia: visible.conferencia, comparticion })),
    )

  return (
    <section aria-label="Lo que compartiste" className="flex flex-col gap-4 rounded-[24px] bg-panel p-6">
      <h2 className="font-titulo text-xl leading-tight font-semibold text-texto">Lo que compartiste</h2>

      {filas.length === 0 ? (
        <p className="rounded-[20px] bg-fondo p-4 text-sm text-texto-tenue">
          No has compartido ninguna conferencia todavía.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {filas.map(({ conferencia, comparticion }) => {
            const clave = `${conferencia.id}:${comparticion.idInvitado}`
            const quien = comparticion.invitadoNombre || comparticion.invitadoCorreo || 'Alguien'

            return (
              <li key={clave} className="flex items-center justify-between gap-4 rounded-[20px] bg-fondo px-5 py-4">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="truncate text-base font-medium text-texto">{conferencia.titulo}</p>
                  <p className="truncate text-sm text-texto-tenue">
                    {quien} · {ESTADO_DE_LA_INVITACION[comparticion.estado]}
                  </p>
                </div>

                {porQuitar === clave ? (
                  <ConfirmacionEnSitio
                    nombre={`el acceso de ${quien}`}
                    alCancelar={() => setPorQuitar(null)}
                    alConfirmar={() => {
                      setPorQuitar(null)
                      void eliminarComparticion(conferencia.id, comparticion.idInvitado).then(alCambiar)
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setPorQuitar(clave)}
                    className="h-9 shrink-0 cursor-pointer rounded-full bg-acento-tenue px-4 text-sm text-texto transition-colors hover:bg-ilustracion"
                  >
                    Quitar acceso
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function SeccionCompartidasConmigo({ visibles }: { visibles: readonly ConferenciaVisible[] }): ReactElement {
  const compartidas = visibles.filter((visible) => visible.procedencia === 'compartida')

  return (
    <section aria-label="Compartidas conmigo" className="flex flex-col gap-4 rounded-[24px] bg-panel p-6">
      <h2 className="font-titulo text-xl leading-tight font-semibold text-texto">Compartidas conmigo</h2>

      {compartidas.length === 0 ? (
        <p className="rounded-[20px] bg-fondo p-4 text-sm text-texto-tenue">
          Nadie ha compartido ninguna conferencia contigo todavía.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {compartidas.map((visible) => {
            const privacidad = privacidadEfectiva(visible)

            return (
              <li
                key={visible.conferencia.id}
                className="flex items-center justify-between gap-4 rounded-[20px] bg-fondo px-5 py-4"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="truncate text-base font-medium text-texto">{visible.conferencia.titulo}</p>
                  <p className="text-sm text-texto-tenue">
                    Compartida por {nombreDePersona(visible.conferencia.idDueno) ?? 'otra persona'}
                  </p>
                </div>

                {privacidad.permitirRecompartir ? (
                  <span className="shrink-0 rounded-full bg-acento-tenue px-3 py-1 text-sm text-texto-tenue">
                    Puedes recompartir
                  </span>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export function PantallaConfiguracion(): ReactElement {
  const { usuario } = useSession()
  const idUsuario = usuario?.id ?? ''
  const { visibles, recargar } = useConferenciasVisibles(idUsuario)
  const ubicacion = useLocation()
  const { ajustes } = useApiKey()

  /*
    Quien llega desde el aviso de clave faltante (el menú de cuenta, o el
    modal de carga) trae `#config-api-key` en la URL: el campo se desplaza a
    la vista y recibe el foco, en vez de dejar a la persona a buscarlo.
  */
  useEffect(() => {
    if (ubicacion.hash === '') {
      return
    }

    /*
      Vale para cualquier ancla de esta pantalla, no solo para la clave: el
      menú de la cuenta enlaza también a `#apariencia`, y llegar arriba del
      todo obligaría a buscar a mano la sección que se acababa de pedir.
    */
    const destino = document.getElementById(ubicacion.hash.slice(1))
    destino?.scrollIntoView({ behavior: 'smooth', block: 'center' })

    if (ubicacion.hash === `#${ID_CAMPO_API_KEY}`) {
      destino?.focus()
    }
  }, [ubicacion.hash])

  return (
    <div className="flex flex-col gap-6 pb-6">
      <h1 className="font-titulo text-[32px] leading-none font-semibold text-texto">Configuración</h1>

      {ajustes.soyAdministracion ? <SeccionDeAdministracion /> : null}

      <SeccionDeApariencia />

      <SeccionDePreferencias />

      {/*
        Con las claves compartidas, las de cada quien no se usan: el backend
        toma las de la administración. Enseñarlas invitaría a configurar algo
        que no tiene efecto.
      */}
      {ajustes.clavesCompartidas && !ajustes.soyAdministracion ? (
        <section className="flex flex-col gap-3 rounded-[24px] bg-ilustracion p-6 text-ilustracion-texto">
          <h2 className="font-titulo text-xl leading-tight font-semibold">Claves compartidas</h2>
          <p className="text-sm leading-relaxed">
            La administración comparte sus claves de IA: no necesitas poner las tuyas.
          </p>
          <CupoDeHoy ajustes={ajustes} />
        </section>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            {USOS.map((uso) => (
              <TarjetaDeClave key={uso.proposito} {...uso} />
            ))}
          </div>

          <ComoConseguirUnaClave />
        </>
      )}
      <SeccionLoQueCompartiste visibles={visibles} alCambiar={recargar} />
      <SeccionCompartidasConmigo visibles={visibles} />
    </div>
  )
}
