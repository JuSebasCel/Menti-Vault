import type { ReactElement } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Icono } from './piezas'

/*
  Elegir una hora de la agenda sin el campo nativo del navegador, que en
  español pide a. m./p. m. y se maneja peor que una lista. Es una lista de
  24 horas cada cinco minutos, de 07:00 a 22:55, que se abre ya desplazada
  hasta la hora elegida (o las 09:00 si no hay ninguna).

  El botón es el valor, como en el resto de selectores del sistema.
*/
const HORAS = Array.from({ length: 16 * 12 }, (_, indice) => {
  const minutos = 7 * 60 + indice * 5
  return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`
})

export function SelectorDeHora({
  valor,
  alCambiar,
  rotulo,
}: {
  valor: string
  alCambiar: (hora: string) => void
  rotulo: string
}): ReactElement {
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement>(null)
  const lista = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (!abierto) {
      return
    }
    const elegida = lista.current?.querySelector<HTMLElement>(`[data-hora="${valor || '09:00'}"]`)
    if (elegida !== null && elegida !== undefined && lista.current !== null) {
      lista.current.scrollTop = elegida.offsetTop - lista.current.clientHeight / 2 + 20
    }
    const alPulsarFuera = (evento: MouseEvent): void => {
      if (!caja.current?.contains(evento.target as Node)) {
        setAbierto(false)
      }
    }
    window.addEventListener('mousedown', alPulsarFuera)
    return () => window.removeEventListener('mousedown', alPulsarFuera)
  }, [abierto, valor])

  return (
    <div ref={caja} className="relative flex flex-col gap-1.5">
      <span className="text-xs text-texto-tenue">{rotulo}</span>
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        aria-expanded={abierto}
        className="flex h-12 cursor-pointer items-center gap-2 rounded-2xl bg-panel px-4 text-left shadow-[0_0_0_1px_var(--bitacora-filete-fuerte)]"
      >
        <Icono nombre="schedule" relleno={false} className="text-xl text-texto-tenue" />
        <span className={`flex-1 font-mono text-base ${valor === '' ? 'text-texto-tenue' : 'text-texto'}`}>{valor === '' ? '--:--' : valor}</span>
        <Icono nombre="expand_more" className="text-xl text-texto-tenue" />
      </button>
      {!abierto ? null : (
        <ul
          ref={lista}
          className="entrar-escalonado absolute top-full z-30 mt-1 flex max-h-60 w-full flex-col overflow-y-auto rounded-[20px] bg-fondo p-1 shadow-[0_0_0_1px_var(--bitacora-filete),0_12px_32px_-12px_rgb(0_0_0/0.3)]"
        >
          {HORAS.map((hora) => (
            <li key={hora}>
              <button
                type="button"
                data-hora={hora}
                onClick={() => {
                  alCambiar(hora)
                  setAbierto(false)
                }}
                className={`h-10 w-full cursor-pointer rounded-[14px] px-4 text-left font-mono text-sm transition-colors ${hora === valor ? 'bg-acento text-acento-contraste' : 'hover:bg-panel'}`}
              >
                {hora}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
