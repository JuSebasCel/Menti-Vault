import type { ReactElement } from 'react'
import { useState } from 'react'
import { CargaDelEvento } from '../components/CargaDelEvento'
import { PanelLateral } from '../components/PanelLateral'
import { VisorDePdf } from '../components/VisorDePdf'
import { BotonMind, EncabezadoDePagina, Estado, Icono, Tarjeta } from '../components/piezas'
import { APROBACION, estaAprobada, fechaYHora } from '../formato'
import type { DatosDelEvento, Memoria } from '../tipos'

/*
  Los entregables escritos del evento: la memoria general, armada solo con
  lo que los ponentes aprobaron, y la memoria de cada ponencia.

  La general dice cuántas ponencias lleva y cuáles faltan. Sin eso, un
  documento con seis de ocho charlas parecería completo, y el organizador
  descubriría el hueco cuando ya lo hubiera enviado.
*/
export function PantallaMemoriasDelEvento(): ReactElement {
  return <CargaDelEvento>{(datos) => <Memorias datos={datos} />}</CargaDelEvento>
}

function Memorias({ datos }: { datos: DatosDelEvento }): ReactElement {
  const [abierta, setAbierta] = useState<Memoria | null>(null)
  const [origen, setOrigen] = useState<DOMRect | null>(null)

  const general = datos.memorias.find((memoria) => memoria.alcance === 'evento')
  const porPonencia = datos.memorias.filter((memoria) => memoria.alcance === 'ponencia' && memoria.archivoPdf !== null)
  const incluidas = datos.ponencias.filter((ponencia) => estaAprobada(ponencia.aprobacion))
  const faltan = datos.ponencias.filter((ponencia) => !estaAprobada(ponencia.aprobacion))

  const abrir = (memoria: Memoria, boton: HTMLElement): void => {
    setOrigen(boton.getBoundingClientRect())
    setAbierta(memoria)
  }

  return (
    <div className="flex flex-col gap-4">
      <EncabezadoDePagina titulo="Memorias" />

      <div className="entrar-escalonado grid grid-cols-3 gap-2">
        {general === undefined ? null : (
          <Tarjeta variante="rellena" className="col-span-2 flex flex-col justify-between gap-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-2xl font-semibold">Memoria general</span>
                <span className="text-sm text-texto-tenue">{general.nombre}</span>
              </div>
              <span className="flex size-12 items-center justify-center rounded-full bg-acento text-acento-contraste">
                <Icono nombre="menu_book" className="text-2xl" />
              </span>
            </div>
            <div className="flex items-end justify-between gap-4">
              <div className="flex flex-col gap-2">
                <span className="text-[45px] leading-none font-semibold">
                  {incluidas.length} de {datos.ponencias.length}
                </span>
                <span className="text-sm text-texto-tenue">
                  ponencias aprobadas incluidas
                  {faltan.length === 0 ? '' : ` · faltan ${faltan.map((ponencia) => ponencia.ponente.split(' ')[0]).join(' y ')}, en revisión`}
                </span>
              </div>
              <BotonMind icono="open_in_new" onClick={(evento) => abrir(general, evento.currentTarget)}>
                Abrir
              </BotonMind>
            </div>
          </Tarjeta>
        )}

        <Tarjeta className="flex flex-col justify-between gap-6">
          <div className="flex flex-col gap-1">
            <span className="text-2xl text-texto-tenue">Formato</span>
            <span className="text-sm text-texto-tenue">La plantilla de la institución con la que se redactan</span>
          </div>
          <div className="flex items-center gap-3 rounded-2xl bg-panel px-4 py-3">
            <Icono nombre="description" className="text-2xl" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">FormatoReducate2026.docx</span>
          </div>
        </Tarjeta>
      </div>

      <h2 className="px-1 pt-2 text-sm font-medium text-texto-tenue">Por ponencia</h2>
      <div className="entrar-escalonado grid grid-cols-4 gap-2">
        {porPonencia.map((memoria) => {
          const ponencia = datos.ponencias.find((una) => una.id === memoria.idConferencia)
          return (
            <button
              key={memoria.id}
              type="button"
              onClick={(evento) => abrir(memoria, evento.currentTarget)}
              className="tarjeta-borde flex cursor-pointer flex-col gap-4 rounded-[24px] bg-fondo p-4 text-left transition-colors hover:bg-panel"
            >
              {/* Una hoja en miniatura: dice "documento" antes de leer nada. */}
              <span className="flex aspect-[3/2] flex-col gap-1.5 rounded-2xl bg-panel p-4">
                <span className="h-2 w-2/3 rounded-full bg-filete-fuerte" />
                <span className="h-1.5 w-full rounded-full bg-filete" />
                <span className="h-1.5 w-full rounded-full bg-filete" />
                <span className="h-1.5 w-4/5 rounded-full bg-filete" />
                <span className="mt-auto h-1.5 w-1/2 rounded-full bg-filete" />
              </span>
              <span className="line-clamp-2 text-[15px] leading-snug font-medium">{ponencia?.titulo ?? memoria.nombre}</span>
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-sm text-texto-tenue">{ponencia?.ponente}</span>
                {ponencia === undefined ? null : <Estado {...APROBACION[ponencia.aprobacion]} />}
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
              <span className="text-sm text-texto-tenue">Generada el {fechaYHora(abierta.generadaEl)}</span>
            </div>
            <VisorDePdf ruta={abierta.archivoPdf} rutaDocx={abierta.archivoDocx} titulo={abierta.nombre} />
          </div>
        )}
      </PanelLateral>
    </div>
  )
}
