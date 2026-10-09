import type { ReactElement, ReactNode } from 'react'
import { useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useSession } from '@/features/auth/session'
import { mensajeDeError } from '@/shared/errors'
import { Modal } from '@/shared/ui'
import { CargaDelEvento } from '../components/CargaDelEvento'
import { Filtros } from '../components/Filtros'
import { PanelLateral } from '../components/PanelLateral'
import { SelectorDeHora } from '../components/SelectorDeHora'
import { BotonMind, Chip, EncabezadoDePagina, Estado, Icono } from '../components/piezas'
import { MOMENTO, fecha, minutosEntre, momentoDe, sumarMinutos, tituloRepetido } from '../formato'
import { actualizarEvento, actualizarSesion, crearPonenteInvitado, crearSesion, eliminarSesion } from '../repositorio'
import { SelectorDePonente, ponentesNuevos } from '../components/SelectorDePonente'
import type { CambiosDeSesion } from '../repositorio'
import { useEvento } from '../useEvento'
import type { DatosDelEvento, Ponencia, TipoDeSesion } from '../tipos'

/*
  La agenda: dónde se define la estructura del evento y dónde se ve.

  Cada sesión tiene día, hora, espacio, tipo y, si el evento los usa, eje. La
  jornada no se escribe: se lee de la hora. Por eso una sesión no puede
  existir sin hora: sin ella no tiene sitio en el evento, y las que llegaron
  así (subidas antes de tener agenda) se avisan arriba para asignarla.

  Los bloques van recogidos —hora y título— y el detalle aparece al pasar el
  ratón, como en un calendario: con todo a la vista, una sesión de media hora
  era un rectángulo con la palabra "Conferencia" y nada más.
*/
export function PantallaAgenda(): ReactElement {
  return <CargaDelEvento>{(datos) => <Agenda datos={datos} />}</CargaDelEvento>
}

const ALTO_DE_HORA = 64
const TIPOS: readonly { valor: TipoDeSesion; etiqueta: string }[] = [
  { valor: 'conferencia', etiqueta: 'Conferencia' },
  { valor: 'taller', etiqueta: 'Taller' },
  { valor: 'panel', etiqueta: 'Panel' },
  { valor: 'apertura', etiqueta: 'Apertura' },
  { valor: 'cierre', etiqueta: 'Cierre' },
]
const DURACIONES = [30, 45, 60, 90, 120] as const

/* Los cinco de siempre más los que el evento añadió. */
function tiposDelEvento(datos: DatosDelEvento): readonly { valor: TipoDeSesion; etiqueta: string }[] {
  return [...TIPOS, ...datos.evento.formatosDeSesion.map((formato) => ({ valor: formato, etiqueta: formato }))]
}

/* Un formato propio se guarda con su nombre, así que si no es uno de los de siempre, su nombre es su etiqueta. */
function etiquetaDeTipo(tipo: TipoDeSesion): string {
  return TIPOS.find((uno) => uno.valor === tipo)?.etiqueta ?? tipo
}

function minutosDe(hora: string | null): number | null {
  if (hora === null) {
    return null
  }
  const [horas, minutos] = hora.split(':').map(Number)
  return (horas ?? 0) * 60 + (minutos ?? 0)
}

function etiquetaDeDuracion(minutos: number): string {
  return minutos < 60 ? `${minutos} min` : minutos % 60 === 0 ? `${minutos / 60} h` : `${Math.floor(minutos / 60)} h ${minutos % 60}`
}

/* Los días del evento, de la fecha de inicio a la de fin, más cualquier día suelto que traiga una sesión. */
function diasDelEvento(datos: DatosDelEvento): string[] {
  const dias = new Set<string>(datos.ponencias.map((ponencia) => ponencia.fecha).filter((dia) => dia !== ''))
  const { fechaInicio, fechaFin } = datos.evento
  if (fechaInicio !== null && fechaFin !== null) {
    for (let dia = new Date(`${fechaInicio}T12:00:00`); dia <= new Date(`${fechaFin}T12:00:00`); dia.setDate(dia.getDate() + 1)) {
      dias.add(dia.toISOString().slice(0, 10))
    }
  }
  return [...dias].sort()
}

/* Lo que le falta a una sesión para entrar en la cuadrícula, dicho con sus datos. */
function queLeFalta(sesion: Ponencia): string {
  if (sesion.horaInicio === null) {
    return 'Le falta la hora de inicio'
  }
  if (sesion.horaFin === null) {
    return `Empieza a las ${sesion.horaInicio}, le falta la hora de fin`
  }
  return `Termina (${sesion.horaFin}) antes de empezar (${sesion.horaInicio})`
}

