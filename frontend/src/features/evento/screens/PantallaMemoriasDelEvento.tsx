import type { ReactElement } from 'react'
import { useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Modal } from '@/shared/ui'
import { CargaDelEvento } from '../components/CargaDelEvento'
import { PanelLateral } from '../components/PanelLateral'
import { VisorDePdf } from '../components/VisorDePdf'
import { Miniatura } from '../components/MiniaturaDeMemoria'
import { BotonMind, Chip, EncabezadoDePagina, Estado, Icono, Tarjeta } from '../components/piezas'
import { APROBACION, estaAprobada, fecha, fechaYHora, mismoPonente } from '../formato'
import type { DatosDelEvento, Memoria, Ponencia } from '../tipos'

/*
  Los entregables escritos del evento, de lo más amplio a lo más concreto: la
  memoria general, las de cada eje y las de cada ponencia. Todas con el mismo
  formato y las mismas indicaciones, que se configuran en el evento.

  Una memoria solo puede hacerse con lo que está listo: transcrito,
  autorizado por su ponente y con su texto aprobado. "Nueva memoria" lo
  comprueba antes de redactar y dice qué falta en vez de dejar generar un
  documento que no se podría entregar.
*/
export function PantallaMemoriasDelEvento(): ReactElement {
  return <CargaDelEvento>{(datos) => <Memorias datos={datos} />}</CargaDelEvento>
}

/* Lo que una ponencia necesita para entrar a una memoria, en el orden en que se resuelve. */
function requisitos(ponencia: Ponencia, datos: DatosDelEvento): { texto: string; ok: boolean }[] {
  const ponente = datos.ponentes.find((uno) => mismoPonente(ponencia.ponente, uno.nombre))
  return [
    { texto: 'Transcrita', ok: ponencia.tieneTranscripcion },
    { texto: 'Autorizada por su ponente', ok: ponente?.consentimiento === 'aceptado' && ponente.usos.memoria === true },
    { texto: 'Texto aprobado', ok: estaAprobada(ponencia.aprobacion) },
  ]
}

function Memorias({ datos }: { datos: DatosDelEvento }): ReactElement {
  const [parametros, setParametros] = useSearchParams()
  const [abierta, setAbierta] = useState<Memoria | null>(null)
  const [origen, setOrigen] = useState<DOMRect | null>(null)
  const botonNueva = useRef<HTMLButtonElement>(null)
  const creando = parametros.get('nueva') === '1'

  const general = datos.memorias.find((memoria) => memoria.alcance === 'evento')
  const porEje = datos.memorias.filter((memoria) => memoria.alcance === 'agrupacion' && memoria.archivoPdf !== null)
  const porPonencia = datos.memorias.filter((memoria) => memoria.alcance === 'ponencia' && memoria.archivoPdf !== null)
  const listas = datos.ponencias.filter((ponencia) => requisitos(ponencia, datos).every((requisito) => requisito.ok)).length

  const abrir = (memoria: Memoria, boton: HTMLElement): void => {
    setOrigen(boton.getBoundingClientRect())
    setAbierta(memoria)
  }

  const cambiarCreando = (si: boolean): void => {
    const siguientes = new URLSearchParams(parametros)
    if (si) {
      siguientes.set('nueva', '1')
    } else {
      siguientes.delete('nueva')
    }
    setParametros(siguientes, { replace: true })
  }

  return (
    <div className="flex flex-col gap-4">
      <EncabezadoDePagina titulo="Memorias">
        <BotonMind ref={botonNueva} icono="add" onClick={() => cambiarCreando(true)}>
          Nueva memoria
        </BotonMind>
      </EncabezadoDePagina>

      {general?.archivoPdf == null ? null : (
        <Tarjeta variante="rellena" className="entrar-escalonado flex gap-6">
          <button type="button" onClick={(evento) => abrir(general, evento.currentTarget)} className="w-40 shrink-0 cursor-pointer">
            <Miniatura rutaPdf={general.archivoPdf} titulo={general.nombre} />
          </button>
          <div className="flex flex-1 flex-col justify-between gap-4 py-1">
            <div className="flex flex-col gap-1">
              <span className="text-2xl font-semibold">Memoria general</span>
              <span className="text-sm text-texto-tenue">
                Generada el {fechaYHora(general.generadaEl)} · el evento terminó el {fecha(datos.evento.fechaFin)}
              </span>
            </div>
            <div className="flex flex-col gap-3">
              <span className="text-base leading-none font-medium opacity-80">Incluye</span>
              <span className="text-[45px] leading-none font-semibold">
                {listas} de {datos.ponencias.length} sesiones
              </span>
            </div>
            <div className="flex gap-2">
              <BotonMind icono="open_in_new" onClick={(evento) => abrir(general, evento.currentTarget)}>
                Abrir
              </BotonMind>
              <BotonMind variante="tenue" icono="refresh" onClick={() => cambiarCreando(true)}>
                Actualizar
              </BotonMind>
            </div>
          </div>
        </Tarjeta>
      )}

      {porEje.length === 0 ? null : (
        <>
          <h2 className="px-1 pt-2 text-2xl font-medium">Por eje</h2>
          <div className="entrar-escalonado grid grid-cols-4 gap-2">
            {porEje.map((memoria) => (
              <TarjetaDeMemoria
                key={memoria.id}
                memoria={memoria}
                titulo={memoria.agrupacion ?? memoria.nombre}
                detalle={`${datos.ponencias.filter((ponencia) => ponencia.eje === memoria.agrupacion && estaAprobada(ponencia.aprobacion)).length} sesiones aprobadas`}
                alAbrir={abrir}
              />
            ))}
          </div>
        </>
      )}

      <h2 className="px-1 pt-2 text-2xl font-medium">Por ponencia</h2>
      <div className="entrar-escalonado grid grid-cols-4 gap-2">
        {porPonencia.map((memoria) => {
          const ponencia = datos.ponencias.find((una) => una.id === memoria.idConferencia)
          return (
            <TarjetaDeMemoria
              key={memoria.id}
              memoria={memoria}
              titulo={ponencia?.titulo ?? memoria.nombre}
              detalle={ponencia?.ponente ?? ''}
              estado={ponencia === undefined ? undefined : <Estado {...APROBACION[ponencia.aprobacion]} />}
              alAbrir={abrir}
            />
          )
        })}
      </div>

      <PanelLateral abierto={abierta !== null} alCerrar={() => setAbierta(null)} origen={origen} titulo={abierta?.nombre ?? 'Memoria'}>
        {abierta?.archivoPdf == null ? null : (
          <div className="entrar-escalonado flex flex-col gap-2 pt-2">
            <div className="flex flex-col gap-1 px-2 pb-2">
              <span className="text-2xl font-medium">{abierta.nombre}</span>
              <span className="flex items-center gap-1.5 text-sm text-texto-tenue">
                <Icono nombre="schedule" relleno={false} className="text-base" />
                {fechaYHora(abierta.generadaEl)}
              </span>
            </div>
            <CambioPedido memoria={abierta} datos={datos} />
            <VisorDePdf ruta={abierta.archivoPdf} rutaDocx={abierta.archivoDocx} titulo={abierta.nombre} />
          </div>
        )}
      </PanelLateral>

      <Modal abierto={creando} alCerrar={() => cambiarCreando(false)} titulo="Nueva memoria" anclaEn={botonNueva} ancho="normal">
        <NuevaMemoria
          datos={datos}
          alAbrir={(memoria) => {
            cambiarCreando(false)
            setOrigen(null)
            setAbierta(memoria)
          }}
        />
      </Modal>
    </div>
  )
}

