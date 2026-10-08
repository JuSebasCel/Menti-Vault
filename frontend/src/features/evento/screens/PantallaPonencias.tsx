import type { ReactElement } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { FragmentoDeAudio } from '@/features/conferencias/components/FragmentoDeAudio'
import { GaleriaDeFotos } from '../components/GaleriaDeFotos'
import { MaterialDeApoyo } from '../components/MaterialDeApoyo'
import { AsistenteDeGrabacion } from '../components/AsistenteDeGrabacion'
import { descargarPonencia } from '../descargarPonencia'
import { Modal } from '@/shared/ui'
import { carpetaDeFotosDeSesion, leerTranscripcion } from '../repositorio'
import { CargaDelEvento } from '../components/CargaDelEvento'
import { Filtros } from '../components/Filtros'
import { PanelLateral } from '../components/PanelLateral'
import { VisorDePdf } from '../components/VisorDePdf'
import { BotonMind, Chip, Cifra, Dato, EncabezadoDePagina, Estado, Icono, Tarjeta } from '../components/piezas'
import { MOMENTO, duracion, fecha, fechaYHora, minuto, momentoDe } from '../formato'
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

function Ponencias({ datos }: { datos: DatosDelEvento }): ReactElement {
  const [parametros, setParametros] = useSearchParams()
  const [origen, setOrigen] = useState<DOMRect | null>(null)
  const [dia, setDia] = useState<string | null>(null)
  const [estado, setEstado] = useState<'todas' | 'aprobadas' | 'revision'>('todas')
  const [eje, setEje] = useState<string | null>(null)
  const abierta = datos.ponencias.find((ponencia) => ponencia.id === parametros.get('ver')) ?? null
  const subiendo = parametros.get('subir') === '1'
  const botonSubir = useRef<HTMLButtonElement>(null)

  const dias = useMemo(() => [...new Set(datos.ponencias.map((ponencia) => ponencia.fecha))].sort(), [datos.ponencias])
  const visibles = datos.ponencias.filter(
    (ponencia) =>
      (dia === null || ponencia.fecha === dia) &&
      (eje === null || ponencia.eje === eje) &&
      (estado === 'todas' ||
        (estado === 'aprobadas' ? momentoDe(ponencia) === 'ocurrio' : ['hoy', 'proxima'].includes(momentoDe(ponencia)))),
  )

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
        <Filtros
          grupos={[
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
                  <Estado {...MOMENTO[momentoDe(ponencia)]} />
                </td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  {ponencia.tieneTranscripcion ? null : (
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
        {abierta === null ? null : <DetalleDePonencia key={abierta.id} ponencia={abierta} datos={datos} inicial={(parametros.get('pestana') as Pestana | null) ?? 'transcripcion'} />}
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

type Pestana = 'transcripcion' | 'material' | 'memoria' | 'aprobacion'

function DetalleDePonencia({ ponencia, datos, inicial }: { ponencia: Ponencia; datos: DatosDelEvento; inicial: Pestana }): ReactElement {
  const [pestana, setPestana] = useState<Pestana>(inicial)
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
          {descargando ?? 'Descargar todo (.zip)'}
        </BotonMind>
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
        <Chip elegido={pestana === 'aprobacion'} onClick={() => setPestana('aprobacion')}>
          Aprobación
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
      {pestana === 'aprobacion' ? <Aprobacion ponencia={ponencia} /> : null}
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

function Aprobacion({ ponencia }: { ponencia: Ponencia }): ReactElement {
  const pasos = [
    { titulo: 'Memoria redactada', hecho: true, cuando: null },
    { titulo: 'Enviada al ponente para revisión', hecho: ponencia.aprobacion !== 'sin-enviar', cuando: null },
    {
      titulo:
        ponencia.aprobacion === 'con-cambios'
          ? 'Aprobada con cambios'
          : ponencia.aprobacion === 'aprobada'
            ? 'Aprobada por el ponente'
            : 'Esperando la respuesta del ponente',
      hecho: ponencia.aprobacion === 'aprobada' || ponencia.aprobacion === 'con-cambios',
      cuando: ponencia.aprobadaEl,
    },
  ]

  return (
    <Tarjeta className="flex flex-col gap-5">
      <span className="text-2xl">Revisión del ponente</span>
      <ol className="flex flex-col gap-2">
        {pasos.map((paso) => (
          <li key={paso.titulo} className="flex items-center gap-3 rounded-2xl bg-panel px-4 py-3">
            <Icono
              nombre={paso.hecho ? 'check_circle' : 'radio_button_unchecked'}
              relleno={paso.hecho}
              className={`text-xl ${paso.hecho ? 'text-validado' : 'text-texto-tenue'}`}
            />
            <span className="flex-1">{paso.titulo}</span>
            {paso.cuando === null ? null : <span className="text-sm text-texto-tenue">{fechaYHora(paso.cuando)}</span>}
          </li>
        ))}
      </ol>

      {ponencia.comentarioDelPonente === '' ? null : (
        <div className="flex flex-col gap-2 rounded-[20px] bg-[var(--tono-azul)] px-5 py-4 [color:var(--tono-azul-texto)]">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Icono nombre="edit_note" className="text-lg" /> Cambio que pidió el ponente
          </span>
          <span className="text-[15px] leading-relaxed">«{ponencia.comentarioDelPonente}»</span>
          <span className="flex items-center gap-1.5 text-sm opacity-80">
            <Icono nombre="check_circle" className="text-base" /> Aplicado en la memoria: por eso queda aprobada con ajustes.
          </span>
        </div>
      )}

      {ponencia.aprobacion === 'enviada' ? (
        <BotonMind variante="tenue" icono="notifications" className="w-fit">
          Recordarle al ponente
        </BotonMind>
      ) : null}
    </Tarjeta>
  )
}