/* La vista elegida se recuerda: volver a la agenda y encontrarla cambiada obliga a elegirla otra vez. */
const CLAVE_DE_VISTA = 'menti-vista-de-agenda'

const DIAS_POR_SEMANA = 7

function vistaRecordada(): 'dias' | 'lista' {
  try {
    return window.localStorage.getItem(CLAVE_DE_VISTA) === 'lista' ? 'lista' : 'dias'
  } catch {
    return 'dias'
  }
}

const DIA_DE_LA_SEMANA = new Intl.DateTimeFormat('es-CO', { weekday: 'short' })

function Agenda({ datos }: { datos: DatosDelEvento }): ReactElement {
  const [parametros, setParametros] = useSearchParams()
  const [vista, setVistaEnEstado] = useState<'dias' | 'lista'>(vistaRecordada)
  const [eje, setEje] = useState('todos')
  const [tipo, setTipo] = useState('todos')
  const [origen, setOrigen] = useState<DOMRect | null>(null)
  const [viendoSinHora, setViendoSinHora] = useState(false)
  const botonNueva = useRef<HTMLButtonElement>(null)
  const botonSinHora = useRef<HTMLButtonElement>(null)

  const setVista = (siguiente: 'dias' | 'lista'): void => {
    setVistaEnEstado(siguiente)
    try {
      window.localStorage.setItem(CLAVE_DE_VISTA, siguiente)
    } catch {
      // Sin almacenamiento la vista se recuerda solo mientras dure la pantalla.
    }
  }

  const dias = useMemo(() => diasDelEvento(datos), [datos])
  /*
    Por días se ven siete como mucho, y las flechas pasan de semana: con un
    evento de dos semanas la cuadrícula se partía en catorce columnas tan
    angostas que no cabía ni el título de una sesión.
  */
  const semanas = Math.max(1, Math.ceil(dias.length / DIAS_POR_SEMANA))
  const [semana, setSemana] = useState(0)
  const semanaVisible = Math.min(semana, semanas - 1)
  const diasDeLaSemana = dias.slice(semanaVisible * DIAS_POR_SEMANA, (semanaVisible + 1) * DIAS_POR_SEMANA)
  /* Sin hora, o con un fin anterior al inicio: no tiene un sitio en la cuadrícula y se avisa arriba para corregirla. */
  const conHoraValida = (ponencia: Ponencia): boolean =>
    ponencia.horaInicio !== null && ponencia.horaFin !== null && minutosEntre(ponencia.horaInicio, ponencia.horaFin) > 0
  const sinHora = datos.ponencias.filter((ponencia) => !conHoraValida(ponencia))
  const visibles = datos.ponencias.filter(
    (ponencia) => conHoraValida(ponencia) && (eje === 'todos' || ponencia.eje === eje) && (tipo === 'todos' || ponencia.tipo === tipo),
  )
  const editando = datos.ponencias.find((ponencia) => ponencia.id === parametros.get('sesion')) ?? null
  const creando = parametros.get('nueva') === '1'

  const cambiar = (clave: string, valor: string | null): void => {
    const siguientes = new URLSearchParams(parametros)
    if (valor === null) {
      siguientes.delete(clave)
    } else {
      siguientes.set(clave, valor)
    }
    setParametros(siguientes, { replace: true })
  }

  const abrir = (ponencia: Ponencia, elemento: HTMLElement | null): void => {
    setOrigen(elemento?.getBoundingClientRect() ?? null)
    setViendoSinHora(false)
    cambiar('sesion', ponencia.id)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <EncabezadoDePagina
        titulo={
          dias.length === 0
            ? 'Agenda'
            : vista === 'dias'
              ? `Agenda · ${fecha(diasDeLaSemana[0] ?? null)} al ${fecha(diasDeLaSemana.at(-1) ?? null)}`
              : `Agenda · ${fecha(dias[0] ?? null)} al ${fecha(dias.at(-1) ?? null)}`
        }
      >
        {vista === 'dias' && semanas > 1 ? (
          <span className="flex items-center gap-1 rounded-full bg-[var(--mind-neutro)] p-1">
            <button
              type="button"
              aria-label="Semana anterior"
              disabled={semanaVisible === 0}
              onClick={() => setSemana(semanaVisible - 1)}
              className="flex size-8 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-fondo disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <Icono nombre="chevron_left" className="text-xl" />
            </button>
            <span className="px-1 text-sm font-medium whitespace-nowrap">
              Semana {semanaVisible + 1} de {semanas}
            </span>
            <button
              type="button"
              aria-label="Semana siguiente"
              disabled={semanaVisible === semanas - 1}
              onClick={() => setSemana(semanaVisible + 1)}
              className="flex size-8 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-fondo disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <Icono nombre="chevron_right" className="text-xl" />
            </button>
          </span>
        ) : null}
        {sinHora.length === 0 ? null : (
          <button
            ref={botonSinHora}
            type="button"
            onClick={() => setViendoSinHora(true)}
            className="flex h-10 cursor-pointer items-center gap-2 rounded-full bg-[var(--tono-ambar)] px-4 text-sm font-medium [color:var(--tono-ambar-texto)]"
          >
            <Icono nombre="schedule" className="text-lg" />
            {sinHora.length} por ubicar
          </button>
        )}
        <Filtros
          grupos={[
            {
              clave: 'eje',
              rotulo: 'Eje',
              icono: 'category',
              valor: eje,
              porDefecto: 'todos',
              alCambiar: setEje,
              opciones: [{ valor: 'todos', etiqueta: 'Todos' }, ...datos.evento.ejes.map((uno) => ({ valor: uno, etiqueta: uno }))],
            },
            {
              clave: 'tipo',
              rotulo: 'Tipo',
              icono: 'interests',
              valor: tipo,
              porDefecto: 'todos',
              alCambiar: setTipo,
              opciones: [{ valor: 'todos', etiqueta: 'Todos' }, ...tiposDelEvento(datos).map((uno) => ({ valor: uno.valor, etiqueta: uno.etiqueta }))],
            },
          ]}
        />
        {/* El selector de vista de la referencia: dos iconos en una píldora gris. */}
        <div className="flex h-10 items-center gap-1 rounded-full bg-[var(--mind-neutro)] p-1">
          {(
            [
              ['dias', 'calendar_view_week', 'Por días'],
              ['lista', 'view_agenda', 'Lista'],
            ] as const
          ).map(([valor, icono, etiqueta]) => (
            <button
              key={valor}
              type="button"
              aria-label={etiqueta}
              aria-pressed={vista === valor}
              onClick={() => setVista(valor)}
              className={`flex h-8 w-10 cursor-pointer items-center justify-center rounded-full transition-colors ${vista === valor ? 'bg-acento text-acento-contraste' : 'text-texto hover:bg-[var(--mind-variante)]'}`}
            >
              <Icono nombre={icono} relleno={vista === valor} className="text-xl" />
            </button>
          ))}
        </div>
        <BotonMind ref={botonNueva} icono="add" onClick={() => cambiar('nueva', '1')}>
          Nueva sesión
        </BotonMind>
      </EncabezadoDePagina>

      {vista === 'dias' ? (
        <VistaPorDias key={semanaVisible} dias={diasDeLaSemana} sesiones={visibles} alAbrir={abrir} />
      ) : (
        <VistaDeLista dias={dias} sesiones={visibles} alAbrir={abrir} />
      )}

      <Modal
        abierto={viendoSinHora}
        alCerrar={() => setViendoSinHora(false)}
        titulo="Sesiones por ubicar"
        anclaje="disparador"
        anclaEn={botonSinHora}
        ancho="angosto"
      >
        <div className="flex flex-col gap-2 pb-2">
          <p className="text-sm text-texto-tenue">Les falta algo para tener su lugar en la agenda. Ábrelas para corregirlo.</p>
          {sinHora.map((sesion) => (
            <button
              key={sesion.id}
              type="button"
              onClick={() => abrir(sesion, null)}
              className="flex cursor-pointer items-center gap-3 rounded-[16px] bg-panel px-4 py-3 text-left transition-colors hover:bg-[var(--mind-variante)]"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-medium">{sesion.titulo}</span>
                <span className="truncate text-sm [color:var(--tono-ambar-texto)]">{queLeFalta(sesion)}</span>
              </span>
              <Icono nombre="arrow_forward" className="text-lg" />
            </button>
          ))}
        </div>
      </Modal>

      <PanelLateral abierto={editando !== null} alCerrar={() => cambiar('sesion', null)} origen={origen} titulo={editando?.titulo ?? 'Sesión'}>
        {editando === null ? null : (
          <FormularioDeSesion key={editando.id} datos={datos} dias={dias} inicial={editando} alTerminar={() => cambiar('sesion', null)} />
        )}
      </PanelLateral>

      <Modal
        abierto={creando}
        alCerrar={() => cambiar('nueva', null)}
        titulo="Nueva sesión"
        anclaEn={botonNueva}
        anclaje="disparador"
        ancho="normal"
        cerrarAlPulsarElVelo={false}
      >
        <FormularioDeSesion datos={datos} dias={dias} inicial={null} alTerminar={() => cambiar('nueva', null)} />
      </Modal>
    </div>
  )
}

