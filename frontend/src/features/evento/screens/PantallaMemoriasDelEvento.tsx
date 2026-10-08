import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { CargaDelEvento } from '../components/CargaDelEvento'
import { PanelLateral } from '../components/PanelLateral'
import { VisorDePdf } from '../components/VisorDePdf'
import { BotonMind, EncabezadoDePagina, Estado, Icono, Tarjeta } from '../components/piezas'
import { APROBACION, estaAprobada, fechaYHora } from '../formato'
import { direccionDeArchivo } from '../repositorio'
import type { DatosDelEvento, Memoria } from '../tipos'

/*
  Los entregables escritos del evento: la memoria general —un documento
  propio, con presentación, ejes, síntesis y conclusiones, no la suma de las
  sesiones— y la memoria de cada ponencia. Todas con el mismo formato.

  Cada memoria se reconoce por su primera página real, generada una vez y
  guardada junto al PDF (`miniatura.png`): un dibujo genérico de "documento"
  no distinguía una memoria de otra.
*/
export function PantallaMemoriasDelEvento(): ReactElement {
  return <CargaDelEvento>{(datos) => <Memorias datos={datos} />}</CargaDelEvento>
}

function rutaDeMiniatura(rutaPdf: string): string {
  return `${rutaPdf.slice(0, rutaPdf.lastIndexOf('/'))}/miniatura.png`
}

function Miniatura({ rutaPdf, titulo }: { rutaPdf: string; titulo: string }): ReactElement {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    void direccionDeArchivo(rutaDeMiniatura(rutaPdf)).then(setUrl)
  }, [rutaPdf])

  return (
    <span className="block aspect-[3/4] overflow-hidden rounded-[16px] bg-panel shadow-[0_0_0_1px_var(--bitacora-filete)]">
      {url === null ? null : <img src={url} alt={`Primera página de ${titulo}`} className="size-full object-cover object-top" loading="lazy" />}
    </span>
  )
}

function Memorias({ datos }: { datos: DatosDelEvento }): ReactElement {
  const [abierta, setAbierta] = useState<Memoria | null>(null)
  const [origen, setOrigen] = useState<DOMRect | null>(null)

  const general = datos.memorias.find((memoria) => memoria.alcance === 'evento')
  const porPonencia = datos.memorias.filter((memoria) => memoria.alcance === 'ponencia' && memoria.archivoPdf !== null)
  const incluidas = datos.ponencias.filter((ponencia) => estaAprobada(ponencia.aprobacion)).length

  const abrir = (memoria: Memoria, boton: HTMLElement): void => {
    setOrigen(boton.getBoundingClientRect())
    setAbierta(memoria)
  }

  return (
    <div className="flex flex-col gap-4">
      <EncabezadoDePagina titulo="Memorias" />

      {general?.archivoPdf == null ? null : (
        <Tarjeta variante="rellena" className="entrar-escalonado flex gap-6">
          <button type="button" onClick={(evento) => abrir(general, evento.currentTarget)} className="w-44 shrink-0 cursor-pointer">
            <Miniatura rutaPdf={general.archivoPdf} titulo={general.nombre} />
          </button>
          <div className="flex flex-1 flex-col justify-between gap-4 py-1">
            <div className="flex flex-col gap-1">
              <span className="text-2xl font-semibold">Memoria general</span>
              <span className="text-sm text-texto-tenue">{datos.evento.nombre} · FormatoReducate2026</span>
            </div>
            <div className="flex flex-col gap-3">
              <span className="text-base leading-none font-medium opacity-80">Incluye</span>
              <span className="text-[45px] leading-none font-semibold">
                {incluidas} de {datos.ponencias.length} sesiones
              </span>
            </div>
            <BotonMind icono="open_in_new" className="w-fit" onClick={(evento) => abrir(general, evento.currentTarget)}>
              Abrir
            </BotonMind>
          </div>
        </Tarjeta>
      )}

      <div className="entrar-escalonado grid grid-cols-4 gap-2">
        {porPonencia.map((memoria) => {
          const ponencia = datos.ponencias.find((una) => una.id === memoria.idConferencia)
          return (
            <button
              key={memoria.id}
              type="button"
              onClick={(evento) => abrir(memoria, evento.currentTarget)}
              className="tarjeta-borde flex cursor-pointer flex-col gap-3 rounded-[24px] bg-fondo p-3 text-left transition-colors hover:bg-panel"
            >
              {memoria.archivoPdf === null ? null : <Miniatura rutaPdf={memoria.archivoPdf} titulo={memoria.nombre} />}
              <span className="flex flex-col gap-2 px-1 pb-1">
                <span className="line-clamp-2 text-[15px] leading-snug font-medium">{ponencia?.titulo ?? memoria.nombre}</span>
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm text-texto-tenue">{ponencia?.ponente}</span>
                  {ponencia === undefined ? null : <Estado {...APROBACION[ponencia.aprobacion]} />}
                </span>
              </span>
            </button>
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
            <VisorDePdf ruta={abierta.archivoPdf} rutaDocx={abierta.archivoDocx} titulo={abierta.nombre} />
          </div>
        )}
      </PanelLateral>
    </div>
  )
}
