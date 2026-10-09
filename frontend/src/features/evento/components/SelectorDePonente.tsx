import type { ReactElement } from 'react'
import { useId, useMemo, useState } from 'react'
import { normalizarBusqueda } from './Filtros'
import { Icono } from './piezas'
import type { Ponente } from '../tipos'

/*
  Elegir quién da una sesión escribiendo su nombre, con sugerencias de los
  ponentes que coinciden. Reemplaza a la fila de chips con todos los
  ponentes: con treinta nombres había que leerlos uno por uno para encontrar
  el que se buscaba.

  Si el nombre no existe todavía, se ofrece agregarlo ahí mismo: tener que ir
  a Ponentes, crearlo y volver a la sesión cortaba el flujo justo cuando se
  estaba armando la agenda. El ponente nuevo se crea al guardar la sesión
  (ver `ponenteNuevo`), sin correo, y su autorización se pide después.
*/
export function SelectorDePonente({
  ponentes,
  valor,
  alCambiar,
}: {
  ponentes: readonly Ponente[]
  valor: string
  alCambiar: (nombre: string) => void
}): ReactElement {
  const [texto, setTexto] = useState(valor)
  const [abierto, setAbierto] = useState(false)
  const [resaltado, setResaltado] = useState(0)
  const idLista = useId()

  const buscado = normalizarBusqueda(texto)
  const sugerencias = useMemo(
    () =>
      ponentes
        .filter((ponente) => buscado === '' || normalizarBusqueda(`${ponente.nombre} ${ponente.institucion}`).includes(buscado))
        .slice(0, 6),
    [ponentes, buscado],
  )
  const existe = ponentes.some((ponente) => normalizarBusqueda(ponente.nombre) === buscado)
  const opciones: { nombre: string; nuevo: boolean; detalle: string }[] = [
    ...sugerencias.map((ponente) => ({ nombre: ponente.nombre, nuevo: false, detalle: ponente.institucion })),
    ...(texto.trim() !== '' && !existe ? [{ nombre: texto.trim(), nuevo: true, detalle: 'Se agrega a Ponentes al guardar' }] : []),
  ]

  const elegir = (nombre: string): void => {
    setTexto(nombre)
    alCambiar(nombre)
    setAbierto(false)
  }

  const esNuevo = valor.trim() !== '' && !ponentes.some((ponente) => normalizarBusqueda(ponente.nombre) === normalizarBusqueda(valor))

  return (
    <div className="relative flex flex-col gap-1.5">
      <span className="flex h-12 items-center gap-2 rounded-2xl bg-fondo px-4 shadow-[0_0_0_1px_var(--bitacora-filete-fuerte)] transition-shadow focus-within:shadow-[0_0_0_3px_var(--mind-tonal),0_0_0_1px_var(--bitacora-filete-fuerte)]">
        <Icono nombre="person_search" relleno={false} className="text-xl text-texto-tenue" />
        <input
          value={texto}
          role="combobox"
          aria-expanded={abierto}
          aria-controls={idLista}
          aria-autocomplete="list"
          placeholder="Escribe el nombre del ponente"
          onFocus={() => setAbierto(true)}
          onBlur={() => window.setTimeout(() => setAbierto(false), 120)}
          onChange={(evento) => {
            setTexto(evento.target.value)
            alCambiar(evento.target.value)
            setResaltado(0)
            setAbierto(true)
          }}
          onKeyDown={(evento) => {
            if (evento.key === 'ArrowDown') {
              evento.preventDefault()
              setResaltado((antes) => Math.min(antes + 1, opciones.length - 1))
            } else if (evento.key === 'ArrowUp') {
              evento.preventDefault()
              setResaltado((antes) => Math.max(antes - 1, 0))
            } else if (evento.key === 'Enter' && abierto && opciones[resaltado] !== undefined) {
              evento.preventDefault()
              elegir(opciones[resaltado].nombre)
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-texto-tenue"
        />
        {esNuevo ? <span className="shrink-0 rounded-full bg-[var(--tono-azul)] px-2.5 py-1 text-xs font-medium [color:var(--tono-azul-texto)]">Nuevo</span> : null}
      </span>

      {abierto && opciones.length > 0 ? (
        <ul
          id={idLista}
          role="listbox"
          className="absolute top-full right-0 left-0 z-30 mt-1 flex max-h-72 flex-col gap-0.5 overflow-y-auto rounded-[20px] bg-fondo p-1.5 shadow-[0_0_0_1px_var(--bitacora-filete),0_16px_32px_-12px_rgb(0_0_0/0.45)]"
        >
          {opciones.map((opcion, indice) => (
            <li key={`${opcion.nuevo ? 'nuevo:' : ''}${opcion.nombre}`} role="option" aria-selected={indice === resaltado}>
              <button
                type="button"
                onMouseDown={(evento) => evento.preventDefault()}
                onMouseEnter={() => setResaltado(indice)}
                onClick={() => elegir(opcion.nombre)}
                className={`flex w-full cursor-pointer items-center gap-3 rounded-[14px] px-3 py-2.5 text-left ${indice === resaltado ? 'bg-panel' : ''}`}
              >
                <Icono nombre={opcion.nuevo ? 'person_add' : 'person'} className="text-xl text-texto-tenue" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[15px] font-medium">{opcion.nuevo ? `Agregar «${opcion.nombre}»` : opcion.nombre}</span>
                  {opcion.detalle === '' ? null : <span className="truncate text-xs text-texto-tenue">{opcion.detalle}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/* Si el nombre elegido no es de ningún ponente del evento: hay que crearlo antes de guardar la sesión. */
export function ponenteNuevo(ponentes: readonly Ponente[], nombre: string): boolean {
  return nombre.trim() !== '' && !ponentes.some((ponente) => normalizarBusqueda(ponente.nombre) === normalizarBusqueda(nombre))
}