/*
  Las sesiones que se cruzan en el mismo día se reparten en columnas, lado a
  lado, como en cualquier calendario: antes se dibujaban en la misma caja y
  la de encima tapaba a la otra, que parecía no existir.

  Se agrupan en racimos (sesiones encadenadas por algún solape); dentro de un
  racimo cada sesión toma la primera columna libre, y todo el racimo se
  divide entre las columnas que llegó a necesitar.
*/
function distribuirSolapadas(sesiones: readonly Ponencia[]): Map<string, { columna: number; columnas: number }> {
  const tramos = sesiones
    .map((sesion) => {
      const inicio = minutosDe(sesion.horaInicio) ?? 0
      return { id: sesion.id, inicio, fin: minutosDe(sesion.horaFin) ?? inicio + 60 }
    })
    .sort((uno, otro) => uno.inicio - otro.inicio || otro.fin - uno.fin)

  const reparto = new Map<string, { columna: number; columnas: number }>()
  let racimo: { id: string; columna: number }[] = []
  let finDelRacimo = -1
  let finesPorColumna: number[] = []

  const cerrarRacimo = (): void => {
    for (const miembro of racimo) {
      reparto.set(miembro.id, { columna: miembro.columna, columnas: finesPorColumna.length })
    }
    racimo = []
    finesPorColumna = []
  }

  for (const tramo of tramos) {
    if (tramo.inicio >= finDelRacimo) {
      cerrarRacimo()
    }
    let columna = finesPorColumna.findIndex((fin) => fin <= tramo.inicio)
    if (columna === -1) {
      columna = finesPorColumna.length
      finesPorColumna.push(tramo.fin)
    } else {
      finesPorColumna[columna] = tramo.fin
    }
    racimo.push({ id: tramo.id, columna })
    finDelRacimo = Math.max(finDelRacimo, tramo.fin)
  }
  cerrarRacimo()
  return reparto
}

