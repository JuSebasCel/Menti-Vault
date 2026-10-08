import type { ReactElement } from 'react'
import { useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useSession } from '@/features/auth/session'
import { mensajeDeError } from '@/shared/errors'
import { Modal } from '@/shared/ui'
import { CargaDelEvento } from '../components/CargaDelEvento'
import { PanelLateral } from '../components/PanelLateral'
import { BotonMind, Chip, EncabezadoDePagina, Icono } from '../components/piezas'
import { fecha } from '../formato'
import { actualizarSesion, crearSesion } from '../repositorio'
import type { CambiosDeSesion } from '../repositorio'
import { useEvento } from '../useEvento'
import type { DatosDelEvento, Ponencia, TipoDeSesion } from '../tipos'

/*
  La agenda: dónde se define la estructura del evento y dónde se ve.

  Cada sesión tiene día, hora, espacio, tipo y, si el evento los usa, eje. La
  jornada no se escribe: se lee de la hora. Así la estructura es la del
  evento real y no la de las carpetas en las que alguien guardó las
  grabaciones.

  La vista por días calca el calendario de Melon Mind (celdas grises de radio
  16, el día en círculo negro); los talleres van en negro porque duran el
  doble y son lo que más organiza la jornada.
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

function minutosDe(hora: string | null): number | null {
  if (hora === null) {
    return null
  }
  const [horas, minutos] = hora.split(':').map(Number)
  return (horas ?? 0) * 60 + (minutos ?? 0)
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

/* La vista elegida se recuerda: volver a la agenda y encontrarla cambiada obliga a elegirla otra vez. */
const CLAVE_DE_VISTA = 'menti-vista-de-agenda'

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
  const setVista = (siguiente: 'dias' | 'lista'): void => {
    setVistaEnEstado(siguiente)
    try {
      window.localStorage.setItem(CLAVE_DE_VISTA, siguiente)
    } catch {
      // Sin almacenamiento la vista se recuerda solo mientras dure la pantalla.
    }
  }
  const [eje, setEje] = useState<string | null>(null)
  const [origen, setOrigen] = useState<DOMRect | null>(null)
  const botonNueva = useRef<HTMLButtonElement>(null)

  const dias = useMemo(() => diasDelEvento(datos), [datos])
  const ejes = datos.evento.ejes
  const visibles = datos.ponencias.filter((ponencia) => eje === null || ponencia.eje === eje)
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

  const abrir = (ponencia: Ponencia, elemento: HTMLElement): void => {
    setOrigen(elemento.getBoundingClientRect())
    cambiar('sesion', ponencia.id)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <EncabezadoDePagina titulo={dias.length === 0 ? 'Agenda' : `Agenda · ${fecha(dias[0] ?? null)} al ${fecha(dias.at(-1) ?? null)}`}>
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

      {ejes.length === 0 ? null : (
        <div className="flex gap-2">
          <Chip elegido={eje === null} onClick={() => setEje(null)}>
            Todos los ejes
          </Chip>
          {ejes.map((uno) => (
            <Chip key={uno} elegido={eje === uno} onClick={() => setEje(uno)}>
              {uno}
            </Chip>
          ))}
        </div>
      )}

      {vista === 'dias' ? (
        <VistaPorDias dias={dias} sesiones={visibles} alAbrir={abrir} />
      ) : (
        <VistaDeLista dias={dias} sesiones={visibles} alAbrir={abrir} />
      )}

      <PanelLateral abierto={editando !== null} alCerrar={() => cambiar('sesion', null)} origen={origen} titulo={editando?.titulo ?? 'Sesión'}>
        {editando === null ? null : (
          <FormularioDeSesion
            key={editando.id}
            datos={datos}
            dias={dias}
            inicial={editando}
            alTerminar={() => cambiar('sesion', null)}
          />
        )}
      </PanelLateral>

      <Modal
        abierto={creando}
        alCerrar={() => cambiar('nueva', null)}
        titulo="Nueva sesión"
        anclaEn={botonNueva}
        ancho="normal"
        cerrarAlPulsarElVelo={false}
      >
        <FormularioDeSesion datos={datos} dias={dias} inicial={null} alTerminar={() => cambiar('nueva', null)} />
      </Modal>
    </div>
  )
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
  const conHora = sesiones.filter((sesion) => sesion.horaInicio !== null)
  const inicios = conHora.map((sesion) => minutosDe(sesion.horaInicio) ?? 0)
  const fines = conHora.map((sesion) => minutosDe(sesion.horaFin) ?? (minutosDe(sesion.horaInicio) ?? 0) + 60)
  const primeraHora = inicios.length === 0 ? 8 : Math.floor(Math.min(...inicios) / 60)
  const ultimaHora = fines.length === 0 ? 18 : Math.ceil(Math.max(...fines) / 60)
  const horas = Array.from({ length: ultimaHora - primeraHora }, (_, indice) => primeraHora + indice)
  const sinHora = sesiones.filter((sesion) => sesion.horaInicio === null)

  return (
    <div className="entrar-escalonado flex flex-col gap-2">
      <div className="grid gap-2" style={{ gridTemplateColumns: `56px repeat(${dias.length}, minmax(0, 1fr))` }}>
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
            <span key={hora} className="absolute right-2 text-xs text-texto-tenue" style={{ top: indice * ALTO_DE_HORA - 7 }}>
              {String(hora).padStart(2, '0')}:00
            </span>
          ))}
        </div>

        {dias.map((dia) => (
          <div key={dia} className="relative" style={{ height: horas.length * ALTO_DE_HORA }}>
            {horas.map((hora, indice) => (
              <div
                key={hora}
                className="absolute inset-x-0 rounded-[16px] bg-panel"
                style={{ top: indice * ALTO_DE_HORA + 2, height: ALTO_DE_HORA - 4 }}
              />
            ))}
            {conHora
              .filter((sesion) => sesion.fecha === dia)
              .map((sesion) => {
                const inicio = (minutosDe(sesion.horaInicio) ?? 0) - primeraHora * 60
                const fin = (minutosDe(sesion.horaFin) ?? (minutosDe(sesion.horaInicio) ?? 0) + 60) - primeraHora * 60
                const oscuro = sesion.tipo === 'taller'
                return (
                  <button
                    key={sesion.id}
                    type="button"
                    onClick={(evento) => alAbrir(sesion, evento.currentTarget)}
                    className={`absolute inset-x-1 flex cursor-pointer flex-col gap-1 overflow-hidden rounded-[16px] p-3 text-left transition-transform hover:scale-[1.01] ${oscuro ? 'bg-acento text-acento-contraste' : 'tarjeta-borde bg-fondo text-texto'}`}
                    style={{ top: (inicio / 60) * ALTO_DE_HORA + 2, height: Math.max(((fin - inicio) / 60) * ALTO_DE_HORA - 4, 36) }}
                  >
                    <span className={`text-xs ${oscuro ? 'opacity-70' : 'text-texto-tenue'}`}>
                      {sesion.horaInicio} – {sesion.horaFin} · {TIPOS.find((tipo) => tipo.valor === sesion.tipo)?.etiqueta}
                    </span>
                    <span className="line-clamp-2 text-sm leading-snug font-medium">{sesion.titulo}</span>
                    <span className={`truncate text-xs ${oscuro ? 'opacity-70' : 'text-texto-tenue'}`}>{sesion.ponente}</span>
                  </button>
                )
              })}
          </div>
        ))}
      </div>

      {sinHora.length === 0 ? null : (
        <div className="flex flex-col gap-2 pt-2">
          <span className="px-1 text-sm text-texto-tenue">Sin hora asignada</span>
          <div className="flex flex-wrap gap-2">
            {sinHora.map((sesion) => (
              <button
                key={sesion.id}
                type="button"
                onClick={(evento) => alAbrir(sesion, evento.currentTarget)}
                className="tarjeta-borde cursor-pointer rounded-[16px] px-4 py-2 text-sm hover:bg-panel"
              >
                {sesion.titulo}
              </button>
            ))}
          </div>
        </div>
      )}
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
      {dias.map((dia) => (
        <div key={dia} className="tarjeta-borde flex gap-6 rounded-[24px] p-4">
          <div className="flex w-20 shrink-0 flex-col items-center gap-1 pt-1">
            <span className="text-sm capitalize">{DIA_DE_LA_SEMANA.format(new Date(`${dia}T12:00:00`))}</span>
            <span className="flex size-12 items-center justify-center rounded-full bg-acento text-xl font-semibold text-acento-contraste">
              {Number(dia.slice(8, 10))}
            </span>
          </div>
          <ol className="flex flex-1 flex-col gap-1">
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
                      {sesion.horaInicio ?? '—'} – {sesion.horaFin ?? '—'}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">{sesion.titulo}</span>
                      <span className="truncate text-sm text-texto-tenue">
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
  const { invalidar: refrescar } = useEvento()
  const { usuario } = useSession()
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
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ejes = datos.evento.ejes
  const poner = <C extends keyof CambiosDeSesion>(clave: C, valor: CambiosDeSesion[C]): void => setCambios({ ...cambios, [clave]: valor })

  const guardar = async (): Promise<void> => {
    setGuardando(true)
    setError(null)
    const resultado =
      inicial === null
        ? await crearSesion(usuario?.id ?? '', datos.evento.nombre, cambios)
        : await actualizarSesion(inicial.id, cambios)
    setGuardando(false)
    if (!resultado.ok) {
      setError(mensajeDeError(resultado.codigo))
      return
    }
    refrescar()
    alTerminar()
  }

  return (
    <div className="entrar-escalonado flex flex-col gap-4 px-2 pt-2 pb-2">
      {inicial === null ? null : <span className="text-[28px] leading-tight font-semibold">{inicial.titulo}</span>}

      <Campo rotulo="Título" valor={cambios.titulo} alCambiar={(valor) => poner('titulo', valor)} />
      <Campo rotulo="Ponente" valor={cambios.ponente} alCambiar={(valor) => poner('ponente', valor)} sugerencias={datos.ponentes.map((ponente) => ponente.nombre)} />

      <div className="flex flex-col gap-2">
        <span className="text-xs text-texto-tenue">Día</span>
        <div className="flex gap-2">
          {dias.map((dia) => (
            <Chip key={dia} elegido={cambios.fecha === dia} onClick={() => poner('fecha', dia)}>
              {fecha(dia)}
            </Chip>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Campo rotulo="Empieza" tipo="time" valor={cambios.horaInicio} alCambiar={(valor) => poner('horaInicio', valor)} />
        <Campo rotulo="Termina" tipo="time" valor={cambios.horaFin} alCambiar={(valor) => poner('horaFin', valor)} />
        <Campo rotulo="Espacio" valor={cambios.sala} alCambiar={(valor) => poner('sala', valor)} />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs text-texto-tenue">Tipo</span>
        <div className="flex flex-wrap gap-2">
          {TIPOS.map((tipo) => (
            <Chip key={tipo.valor} elegido={cambios.tipo === tipo.valor} onClick={() => poner('tipo', tipo.valor)}>
              {tipo.etiqueta}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs text-texto-tenue">Eje</span>
        <div className="flex flex-wrap gap-2">
          <Chip elegido={cambios.eje === ''} onClick={() => poner('eje', '')}>
            Sin eje
          </Chip>
          {ejes.map((uno) => (
            <Chip key={uno} elegido={cambios.eje === uno} onClick={() => poner('eje', uno)}>
              {uno}
            </Chip>
          ))}
        </div>
      </div>

      {error === null ? null : <p className="rounded-2xl bg-[var(--mind-alerta)] px-4 py-3 text-sm [color:var(--mind-alerta-texto)]">{error}</p>}

      <div className="flex items-center justify-between gap-2 pt-2">
        {inicial === null ? (
          <BotonMind variante="tenue" onClick={alTerminar}>
            Cancelar
          </BotonMind>
        ) : (
          <BotonMind variante="tenue" icono="mic" onClick={() => void navegar(`/ponencias?ver=${inicial.id}`)}>
            Ver ponencia
          </BotonMind>
        )}
        <BotonMind disabled={guardando || cambios.titulo.trim() === '' || cambios.fecha === ''} onClick={() => void guardar()}>
          {guardando ? 'Guardando…' : inicial === null ? 'Crear sesión' : 'Guardar'} <Icono nombre="arrow_forward" className="text-lg" />
        </BotonMind>
      </div>
    </div>
  )
}

function Campo({
  rotulo,
  valor,
  alCambiar,
  tipo = 'text',
  sugerencias,
}: {
  rotulo: string
  valor: string
  alCambiar: (valor: string) => void
  tipo?: string
  sugerencias?: readonly string[]
}): ReactElement {
  const lista = sugerencias === undefined ? undefined : `sugerencias-${rotulo}`
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs text-texto-tenue">{rotulo}</span>
      <input
        type={tipo}
        value={valor}
        list={lista}
        onChange={(evento) => alCambiar(evento.target.value)}
        className="h-12 rounded-2xl bg-panel px-4 text-base text-texto shadow-[0_0_0_1px_var(--bitacora-filete-fuerte)] outline-none transition-shadow duration-500 focus:shadow-[0_0_0_3px_var(--mind-tonal),0_0_0_1px_var(--bitacora-filete-fuerte)]"
      />
      {lista === undefined ? null : (
        <datalist id={lista}>
          {sugerencias?.map((sugerencia) => <option key={sugerencia} value={sugerencia} />)}
        </datalist>
      )}
    </label>
  )
}