function TarjetaDeMemoria({
  memoria,
  titulo,
  detalle,
  estado,
  alAbrir,
}: {
  memoria: Memoria
  titulo: string
  detalle: string
  estado?: ReactElement | undefined
  alAbrir: (memoria: Memoria, boton: HTMLElement) => void
}): ReactElement {
  return (
    <button
      type="button"
      onClick={(evento) => alAbrir(memoria, evento.currentTarget)}
      className="tarjeta-borde flex cursor-pointer flex-col gap-3 rounded-[24px] bg-fondo p-3 text-left transition-colors hover:bg-panel"
    >
      {memoria.archivoPdf === null ? null : <Miniatura rutaPdf={memoria.archivoPdf} titulo={memoria.nombre} />}
      <span className="flex flex-col gap-2 px-1 pb-1">
        <span className="line-clamp-2 text-[15px] leading-snug font-medium">{titulo}</span>
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-sm text-texto-tenue">{detalle}</span>
          {estado}
        </span>
      </span>
    </button>
  )
}

type Alcance = 'ponencia' | 'eje' | 'evento'

function NuevaMemoria({ datos, alAbrir }: { datos: DatosDelEvento; alAbrir: (memoria: Memoria) => void }): ReactElement {
  const navegar = useNavigate()
  const [alcance, setAlcance] = useState<Alcance>('ponencia')
  const [idPonencia, setIdPonencia] = useState<string | null>(null)
  const [eje, setEje] = useState<string | null>(datos.evento.ejes[0] ?? null)

  const incluidas =
    alcance === 'ponencia'
      ? datos.ponencias.filter((ponencia) => ponencia.id === idPonencia)
      : alcance === 'eje'
        ? datos.ponencias.filter((ponencia) => ponencia.eje === eje)
        : datos.ponencias
  const listas = incluidas.filter((ponencia) => requisitos(ponencia, datos).every((requisito) => requisito.ok))
  const existente =
    alcance === 'evento'
      ? datos.memorias.find((memoria) => memoria.alcance === 'evento')
      : alcance === 'eje'
        ? datos.memorias.find((memoria) => memoria.alcance === 'agrupacion' && memoria.agrupacion === eje)
        : datos.memorias.find((memoria) => memoria.idConferencia === idPonencia)
  const formatoListo = datos.evento.formatoDeMemoria !== null
  const reglas = datos.evento.indicacionesDeMemoria.split('\n').filter((linea) => linea.trim() !== '').length

  return (
    <div className="flex flex-col gap-5 pb-2">
      <div className="flex gap-2">
        {(
          [
            ['ponencia', 'Una ponencia'],
            ['eje', 'Un eje'],
            ['evento', 'El evento completo'],
          ] as const
        ).map(([valor, etiqueta]) => (
          <Chip key={valor} elegido={alcance === valor} onClick={() => setAlcance(valor)}>
            {etiqueta}
          </Chip>
        ))}
      </div>

      {alcance === 'ponencia' ? (
        <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
          {datos.ponencias.map((ponencia) => {
            const faltan = requisitos(ponencia, datos).filter((requisito) => !requisito.ok)
            return (
              <li key={ponencia.id}>
                <button
                  type="button"
                  onClick={() => setIdPonencia(ponencia.id)}
                  className={`flex w-full cursor-pointer items-center gap-3 rounded-[16px] px-4 py-2.5 text-left transition-colors ${idPonencia === ponencia.id ? 'bg-acento text-acento-contraste' : 'hover:bg-panel'}`}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[15px] font-medium">{ponencia.titulo}</span>
                    <span className="truncate text-sm opacity-70">{ponencia.ponente}</span>
                  </span>
                  {faltan.length === 0 ? <Estado etiqueta="Lista" tono="verde" /> : <Estado etiqueta={`Falta: ${faltan[0]?.texto.toLowerCase()}`} tono="ambar" />}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}

      {alcance === 'eje' ? (
        <div className="flex flex-wrap gap-2">
          {datos.evento.ejes.map((uno) => (
            <Chip key={uno} elegido={eje === uno} onClick={() => setEje(uno)}>
              {uno}
            </Chip>
          ))}
        </div>
      ) : null}

      {/* Lo que se va a usar, comprobado antes de redactar. */}
      <div className="flex flex-col gap-2 rounded-[20px] bg-panel p-4">
        <Requisito ok={alcance !== 'ponencia' || idPonencia !== null} texto={alcance === 'ponencia' ? 'Ponencia elegida' : `${listas.length} de ${incluidas.length} sesiones listas para entrar`} />
        {alcance === 'ponencia' && idPonencia !== null
          ? requisitos(incluidas[0] as Ponencia, datos).map((requisito) => <Requisito key={requisito.texto} {...requisito} />)
          : null}
        <Requisito ok={formatoListo} texto={formatoListo ? `Formato: ${datos.evento.formatoDeMemoria?.split('/').pop() ?? ''}` : 'Falta el formato del evento'} />
        <Requisito ok texto={reglas === 0 ? 'Sin indicaciones de redacción' : `${reglas} indicaciones de redacción`} />
      </div>

      <div className="flex items-center justify-between gap-2">
        <BotonMind variante="tenue" icono="tune" onClick={() => void navegar('/evento?ver=formato')}>
          Formato e indicaciones
        </BotonMind>
        {existente?.archivoPdf != null ? (
          <BotonMind icono="open_in_new" onClick={() => alAbrir(existente)}>
            Ya existe · abrir
          </BotonMind>
        ) : (
          <BotonMind icono="edit_note" disabled={listas.length === 0 || !formatoListo}>
            Generar memoria
          </BotonMind>
        )}
      </div>
    </div>
  )
}

function Requisito({ ok, texto }: { ok: boolean; texto: string }): ReactElement {
  return (
    <span className="flex items-center gap-2 text-sm">
      <Icono nombre={ok ? 'check_circle' : 'error'} className={`text-lg ${ok ? '[color:var(--tono-verde-texto)]' : '[color:var(--tono-ambar-texto)]'}`} />
      {texto}
    </span>
  )
}

/* Lo que el ponente pidió corregir, encima de su memoria: es lo primero que hay que comprobar al abrirla. */
function CambioPedido({ memoria, datos }: { memoria: Memoria; datos: DatosDelEvento }): ReactElement | null {
  const ponencia = datos.ponencias.find((una) => una.id === memoria.idConferencia)
  if (ponencia === undefined || ponencia.comentarioDelPonente === '') {
    return null
  }
  return (
    <div className="flex flex-col gap-2 rounded-[20px] bg-[var(--tono-azul)] px-5 py-4 [color:var(--tono-azul-texto)]">
      <span className="flex items-center gap-2 text-sm font-semibold">
        <Icono nombre="edit_note" className="text-lg" /> {ponencia.ponente.split(' ')[0]} pidió cambiar
      </span>
      <span className="text-[15px] leading-relaxed">«{ponencia.comentarioDelPonente}»</span>
      <span className="flex items-center gap-1.5 text-sm opacity-80">
        <Icono nombre="check_circle" className="text-base" /> Aplicado en esta versión
      </span>
    </div>
  )
}