function VistaPorDias({
  dias,
  sesiones,
  alAbrir,
}: {
  dias: readonly string[]
  sesiones: readonly Ponencia[]
  alAbrir: (ponencia: Ponencia, elemento: HTMLElement) => void
}): ReactElement {
  const inicios = sesiones.map((sesion) => minutosDe(sesion.horaInicio) ?? 0)
  const fines = sesiones.map((sesion) => minutosDe(sesion.horaFin) ?? (minutosDe(sesion.horaInicio) ?? 0) + 60)
  const primeraHora = inicios.length === 0 ? 8 : Math.floor(Math.min(...inicios) / 60)
  const ultimaHora = fines.length === 0 ? 18 : Math.ceil(Math.max(...fines) / 60)
  const horas = Array.from({ length: Math.max(ultimaHora - primeraHora, 1) }, (_, indice) => primeraHora + indice)

  return (
    <div className="entrar-escalonado grid gap-2" style={{ gridTemplateColumns: `56px repeat(${dias.length}, minmax(0, 1fr))` }}>
      <span />
      {dias.map((dia) => (
        <div key={dia} className="flex h-10 items-center justify-center gap-2 text-sm text-texto">
          <span className="capitalize">{DIA_DE_LA_SEMANA.format(new Date(`${dia}T12:00:00`))}</span>
          <span className="flex size-8 items-center justify-center rounded-full bg-acento text-sm font-semibold text-acento-contraste">
            {Number(dia.slice(8, 10))}
          </span>
        </div>
      ))}

      <div className="relative" style={{ height: horas.length * ALTO_DE_HORA }}>
        {horas.map((hora, indice) => (
          <span key={hora} className="absolute right-2 font-mono text-xs text-texto-tenue" style={{ top: indice * ALTO_DE_HORA - 7 }}>
            {String(hora).padStart(2, '0')}:00
          </span>
        ))}
      </div>

      {dias.map((dia, indiceDia) => (
        /* Cada columna es su propia capa (la anima la entrada), así que la que se mira sube entera para que su detalle no quede debajo de la vecina. */
        <div key={dia} className="relative hover:z-10" style={{ height: horas.length * ALTO_DE_HORA }}>
          {horas.map((hora, indice) => (
            <div key={hora} className="absolute inset-x-0 rounded-[16px] bg-panel" style={{ top: indice * ALTO_DE_HORA + 2, height: ALTO_DE_HORA - 4 }} />
          ))}
          {sesiones
            .filter((sesion) => sesion.fecha === dia)
            .map((sesion, _indice, delDia) => {
              const lugar = distribuirSolapadas(delDia).get(sesion.id) ?? { columna: 0, columnas: 1 }
              const inicio = (minutosDe(sesion.horaInicio) ?? 0) - primeraHora * 60
              const fin = (minutosDe(sesion.horaFin) ?? (minutosDe(sesion.horaInicio) ?? 0) + 60) - primeraHora * 60
              const alto = Math.max(((fin - inicio) / 60) * ALTO_DE_HORA - 4, 30)
              return (
                <div
                  key={sesion.id}
                  className="group absolute hover:z-20"
                  style={{
                    top: (inicio / 60) * ALTO_DE_HORA + 2,
                    height: alto,
                    left: `calc(${(lugar.columna / lugar.columnas) * 100}% + 4px)`,
                    width: `calc(${100 / lugar.columnas}% - 8px)`,
                  }}
                >
                  <button
                    type="button"
                    onClick={(evento) => alAbrir(sesion, evento.currentTarget)}
                    className={`tarjeta-borde flex size-full min-w-0 cursor-pointer flex-col items-start overflow-hidden rounded-[14px] bg-fondo py-1.5 text-left text-texto transition-transform hover:scale-[1.02] ${lugar.columnas > 1 ? 'px-2' : 'px-3'}`}
                  >
                    {/*
                      El título se parte en las líneas que caben en el bloque y
                      se corta con puntos suspensivos: en una columna partida por
                      un solape, una sola línea con "truncate" se salía de la
                      tarjeta porque el texto no tenía ancho mínimo.
                    */}
                    <span className="w-full min-w-0 text-[13px] leading-5 font-medium break-words">
                      <span className="mr-1.5 font-mono text-texto-tenue">{sesion.horaInicio}</span>
                      <span
                        className="overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical]"
                        style={{ WebkitLineClamp: Math.max(1, Math.floor((alto - 12) / 20) - 1) }}
                      >
                        {sesion.titulo}
                      </span>
                    </span>
                  </button>

                  {/* El detalle al pasar el ratón, al lado del bloque y hacia dentro de la pantalla. */}
                  <div
                    className={`pointer-events-none invisible absolute top-0 z-30 flex w-72 flex-col gap-2 rounded-[20px] bg-fondo p-4 opacity-0 shadow-[0_0_0_1px_var(--bitacora-filete),0_16px_40px_-12px_rgb(0_0_0/0.35)] transition-opacity duration-150 group-hover:visible group-hover:opacity-100 ${indiceDia >= dias.length / 2 ? 'right-full mr-2' : 'left-full ml-2'}`}
                  >
                    <span className="font-mono text-xs text-texto-tenue">
                      {sesion.horaInicio} – {sesion.horaFin} ·{' '}
                      {etiquetaDeDuracion(minutosEntre(sesion.horaInicio ?? '00:00', sesion.horaFin ?? sesion.horaInicio ?? '00:00'))}
                    </span>
                    <span className="text-[15px] leading-snug font-semibold">{sesion.titulo}</span>
                    <span className="text-sm">{sesion.ponente}</span>
                    <span className="flex flex-wrap gap-1.5">
                      <span className="rounded-full bg-[var(--mind-neutro)] px-2.5 py-1 text-xs">
                        {etiquetaDeTipo(sesion.tipo)}
                      </span>
                      {sesion.eje === '' ? null : <span className="rounded-full bg-[var(--mind-neutro)] px-2.5 py-1 text-xs">{sesion.eje}</span>}
                      <span className="rounded-full bg-[var(--mind-neutro)] px-2.5 py-1 text-xs">{sesion.sala || 'Sin espacio'}</span>
                    </span>
                    <Estado {...MOMENTO[momentoDe(sesion)]} />
                  </div>
                </div>
              )
            })}
        </div>
      ))}
    </div>
  )
}

