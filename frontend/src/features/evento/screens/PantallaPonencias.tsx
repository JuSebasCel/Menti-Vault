import type { ReactElement } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { FragmentoDeAudio } from '@/features/conferencias/components/FragmentoDeAudio'
import { CargaDelEvento } from '../components/CargaDelEvento'
import { PanelLateral } from '../components/PanelLateral'
import { VisorDePdf } from '../components/VisorDePdf'
import { BotonMind, Chip, Dato, EncabezadoDePagina, Estado, Icono, Tarjeta } from '../components/piezas'
import { APROBACION, duracion, fecha, fechaYHora, minuto } from '../formato'
import { leerTranscripcion } from '../repositorio'
import type { DatosDelEvento, Ponencia, Segmento } from '../tipos'

/*
  Las ponencias del evento, agrupadas como el evento las agrupa.

  La agrupación es texto libre (jornada, eje, mesa): se respeta el orden en
  que aparecen y no se ordenan alfabéticamente, porque "Día 1 · Tarde" va
  después de "Día 1 · Mañana" aunque el alfabeto diga lo contrario.
*/
export function PantallaPonencias(): ReactElement {
  return <CargaDelEvento>{(datos) => <Ponencias datos={datos} />}</CargaDelEvento>
}

function Ponencias({ datos }: { datos: DatosDelEvento }): ReactElement {
  const [parametros, setParametros] = useSearchParams()
  const [origen, setOrigen] = useState<DOMRect | null>(null)
  const abierta = datos.ponencias.find((ponencia) => ponencia.id === parametros.get('ver')) ?? null

  const grupos = useMemo(() => {
    const porGrupo = new Map<string, Ponencia[]>()
    for (const ponencia of datos.ponencias) {
      const clave = ponencia.agrupacion || 'Sin agrupar'
      porGrupo.set(clave, [...(porGrupo.get(clave) ?? []), ponencia])
    }
    return [...porGrupo.entries()]
  }, [datos.ponencias])

  const ver = (id: string | null): void => {
    const siguientes = new URLSearchParams(parametros)
    if (id === null) {
      siguientes.delete('ver')
    } else {
      siguientes.set('ver', id)
    }
    setParametros(siguientes, { replace: true })
  }

  return (
    <div className="flex flex-col gap-4">
      <EncabezadoDePagina titulo="Ponencias" />

      <div className="entrar-escalonado flex flex-col gap-4">
        {grupos.map(([grupo, ponencias]) => (
          <section key={grupo} className="flex flex-col gap-2">
            <h2 className="px-1 text-sm font-medium text-texto-tenue">{grupo}</h2>
            <div className="grid grid-cols-2 gap-2">
              {ponencias.map((ponencia) => (
                <button
                  key={ponencia.id}
                  type="button"
                  onClick={(evento) => {
                    setOrigen(evento.currentTarget.getBoundingClientRect())
                    ver(ponencia.id)
                  }}
                  className="tarjeta-borde flex cursor-pointer flex-col gap-4 rounded-[24px] bg-fondo p-5 text-left transition-colors hover:bg-panel"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="line-clamp-2 text-lg leading-snug font-medium">{ponencia.titulo}</span>
                    <Estado {...APROBACION[ponencia.aprobacion]} />
                  </span>
                  <span className="flex items-center gap-4 text-sm text-texto-tenue">
                    <span className="flex items-center gap-1.5">
                      <Icono nombre="person" relleno={false} className="text-lg" />
                      {ponencia.ponente}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Icono nombre="schedule" relleno={false} className="text-lg" />
                      {duracion(ponencia.duracionEnSegundos)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      <PanelLateral abierto={abierta !== null} alCerrar={() => ver(null)} origen={origen} titulo={abierta?.titulo ?? 'Ponencia'}>
        {abierta === null ? null : <DetalleDePonencia ponencia={abierta} datos={datos} />}
      </PanelLateral>
    </div>
  )
}

type Pestana = 'transcripcion' | 'memoria' | 'aprobacion'

function DetalleDePonencia({ ponencia, datos }: { ponencia: Ponencia; datos: DatosDelEvento }): ReactElement {
  const [pestana, setPestana] = useState<Pestana>('transcripcion')
  const memoria = datos.memorias.find((una) => una.idConferencia === ponencia.id)

  return (
    <div className="entrar-escalonado flex flex-col gap-2 pt-2">
      <Tarjeta variante="rellena" className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <span className="text-2xl leading-tight font-medium">{ponencia.titulo}</span>
          <Estado {...APROBACION[ponencia.aprobacion]} />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Dato rotulo="Ponente">{ponencia.ponente}</Dato>
          <Dato rotulo="Sesión">
            {ponencia.agrupacion} · {fecha(ponencia.fecha)}
          </Dato>
          <Dato rotulo="Duración">{duracion(ponencia.duracionEnSegundos)}</Dato>
        </div>
      </Tarjeta>

      <div className="flex gap-2 py-2">
        <Chip elegido={pestana === 'transcripcion'} onClick={() => setPestana('transcripcion')}>
          Transcripción
        </Chip>
        <Chip elegido={pestana === 'memoria'} onClick={() => setPestana('memoria')}>
          Memoria
        </Chip>
        <Chip elegido={pestana === 'aprobacion'} onClick={() => setPestana('aprobacion')}>
          Aprobación
        </Chip>
      </div>

      {pestana === 'transcripcion' ? <Transcripcion ponencia={ponencia} /> : null}
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
        <div className="flex flex-col gap-1 rounded-2xl bg-pildora-azul px-4 py-3 text-pildora-azul-texto">
          <span className="text-sm font-medium">Lo que pidió corregir</span>
          <span>{ponencia.comentarioDelPonente}</span>
        </div>
      )}

      <p className="text-sm text-texto-tenue">
        Hasta que el ponente la apruebe, esta ponencia no entra a la memoria general ni a la producción académica.
      </p>

      {ponencia.aprobacion === 'enviada' ? (
        <BotonMind variante="tenue" icono="notifications" className="w-fit">
          Recordarle al ponente
        </BotonMind>
      ) : null}
    </Tarjeta>
  )
}
