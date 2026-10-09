import type { ReactElement } from 'react'
import { useId, useMemo, useState } from 'react'
import { normalizarBusqueda } from './Filtros'
import { Icono } from './piezas'
import { mismoPonente, ponentesDe, unirPonentes } from '../formato'
import type { Ponente } from '../tipos'

/*
  Elegir quién da una sesión escribiendo su nombre, con sugerencias de los
  ponentes que coinciden. Reemplaza a la fila de chips con todos los
  ponentes: con treinta nombres había que leerlos uno por uno para encontrar
  el que se buscaba.

  Una sesión puede tener varios ponentes (un panel, una charla a dos voces):
  cada elegido queda como una ficha con su "x", y el campo sigue abierto
  para el siguiente. Se guardan juntos en el campo de la sesión, separados
  por coma (ver `ponentesDe`).

  Si un nombre no existe todavía, se ofrece agregarlo ahí mismo: tener que ir
  a Ponentes, crearlo y volver a la sesión cortaba el flujo justo cuando se
  estaba armando la agenda. Los nuevos se crean al guardar la sesión (ver
  `ponentesNuevos`), sin correo, y su autorización se pide después.
*/
export function SelectorDePonente({
  ponentes,
  valor,
  alCambiar,
}: {
  ponentes: readonly Ponente[]
  /** Los nombres elegidos, separados por coma. */
  valor: string
  alCambiar: (valor: string) => void
}): ReactElement {
  const elegidos = ponentesDe(valor)
  const [texto, setTexto] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [resaltado, setResaltado] = useState(0)
  const idLista = useId()

  const buscado = normalizarBusqueda(texto)
  const sugerencias = useMemo(
    () =>
      ponentes
        .filter((ponente) => !elegidos.some((nombre) => mismoPonente(nombre, ponente.nombre)))
        .filter((ponente) => buscado === '' || normalizarBusqueda(`${ponente.nombre} ${ponente.institucion}`).includes(buscado))
        .slice(0, 6),
    [ponentes, buscado, elegidos],
  )
  const existe = ponentes.some((ponente) => normalizarBusqueda(ponente.nombre) === buscado)
  const opciones: { nombre: string; nuevo: boolean; detalle: string }[] = [
    ...sugerencias.map((ponente) => ({ nombre: ponente.nombre, nuevo: false, detalle: ponente.institucion })),
    ...(texto.trim() !== '' && !existe ? [{ nombre: texto.trim(), nuevo: true, detalle: 'Se agrega a Ponentes al guardar' }] : []),
  ]

  const agregar = (nombre: string): void => {
    alCambiar(unirPonentes([...elegidos, nombre.replace(/,/g, ' ')]))
    setTexto('')
    setResaltado(0)
  }
  const quitar = (nombre: string): void => alCambiar(unirPonentes(elegidos.filter((otro) => otro !== nombre)))

  return (
    <div className="relative flex flex-col gap-1.5">
      <span className="flex min-h-12 flex-wrap items-center gap-1.5 rounded-2xl bg-fondo px-3 py-2 shadow-[0_0_0_1px_var(--bitacora-filete-fuerte)] transition-shadow focus-within:shadow-[0_0_0_3px_var(--mind-tonal),0_0_0_1px_var(--bitacora-filete-fuerte)]">
        <Icono nombre="person_search" relleno={false} className="text-xl text-texto-tenue" />
        {elegidos.map((nombre) => {
          const nuevo = ponenteNuevo(ponentes, nombre)
          return (
            <span
              key={nombre}
              className={`flex h-8 items-center gap-1 rounded-full pr-1 pl-3 text-sm font-medium ${nuevo ? 'bg-[var(--tono-azul)] [color:var(--tono-azul-texto)]' : 'bg-panel'}`}
              title={nuevo ? 'Nuevo: se agrega a Ponentes al guardar' : undefined}
            >
              {nombre}
              <button
                type="button"
                aria-label={`Quitar a ${nombre}`}
                onClick={() => quitar(nombre)}
                className="flex size-6 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-[var(--mind-variante)]"
              >
                <Icono nombre="close" className="text-sm" />
              </button>
            </span>
          )
        })}
        <input
          value={texto}
          role="combobox"
          aria-expanded={abierto}
          aria-controls={idLista}
          aria-autocomplete="list"
          placeholder={elegidos.length === 0 ? 'Escribe el nombre del ponente' : 'Añadir otro ponente'}
          onFocus={() => setAbierto(true)}
          onBlur={() => window.setTimeout(() => setAbierto(false), 120)}
          onChange={(evento) => {
            setTexto(evento.target.value)
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
            } else if (evento.key === 'Enter' && opciones[resaltado] !== undefined) {
              evento.preventDefault()
              agregar(opciones[resaltado].nombre)
            } else if (evento.key === 'Backspace' && texto === '' && elegidos.length > 0) {
              quitar(elegidos[elegidos.length - 1] ?? '')
            }
          }}
          className="h-8 min-w-40 flex-1 bg-transparent px-1 text-base outline-none placeholder:text-texto-tenue"
        />
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
                onClick={() => agregar(opcion.nombre)}
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

/* Si un nombre no es de ningún ponente del evento: hay que crearlo antes de guardar la sesión. */
export function ponenteNuevo(ponentes: readonly Ponente[], nombre: string): boolean {
  return nombre.trim() !== '' && !ponentes.some((ponente) => normalizarBusqueda(ponente.nombre) === normalizarBusqueda(nombre))
}

/* Los nombres de la sesión que todavía no están en el directorio. */
export function ponentesNuevos(ponentes: readonly Ponente[], campo: string): string[] {
  return ponentesDe(campo).filter((nombre) => ponenteNuevo(ponentes, nombre))
}