function VistaDeLista({
  dias,
  sesiones,
  alAbrir,
}: {
  dias: readonly string[]
  sesiones: readonly Ponencia[]
  alAbrir: (ponencia: Ponencia, elemento: HTMLElement) => void
}): ReactElement {
  return (
    <div className="entrar-escalonado flex flex-col gap-2">
      {dias
        .filter((dia) => sesiones.some((sesion) => sesion.fecha === dia))
        .map((dia) => (
          <div key={dia} className="tarjeta-borde flex gap-6 rounded-[24px] p-4">
            <div className="flex w-20 shrink-0 flex-col items-center gap-1 pt-1">
              <span className="text-sm capitalize">{DIA_DE_LA_SEMANA.format(new Date(`${dia}T12:00:00`))}</span>
              <span className="flex size-12 items-center justify-center rounded-full bg-acento text-xl font-semibold text-acento-contraste">
                {Number(dia.slice(8, 10))}
              </span>
            </div>
            <ol className="flex min-w-0 flex-1 flex-col gap-1">
              {sesiones
                .filter((sesion) => sesion.fecha === dia)
                .map((sesion) => (
                  <li key={sesion.id}>
                    <button
                      type="button"
                      onClick={(evento) => alAbrir(sesion, evento.currentTarget)}
                      className="flex w-full cursor-pointer items-center gap-4 rounded-[16px] px-4 py-3 text-left transition-colors hover:bg-panel"
                    >
                      <span className="w-28 shrink-0 font-mono text-sm">
                        {sesion.horaInicio} – {sesion.horaFin}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="line-clamp-2 font-medium break-words">{sesion.titulo}</span>
                        <span className="line-clamp-2 text-sm break-words text-texto-tenue">
                          {sesion.ponente} · {sesion.sala || 'Sin espacio'}
                        </span>
                      </span>
                      {sesion.eje === '' ? null : (
                        <span className="shrink-0 rounded-full bg-[var(--mind-neutro)] px-3 py-1 text-[13px]">{sesion.eje}</span>
                      )}
                    </button>
                  </li>
                ))}
            </ol>
          </div>
        ))}
    </div>
  )
}

