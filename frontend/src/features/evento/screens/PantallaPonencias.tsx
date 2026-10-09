import type { ReactElement } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { FragmentoDeAudio } from '@/features/conferencias/components/FragmentoDeAudio'
import { GaleriaDeFotos } from '../components/GaleriaDeFotos'
import { MaterialDeApoyo } from '../components/MaterialDeApoyo'
import { AsistenteDeGrabacion } from '../components/AsistenteDeGrabacion'
import { descargarPonencia } from '../descargarPonencia'
import { Modal } from '@/shared/ui'
import { carpetaDeFotosDeSesion, eliminarSesion, leerTranscripcion } from '../repositorio'
import { useEvento } from '../useEvento'
import { alTerminarUnaTarea, analizarEnSegundoPlano, estadoParaMostrar, useTareasEnSegundoPlano } from '@/features/conferencias/carga/segundoPlano'
import type { TareaEnSegundoPlano } from '@/features/conferencias/carga/segundoPlano'
import { CargaDelEvento } from '../components/CargaDelEvento'
import { CampoDeBusqueda, Filtros, normalizarBusqueda } from '../components/Filtros'
import { PanelLateral } from '../components/PanelLateral'
import { VisorDePdf } from '../components/VisorDePdf'
import { BotonMind, Chip, Cifra, Dato, EncabezadoDePagina, Estado, Icono, Tarjeta } from '../components/piezas'
import { CONSENTIMIENTO, MOMENTO, duracion, fecha, fechaYHora, minuto, mismoPonente, momentoDe } from '../formato'
import { USOS_DEL_CONSENTIMIENTO } from '../tipos'
import type { DatosDelEvento, Ponencia, Segmento } from '../tipos'

/*
  Las ponencias del evento en una sola lista, como la tabla de pacientes de
  la referencia, ordenadas por cuándo ocurrieron.

  Se filtran con chips por día y por estado en vez de partirse en bloques: la
  estructura del evento vive en la agenda, y repetirla aquí como encabezados
  obligaba a recorrer la pantalla entera para comparar dos charlas.
*/
export function PantallaPonencias(): ReactElement {
  return <CargaDelEvento>{(datos) => <Ponencias datos={datos} />}</CargaDelEvento>
}

const DIA_CORTO = new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric' })

/* Las grabaciones en cola que ya se mandaron a transcribir en esta visita. */
const arrancadas = new Set<string>()

type Orden = 'recientes' | 'antiguas' | 'agenda' | 'titulo'

/* Por defecto, lo último que se agregó arriba: es lo que se acaba de crear y se quiere encontrar. */
const ORDENES: Record<Orden, (una: Ponencia, otra: Ponencia) => number> = {
  recientes: (una, otra) => otra.creadaEl.localeCompare(una.creadaEl),
  antiguas: (una, otra) => una.creadaEl.localeCompare(otra.creadaEl),
  agenda: (una, otra) => `${una.fecha} ${una.horaInicio ?? '99'}`.localeCompare(`${otra.fecha} ${otra.horaInicio ?? '99'}`),
  titulo: (una, otra) => una.titulo.localeCompare(otra.titulo, 'es'),
}