/*
  Crear o editar una sesión, en el orden en que se piensa: qué es, quién la
  da, cuándo y dónde. La hora es obligatoria y la duración se elige en
  bloques habituales en vez de escribir una hora de fin; "Otra" deja elegir
  el fin a mano para los casos raros.
*/
/*
  Añadir un formato propio desde el mismo formulario ("Panel de expertos"):
  un chip que se abre en campo. Sin <form>: este vive dentro de otro, y un
  formulario anidado dispararía el envío nativo y recargaría la página.
*/
function NuevoFormato({ alCrear }: { alCrear: (nombre: string) => Promise<void> }): ReactElement {
  const [escribiendo, setEscribiendo] = useState(false)
  const [nombre, setNombre] = useState('')
  const [guardando, setGuardando] = useState(false)

  const crear = async (): Promise<void> => {
    const limpio = nombre.trim()
    if (limpio === '') {
      return
    }
    setGuardando(true)
    await alCrear(limpio)
    setGuardando(false)
    setNombre('')
    setEscribiendo(false)
  }

  if (!escribiendo) {
    return (
      <button
        type="button"
        onClick={() => setEscribiendo(true)}
        className="flex h-10 cursor-pointer items-center gap-1.5 rounded-full border-2 border-dashed border-filete-fuerte px-4 text-sm text-texto-tenue transition-colors hover:bg-panel"
      >
        <Icono nombre="add" className="text-base" /> Nuevo formato
      </button>
    )
  }
  return (
    <span className="flex h-10 items-center gap-1 rounded-full bg-fondo pr-1 pl-4 shadow-[0_0_0_1px_var(--bitacora-filete-fuerte)]">
      <input
        autoFocus
        value={nombre}
        placeholder="Panel de expertos"
        onChange={(evento) => setNombre(evento.target.value)}
        onKeyDown={(evento) => {
          if (evento.key === 'Enter') {
            evento.preventDefault()
            void crear()
          } else if (evento.key === 'Escape') {
            evento.stopPropagation()
            setEscribiendo(false)
          }
        }}
        className="w-44 bg-transparent text-sm outline-none placeholder:text-texto-tenue"
      />
      <button
        type="button"
        disabled={guardando || nombre.trim() === ''}
        onClick={() => void crear()}
        aria-label="Añadir el formato"
        className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-acento text-acento-contraste disabled:opacity-40"
      >
        <Icono nombre="check" className="text-base" />
      </button>
    </span>
  )
}

function FormularioDeSesion({
  datos,
  dias,
  inicial,
  alTerminar,
}: {
  datos: DatosDelEvento
  dias: readonly string[]
  inicial: Ponencia | null
  alTerminar: () => void
}): ReactElement {
  const { usuario } = useSession()
  const { invalidar } = useEvento()
  const navegar = useNavigate()
  const [cambios, setCambios] = useState<CambiosDeSesion>({
    titulo: inicial?.titulo ?? '',
    ponente: inicial?.ponente ?? '',
    fecha: inicial?.fecha ?? dias[0] ?? '',
    horaInicio: inicial?.horaInicio ?? '',
    horaFin: inicial?.horaFin ?? '',
    sala: inicial?.sala ?? 'Sala virtual',
    tipo: inicial?.tipo ?? 'conferencia',
    eje: inicial?.eje ?? '',
  })
  const duracionActual = cambios.horaInicio !== '' && cambios.horaFin !== '' ? minutosEntre(cambios.horaInicio, cambios.horaFin) : 60
  const [duracion, setDuracion] = useState<number | 'otra'>(
    (DURACIONES as readonly number[]).includes(duracionActual) ? duracionActual : inicial?.horaFin == null ? 60 : 'otra',
  )
  const [guardando, setGuardando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const borrar = async (): Promise<void> => {
    if (inicial === null) {
      return
    }
    const resultado = await eliminarSesion(inicial.id)
    if (!resultado.ok) {
      setError(mensajeDeError(resultado.codigo))
      return
    }
    invalidar()
    alTerminar()
  }
  const poner = <C extends keyof CambiosDeSesion>(clave: C, valor: CambiosDeSesion[C]): void =>
    setCambios((antes) => ({ ...antes, [clave]: valor }))

  const elegirInicio = (hora: string): void => {
    setCambios((antes) => ({ ...antes, horaInicio: hora, horaFin: duracion === 'otra' ? antes.horaFin : sumarMinutos(hora, duracion) }))
  }
  const elegirDuracion = (minutos: number | 'otra'): void => {
    setDuracion(minutos)
    if (minutos !== 'otra' && cambios.horaInicio !== '') {
      poner('horaFin', sumarMinutos(cambios.horaInicio, minutos))
    }
  }

  const completo =
    cambios.titulo.trim() !== '' &&
    cambios.fecha !== '' &&
    cambios.horaInicio !== '' &&
    cambios.horaFin !== '' &&
    minutosEntre(cambios.horaInicio, cambios.horaFin) > 0

  const guardar = async (): Promise<void> => {
    if (tituloRepetido(datos.ponencias, cambios.titulo, inicial?.id ?? null)) {
      setError('Ya hay una sesión con ese título en el evento. Cámbialo o abre la que ya existe.')
      return
    }
    setGuardando(true)
    setError(null)
    for (const nombre of ponentesNuevos(datos.ponentes, cambios.ponente)) {
      const creado = await crearPonenteInvitado(datos.evento.id, nombre, '', [])
      if (!creado.ok) {
        setGuardando(false)
        setError(mensajeDeError(creado.codigo))
        return
      }
    }
    const resultado =
      inicial === null ? await crearSesion(usuario?.id ?? '', datos.evento.nombre, cambios) : await actualizarSesion(inicial.id, cambios)
    setGuardando(false)
    if (!resultado.ok) {
      setError(mensajeDeError(resultado.codigo))
      return
    }
    invalidar()
    alTerminar()
  }

  const campo =
    'h-12 rounded-2xl bg-fondo px-4 text-base text-texto shadow-[0_0_0_1px_var(--bitacora-filete-fuerte)] outline-none transition-shadow duration-500 focus:shadow-[0_0_0_3px_var(--mind-tonal),0_0_0_1px_var(--bitacora-filete-fuerte)]'

  return (
    <div className="entrar-escalonado flex flex-col gap-3 px-2 pt-2 pb-2">
      {inicial === null ? (
        <div className="flex flex-col items-center gap-3 pb-3 text-center">
          <Icono nombre="calendar_add_on" className="text-[44px]" />
          <span className="text-[36px] leading-none font-semibold">Nueva sesión</span>
          <p className="text-xl text-texto-tenue">Qué, quién, cuándo y dónde.</p>
        </div>
      ) : (
        <span className="text-[28px] leading-tight font-semibold">{inicial.titulo}</span>
      )}

      <Bloque titulo="Qué">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-texto-tenue">Título</span>
          <input value={cambios.titulo} onChange={(evento) => poner('titulo', evento.target.value)} className={campo} />
        </label>
        <div className="flex flex-wrap gap-2">
          {tiposDelEvento(datos).map((uno) => (
            <Chip key={uno.valor} elegido={cambios.tipo === uno.valor} onClick={() => poner('tipo', uno.valor)}>
              {uno.etiqueta}
            </Chip>
          ))}
          <NuevoFormato
            alCrear={async (nombre) => {
              const existe = tiposDelEvento(datos).find((uno) => uno.etiqueta.toLowerCase() === nombre.toLowerCase())
              if (existe !== undefined) {
                poner('tipo', existe.valor)
                return
              }
              const resultado = await actualizarEvento(datos.evento.id, { formatosDeSesion: [...datos.evento.formatosDeSesion, nombre] })
              if (resultado.ok) {
                invalidar()
                poner('tipo', nombre)
              }
            }}
          />
        </div>
      </Bloque>

      <Bloque titulo="Quién">
        <SelectorDePonente ponentes={datos.ponentes} valor={cambios.ponente} alCambiar={(nombre) => poner('ponente', nombre)} />
      </Bloque>

      <Bloque titulo="Cuándo">
        <div className="flex flex-wrap gap-2">
          {dias.map((dia) => (
            <Chip key={dia} elegido={cambios.fecha === dia} onClick={() => poner('fecha', dia)}>
              <span className="capitalize">
                {DIA_DE_LA_SEMANA.format(new Date(`${dia}T12:00:00`))} {Number(dia.slice(8, 10))}
              </span>
            </Chip>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <SelectorDeHora rotulo="Empieza" valor={cambios.horaInicio} alCambiar={elegirInicio} />
          {duracion === 'otra' ? (
            <SelectorDeHora rotulo="Termina" valor={cambios.horaFin} alCambiar={(hora) => poner('horaFin', hora)} />
          ) : (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-texto-tenue">Termina</span>
              <span className="flex h-12 items-center px-4 font-mono text-base text-texto-tenue">{cambios.horaFin || '--:--'}</span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {DURACIONES.map((minutos) => (
            <Chip key={minutos} elegido={duracion === minutos} onClick={() => elegirDuracion(minutos)}>
              {etiquetaDeDuracion(minutos)}
            </Chip>
          ))}
          <Chip elegido={duracion === 'otra'} onClick={() => elegirDuracion('otra')}>
            Otra
          </Chip>
        </div>
      </Bloque>

      <Bloque titulo="Dónde">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-texto-tenue">Espacio</span>
          <input value={cambios.sala} onChange={(evento) => poner('sala', evento.target.value)} className={campo} />
        </label>
        {datos.evento.ejes.length === 0 ? null : (
          <div className="flex flex-wrap gap-2">
            <Chip elegido={cambios.eje === ''} onClick={() => poner('eje', '')}>
              Sin eje
            </Chip>
            {datos.evento.ejes.map((uno) => (
              <Chip key={uno} elegido={cambios.eje === uno} onClick={() => poner('eje', uno)}>
                {uno}
              </Chip>
            ))}
          </div>
        )}
      </Bloque>

      {error === null ? null : (
        <p className="rounded-2xl bg-[var(--tono-rojo)] px-4 py-3 text-sm [color:var(--tono-rojo-texto)]">{error}</p>
      )}

      <div className="flex items-center justify-between gap-2">
        {inicial === null ? (
          <BotonMind variante="tenue" onClick={alTerminar}>
            Cancelar
          </BotonMind>
        ) : confirmando ? (
          <span className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void borrar()}
              className="flex h-10 cursor-pointer items-center gap-2 rounded-full bg-[var(--tono-rojo)] px-5 text-sm font-medium [color:var(--tono-rojo-texto)]"
            >
              <Icono nombre="delete" className="text-lg" /> Sí, eliminar
            </button>
            <BotonMind variante="tenue" onClick={() => setConfirmando(false)}>
              No
            </BotonMind>
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <BotonMind variante="tenue" icono="delete" onClick={() => setConfirmando(true)}>
              Eliminar
            </BotonMind>
            <BotonMind variante="tenue" icono="mic" onClick={() => void navegar(`/ponencias?ver=${inicial.id}`)}>
              Ver ponencia
            </BotonMind>
          </span>
        )}
        <BotonMind disabled={guardando || !completo} onClick={() => void guardar()}>
          {guardando ? 'Guardando…' : inicial === null ? 'Crear sesión' : 'Guardar'} <Icono nombre="arrow_forward" className="text-lg" />
        </BotonMind>
      </div>
    </div>
  )
}

/*
  Cada bloque es su propia capa (lo anima la entrada), así que el que tiene
  el foco —el de la hora, con su lista abierta— sube por encima del
  siguiente; sin esto la lista de horas quedaba debajo de "Dónde".
*/
function Bloque({ titulo, children }: { titulo: string; children: ReactNode }): ReactElement {
  return (
    <section className="relative flex flex-col gap-3 rounded-[20px] bg-panel p-4 focus-within:z-20">
      <span className="text-xs font-semibold tracking-wide text-texto-tenue uppercase">{titulo}</span>
      {children}
    </section>
  )
}