function Ponencias({ datos }: { datos: DatosDelEvento }): ReactElement {
  const [parametros, setParametros] = useSearchParams()
  const [origen, setOrigen] = useState<DOMRect | null>(null)
  const [dia, setDia] = useState<string | null>(null)
  const [estado, setEstado] = useState<'todas' | 'aprobadas' | 'revision'>('todas')
  const [eje, setEje] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [orden, setOrden] = useState<Orden>('recientes')
  const abierta = datos.ponencias.find((ponencia) => ponencia.id === parametros.get('ver')) ?? null
  const { invalidar } = useEvento()
  const tareas = useTareasEnSegundoPlano()

  /*
    Mientras algo se transcribe se vuelve a leer el evento cada pocos
    segundos, para que la fila pase sola de "Transcribiendo…" a lista o a
    fallida. Sin nada en curso no se pregunta: la lista no cambia sola.
  */
  const transcribiendo = datos.ponencias.filter(
    (ponencia) =>
      ponencia.estado === 'procesando' || (ponencia.estado === 'en-cola' && ponencia.tieneFuente) || estadoParaMostrar(ponencia, tareas.get(ponencia.id))?.fase === 'iniciando',
  )
  const enCurso = transcribiendo.length > 0

  /*
    Una grabación subida que se quedó en cola —la pestaña se cerró antes de
    pedir el análisis, o el servidor dormía— se arranca sola al volver aquí.
    Transcribir no es un paso que alguien tenga que acordarse de pedir: se
    sube el audio y se transcribe. Una sola vez por visita, para no insistir
    si el servidor la rechaza.
  */
  useEffect(() => {
    for (const ponencia of datos.ponencias) {
      if (ponencia.estado === 'en-cola' && ponencia.tieneFuente && !tareas.has(ponencia.id) && !arrancadas.has(ponencia.id)) {
        arrancadas.add(ponencia.id)
        void analizarEnSegundoPlano(ponencia.id)
      }
    }
  }, [datos.ponencias, tareas])
  useEffect(() => {
    alTerminarUnaTarea(invalidar)
    if (!enCurso) {
      return () => alTerminarUnaTarea(null)
    }
    const intervalo = window.setInterval(invalidar, 8000)
    return () => {
      window.clearInterval(intervalo)
      alTerminarUnaTarea(null)
    }
  }, [enCurso, invalidar])
  const subiendo = parametros.get('subir') === '1'
  const botonSubir = useRef<HTMLButtonElement>(null)

  const dias = useMemo(() => [...new Set(datos.ponencias.map((ponencia) => ponencia.fecha))].sort(), [datos.ponencias])
  const buscado = normalizarBusqueda(busqueda)
  const visibles = datos.ponencias.filter(
    (ponencia) =>
      (buscado === '' || normalizarBusqueda(`${ponencia.titulo} ${ponencia.ponente}`).includes(buscado)) &&
      (dia === null || ponencia.fecha === dia) &&
      (eje === null || ponencia.eje === eje) &&
      (estado === 'todas' ||
        (estado === 'aprobadas' ? momentoDe(ponencia) === 'ocurrio' : ['hoy', 'proxima'].includes(momentoDe(ponencia)))),
  ).sort(ORDENES[orden])

  const cambiar = (clave: string, valor: string | null): void => {
    const siguientes = new URLSearchParams(parametros)
    if (valor === null) {
      siguientes.delete(clave)
      if (clave === 'subir') {
        siguientes.delete('sesion')
      }
    } else {
      siguientes.set(clave, valor)
    }
    setParametros(siguientes, { replace: true })
  }
  const ver = (id: string | null): void => cambiar('ver', id)

  return (
    <div className="flex flex-col gap-4">
      <EncabezadoDePagina titulo="Ponencias">
        <CampoDeBusqueda valor={busqueda} alCambiar={setBusqueda} placeholder="Buscar por título o ponente" />
        <Filtros
          grupos={[
            {
              clave: 'orden',
              rotulo: 'Orden',
              icono: 'sort',
              valor: orden,
              porDefecto: 'recientes',
              alCambiar: (valor) => setOrden(valor as Orden),
              opciones: [
                { valor: 'recientes', etiqueta: 'Más recientes' },
                { valor: 'antiguas', etiqueta: 'Más antiguas' },
                { valor: 'agenda', etiqueta: 'Por agenda' },
                { valor: 'titulo', etiqueta: 'Por título (A-Z)' },
              ],
            },
            {
              clave: 'dia',
              rotulo: 'Día',
              icono: 'calendar_today',
              valor: dia ?? 'todos',
              porDefecto: 'todos',
              alCambiar: (valor) => setDia(valor === 'todos' ? null : valor),
              opciones: [
                { valor: 'todos', etiqueta: 'Todos' },
                ...dias.map((uno) => ({ valor: uno, etiqueta: DIA_CORTO.format(new Date(`${uno}T12:00:00`)) })),
              ],
            },
            {
              clave: 'estado',
              rotulo: 'Estado',
              icono: 'task_alt',
              valor: estado,
              porDefecto: 'todas',
              alCambiar: (valor) => setEstado(valor as typeof estado),
              opciones: [
                { valor: 'todas', etiqueta: 'Todas' },
                { valor: 'aprobadas', etiqueta: 'Ya ocurrieron' },
                { valor: 'revision', etiqueta: 'Por ocurrir' },
              ],
            },
            {
              clave: 'eje',
              rotulo: 'Eje',
              icono: 'category',
              valor: eje ?? 'todos',
              porDefecto: 'todos',
              alCambiar: (valor) => setEje(valor === 'todos' ? null : valor),
              opciones: [{ valor: 'todos', etiqueta: 'Todos' }, ...datos.evento.ejes.map((uno) => ({ valor: uno, etiqueta: uno }))],
            },
          ]}
        />
        <BotonMind ref={botonSubir} icono="upload" onClick={() => cambiar('subir', '1')}>
          Subir grabación
        </BotonMind>
      </EncabezadoDePagina>

      {transcribiendo.length === 0 ? null : (
        <div className="entrar-escalonado flex items-center gap-3 rounded-[20px] bg-[var(--tono-azul)] px-5 py-3 [color:var(--tono-azul-texto)]">
          <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span className="text-sm">
            {transcribiendo.length === 1
              ? `Transcribiendo «${transcribiendo[0]?.titulo ?? ''}».`
              : `Transcribiendo ${transcribiendo.length} grabaciones.`}{' '}
            Una charla de una hora tarda unos minutos; la lista se actualiza sola y puedes seguir trabajando.
          </span>
        </div>
      )}

      <div className="entrar-escalonado grid grid-cols-4 gap-2">
        <Tarjeta variante="rellena">
          <Cifra rotulo="Sesiones" valor={datos.ponencias.length} />
        </Tarjeta>
        <Tarjeta variante="rellena">
          <Cifra rotulo="Ya ocurrieron" valor={datos.ponencias.filter((ponencia) => momentoDe(ponencia) === 'ocurrio').length} />
        </Tarjeta>
        <Tarjeta variante="rellena">
          <Cifra rotulo="Por ocurrir" valor={datos.ponencias.filter((ponencia) => ['hoy', 'proxima'].includes(momentoDe(ponencia))).length} />
        </Tarjeta>
        <Tarjeta variante="rellena">
          <Cifra
            rotulo="Con memoria"
            valor={datos.ponencias.filter((ponencia) => datos.memorias.some((memoria) => memoria.idConferencia === ponencia.id)).length}
          />
        </Tarjeta>
      </div>

      <div className="tarjeta-borde overflow-hidden rounded-[24px]">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-filete">
              <th className="px-3 py-3 font-normal">Ponencia</th>
              <th className="px-3 py-3 font-normal">Cuándo</th>
              <th className="px-3 py-3 font-normal">Duración</th>
              <th className="px-3 py-3 font-normal">Eje</th>
              <th className="px-3 py-3 font-normal">Estado</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {visibles.map((ponencia) => (
              <tr key={ponencia.id} className="border-b border-filete last:border-0">
                <td className="max-w-md px-3 py-2.5">
                  <span className="flex flex-col">
                    <span className="truncate">{ponencia.titulo}</span>
                    <span className="truncate text-texto-tenue">
                      {ponencia.ponente}
                      {ponencia.tieneTranscripcion ? '' : ' · sin grabación todavía'}
                    </span>
                  </span>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <span className="capitalize">{DIA_CORTO.format(new Date(`${ponencia.fecha}T12:00:00`))}</span>
                  {ponencia.horaInicio === null ? '' : ` · ${ponencia.horaInicio}`}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">{duracion(ponencia.duracionEnSegundos)}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">{ponencia.eje || '—'}</td>
                <td className="px-3 py-2.5">
                  <EstadoDeLaGrabacion ponencia={ponencia} tarea={tareas.get(ponencia.id)} porDefecto={<Estado {...MOMENTO[momentoDe(ponencia)]} />} />
                </td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  {ponencia.tieneTranscripcion || ponencia.tieneFuente || tareas.has(ponencia.id) ? null : (
                    <button
                      type="button"
                      onClick={() => {
                        const siguientes = new URLSearchParams(parametros)
                        siguientes.set('subir', '1')
                        siguientes.set('sesion', ponencia.id)
                        setParametros(siguientes, { replace: true })
                      }}
                      className="mr-1 inline-flex h-9 cursor-pointer items-center gap-1 rounded-full bg-acento px-3 font-medium text-acento-contraste transition-opacity hover:opacity-85"
                    >
                      <Icono nombre="upload" className="text-base" />
                      Subir grabación
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(evento) => {
                      setOrigen(evento.currentTarget.getBoundingClientRect())
                      ver(ponencia.id)
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

      <PanelLateral abierto={abierta !== null} alCerrar={() => ver(null)} origen={origen} titulo={abierta?.titulo ?? 'Ponencia'}>
        {abierta === null ? null : <DetalleDePonencia key={abierta.id} ponencia={abierta} datos={datos} alEliminar={() => ver(null)} inicial={(parametros.get('pestana') as Pestana | null) ?? 'transcripcion'} />}
      </PanelLateral>

      <Modal
        abierto={subiendo}
        alCerrar={() => cambiar('subir', null)}
        titulo="Subir grabación"
        anclaje="disparador"
        anclaEn={botonSubir}
        ancho="normal"
        cerrarAlPulsarElVelo={false}
      >
        <AsistenteDeGrabacion
          key={parametros.get('subir') ?? ''}
          datos={datos}
          idInicial={parametros.get('sesion')}
          alTerminar={() => cambiar('subir', null)}
        />
      </Modal>
    </div>
  )
}

/*
  En qué va la grabación de una sesión, en su propia fila: antes, al subir un
  audio no quedaba ninguna señal de que se estuviera transcribiendo, y el
  botón de subir seguía ahí invitando a subirlo otra vez.
*/
function EstadoDeLaGrabacion({
  ponencia,
  tarea: local,
  porDefecto,
}: {
  ponencia: Ponencia
  tarea: TareaEnSegundoPlano | undefined
  porDefecto: ReactElement
}): ReactElement {
  /* La tarea local manda solo mientras la base no haya avanzado ni fallado; si no, se queda colgada en "Transcribiendo…". */
  const tarea = estadoParaMostrar(ponencia, local) ?? undefined
  if (tarea?.fase === 'error' || (tarea === undefined && ponencia.estado === 'fallida')) {
    return (
      <span className="inline-flex items-center gap-1.5" title={tarea?.fase === 'error' ? tarea.mensaje : 'La transcripción falló'}>
        <span className="rounded-full bg-[var(--tono-rojo)] px-2.5 py-1 text-xs font-medium whitespace-nowrap [color:var(--tono-rojo-texto)]">Falló</span>
        <button
          type="button"
          aria-label="Reintentar la transcripción"
          title="Reintentar"
          onClick={() => void analizarEnSegundoPlano(ponencia.id)}
          className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[var(--mind-neutro)] transition-colors hover:bg-[var(--mind-variante)]"
        >
          <Icono nombre="refresh" className="text-base" />
        </button>
      </span>
    )
  }
  if (tarea !== undefined || ponencia.estado === 'procesando') {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-[var(--tono-azul)] px-2.5 py-1 text-xs font-medium whitespace-nowrap [color:var(--tono-azul-texto)]">
        <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        {tarea?.fase === 'subiendo' ? 'Subiendo…' : 'Transcribiendo…'}
      </span>
    )
  }
  if (ponencia.estado === 'en-cola' && ponencia.tieneFuente) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-[var(--tono-azul)] px-2.5 py-1 text-xs font-medium whitespace-nowrap [color:var(--tono-azul-texto)]">
        <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        En cola
      </span>
    )
  }
  return porDefecto
}

type Pestana = 'transcripcion' | 'material' | 'memoria' | 'autorizacion'

function DetalleDePonencia({
  ponencia,
  datos,
  inicial,
  alEliminar,
}: {
  ponencia: Ponencia
  datos: DatosDelEvento
  inicial: Pestana
  alEliminar: () => void
}): ReactElement {
  const { invalidar } = useEvento()
  const [pestana, setPestana] = useState<Pestana>(inicial)
  const [confirmando, setConfirmando] = useState(false)
  const [borrando, setBorrando] = useState(false)

  /* Como en la agenda: es de verdad aun en demostración, porque borrar ya es una decisión explícita y confirmada. */
  const borrar = async (): Promise<void> => {
    setBorrando(true)
    const resultado = await eliminarSesion(ponencia.id)
    setBorrando(false)
    if (resultado.ok) {
      invalidar()
      alEliminar()
    }
  }
  const [descargando, setDescargando] = useState<string | null>(null)
  const memoria = datos.memorias.find((una) => una.idConferencia === ponencia.id)

  return (
    <div className="entrar-escalonado flex flex-col gap-2 pt-2">
      <Tarjeta variante="rellena" className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <span className="text-2xl leading-tight font-medium">{ponencia.titulo}</span>
          <Estado {...MOMENTO[momentoDe(ponencia)]} />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Dato rotulo="Ponente">{ponencia.ponente}</Dato>
          <Dato rotulo="Cuándo">
            {fecha(ponencia.fecha)}
            {ponencia.horaInicio === null ? '' : ` · ${ponencia.horaInicio} – ${ponencia.horaFin ?? ''}`}
          </Dato>
          <Dato rotulo="Duración">{duracion(ponencia.duracionEnSegundos)}</Dato>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <BotonMind
          variante="tenue"
          icono="folder_zip"
          disabled={descargando !== null}
          className="w-fit"
          onClick={() => {
            setDescargando('Preparando…')
            void descargarPonencia(ponencia, datos, setDescargando).finally(() => setDescargando(null))
          }}
        >
          {descargando ?? 'Descargar todo'}
        </BotonMind>
        {confirmando ? (
          <span className="flex items-center gap-2">
            <button
              type="button"
              disabled={borrando}
              onClick={() => void borrar()}
              className="flex h-10 cursor-pointer items-center gap-2 rounded-full bg-[var(--tono-rojo)] px-5 text-sm font-medium [color:var(--tono-rojo-texto)]"
            >
              <Icono nombre="delete" className="text-lg" /> {borrando ? 'Eliminando…' : 'Sí, eliminar la ponencia'}
            </button>
            <BotonMind variante="tenue" onClick={() => setConfirmando(false)}>
              No
            </BotonMind>
          </span>
        ) : (
          <BotonMind variante="tenue" icono="delete" onClick={() => setConfirmando(true)}>
            Eliminar
          </BotonMind>
        )}
        </div>
      </Tarjeta>

      <div className="flex gap-2 py-2">
        <Chip elegido={pestana === 'transcripcion'} onClick={() => setPestana('transcripcion')}>
          Transcripción
        </Chip>
        <Chip elegido={pestana === 'material'} onClick={() => setPestana('material')}>
          Material
        </Chip>
        <Chip elegido={pestana === 'memoria'} onClick={() => setPestana('memoria')}>
          Memoria
        </Chip>
        <Chip elegido={pestana === 'autorizacion'} onClick={() => setPestana('autorizacion')}>
          Autorización
        </Chip>
      </div>

      {pestana === 'transcripcion' ? <Transcripcion ponencia={ponencia} /> : null}
      {pestana === 'material' ? (
        <>
          <MaterialDeApoyo idDueno={ponencia.idDueno} idConferencia={ponencia.id} />
          <GaleriaDeFotos
            carpeta={carpetaDeFotosDeSesion(ponencia.idDueno, ponencia.id)}
            titulo="Fotos de la sesión"
            vacio="Fotos del ponente o del público: se usan para agradecer en redes."
          />
        </>
      ) : null}
      {pestana === 'memoria' ? (
        memoria?.archivoPdf == null ? (
          <Tarjeta>
            <p className="text-texto-tenue">Esta ponencia todavía no tiene memoria.</p>
          </Tarjeta>
        ) : (
          <VisorDePdf ruta={memoria.archivoPdf} rutaDocx={memoria.archivoDocx} titulo={memoria.nombre} />
        )
      ) : null}
      {pestana === 'autorizacion' ? <Autorizacion ponencia={ponencia} datos={datos} /> : null}
    </div>
  )
}

/*
  La transcripción con sus minutos. Un clic en un minuto lo deja sonando con
  su contexto: así se comprueba lo que dice la memoria sin buscar en una
  grabación de dos horas.
*/
function Transcripcion({ ponencia }: { ponencia: Ponencia }): ReactElement {
  const [segmentos, setSegmentos] = useState<readonly Segmento[] | null | undefined>(undefined)
  const [busqueda, setBusqueda] = useState('')
  const [sonando, setSonando] = useState<Segmento | null>(null)
  const [copiada, setCopiada] = useState(false)

  /*
    Se copia entera y como texto corrido, con el título y el ponente arriba:
    es para pegarla en otro documento o en un chat, donde los minutos de cada
    fragmento solo estorban.
  */
  const copiar = (): void => {
    if (segmentos == null) {
      return
    }
    const texto = [ponencia.titulo, ponencia.ponente, '', segmentos.map((segmento) => segmento.texto.trim()).join(' ')].join('\n')
    void navigator.clipboard?.writeText(texto).then(() => {
      setCopiada(true)
      window.setTimeout(() => setCopiada(false), 1800)
    })
  }

  useEffect(() => {
    void leerTranscripcion(ponencia.idDueno, ponencia.id).then(setSegmentos)
  }, [ponencia.idDueno, ponencia.id])

  const visibles = useMemo(() => {
    if (segmentos == null) {
      return []
    }
    const buscado = busqueda.trim().toLowerCase()
    return buscado === '' ? segmentos : segmentos.filter((segmento) => segmento.texto.toLowerCase().includes(buscado))
  }, [segmentos, busqueda])

  if (segmentos === undefined) {
    return <div className="h-96 animate-pulse rounded-[24px] bg-panel" />
  }
  if (segmentos === null) {
    return (
      <Tarjeta>
        <p className="text-texto-tenue">No se encontró la transcripción de esta ponencia.</p>
      </Tarjeta>
    )
  }

  return (
    <Tarjeta className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="flex h-11 flex-1 items-center gap-2 rounded-2xl bg-panel px-4">
          <Icono nombre="search" relleno={false} className="text-xl text-texto-tenue" />
          <input
            value={busqueda}
            onChange={(evento) => setBusqueda(evento.target.value)}
            placeholder="Buscar en lo que se dijo"
            className="flex-1 bg-transparent outline-none"
          />
        </span>
        <span className="text-sm whitespace-nowrap text-texto-tenue">
          {busqueda === '' ? `${segmentos.length} fragmentos` : `${visibles.length} coincidencias`}
        </span>
        <BotonMind variante="tenue" icono={copiada ? 'check' : 'content_copy'} onClick={copiar}>
          {copiada ? 'Copiada' : 'Copiar transcripción'}
        </BotonMind>
      </div>

      {sonando === null ? null : (
        <div className="rounded-2xl bg-panel p-3">
          <FragmentoDeAudio idDueno={ponencia.idDueno} idConferencia={ponencia.id} inicio={sonando.inicio} fin={sonando.fin} />
        </div>
      )}

      <ol className="flex max-h-[52vh] flex-col overflow-y-auto">
        {visibles.slice(0, 400).map((segmento) => (
          <li key={`${segmento.inicio}-${segmento.texto.slice(0, 12)}`} className="flex gap-3 rounded-xl px-2 py-1.5 hover:bg-panel">
            <button
              type="button"
              onClick={() => setSonando(segmento)}
              className={`h-6 shrink-0 cursor-pointer rounded-full px-2 font-mono text-xs transition-colors ${sonando === segmento ? 'bg-acento text-acento-contraste' : 'bg-acento-tenue text-texto-tenue hover:text-texto'}`}
            >
              {minuto(segmento.inicio)}
            </button>
            <span className="text-[15px] leading-relaxed">{segmento.texto}</span>
          </li>
        ))}
      </ol>
    </Tarjeta>
  )
}

/*
  Lo único que se le pide a un ponente: el tratamiento de sus datos, uso por
  uso. El texto de su memoria ya no pasa por su aprobación, así que aquí no
  hay pasos de revisión; solo qué autorizó y cuándo.
*/
function Autorizacion({ ponencia, datos }: { ponencia: Ponencia; datos: DatosDelEvento }): ReactElement {
  const ponente = datos.ponentes.find((uno) => mismoPonente(ponencia.ponente, uno.nombre))
  if (ponente === undefined) {
    return (
      <Tarjeta>
        <p className="text-texto-tenue">{ponencia.ponente} no está entre los ponentes del evento.</p>
      </Tarjeta>
    )
  }
  const respondio = ponente.consentimiento === 'aceptado' || ponente.consentimiento === 'rechazado'
  return (
    <Tarjeta className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-2xl">Tratamiento de datos</span>
        <Estado {...CONSENTIMIENTO[ponente.consentimiento]} />
      </div>
      {respondio ? (
        <ul className="flex flex-col gap-2">
          {USOS_DEL_CONSENTIMIENTO.map((uso) => {
            const si = ponente.consentimiento === 'aceptado' && ponente.usos[uso.clave] === true
            return (
              <li key={uso.clave} className="flex items-center gap-3 rounded-2xl bg-panel px-4 py-3">
                <Icono nombre={si ? 'check_circle' : 'cancel'} className={`text-xl ${si ? 'text-validado' : 'text-texto-tenue'}`} />
                <span className="flex-1">{uso.etiqueta}</span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-texto-tenue">
          {ponente.consentimiento === 'sin-enviar'
            ? `Falta el correo de ${ponente.nombre} para enviarle la autorización.`
            : `${ponente.nombre} todavía no ha respondido la autorización.`}
        </p>
      )}
      {ponente.respondidoEl === null ? null : <span className="text-sm text-texto-tenue">Respondió el {fechaYHora(ponente.respondidoEl)}</span>}
    </Tarjeta>
  )
}
