import type { ReactElement } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useSession } from '@/features/auth/session'
import { mensajeDeError } from '@/shared/errors'
import { SelectorDeFecha } from '@/shared/ui'
import { CargaDelEvento } from '../components/CargaDelEvento'
import { BotonMind, Chip, EncabezadoDePagina, Icono, Tarjeta } from '../components/piezas'
import { actualizarEvento, cambiarEje, direccionDeArchivo, subirFormato } from '../repositorio'
import { useEvento } from '../useEvento'
import type { DatosDelEvento } from '../tipos'

/*
  La configuración del evento: sus datos, sus ejes y cómo se redactan sus
  memorias. Todo lo que vale para el evento entero vive aquí, y no repartido
  entre ajustes de la cuenta y cada pantalla.

  El formato es uno por evento y lo acompañan unas indicaciones en lenguaje
  natural ("si no hay teléfono, omite ese campo"): se escriben una vez y se
  aplican a todas las memorias, sin configurar campo por campo.
*/
export function PantallaEvento(): ReactElement {
  return <CargaDelEvento>{(datos) => <Evento datos={datos} />}</CargaDelEvento>
}

type Pestana = 'datos' | 'ejes' | 'formato'

const CAMPO =
  'h-12 rounded-2xl bg-panel px-4 text-base text-texto shadow-[0_0_0_1px_var(--bitacora-filete-fuerte)] outline-none transition-shadow duration-500 focus:shadow-[0_0_0_3px_var(--mind-tonal),0_0_0_1px_var(--bitacora-filete-fuerte)]'

function Evento({ datos }: { datos: DatosDelEvento }): ReactElement {
  const [parametros, setParametros] = useSearchParams()
  const pestana = (parametros.get('ver') as Pestana | null) ?? 'datos'

  return (
    <div className="flex flex-col gap-4">
      <EncabezadoDePagina titulo={datos.evento.nombre} />
      <div className="flex gap-2">
        {(
          [
            ['datos', 'Datos'],
            ['ejes', 'Ejes'],
            ['formato', 'Formato de memorias'],
          ] as const
        ).map(([valor, etiqueta]) => (
          <Chip key={valor} elegido={pestana === valor} onClick={() => setParametros({ ver: valor }, { replace: true })}>
            {etiqueta}
          </Chip>
        ))}
      </div>
      <div key={pestana} className="entrar-escalonado flex flex-col gap-2">
        {pestana === 'datos' ? <Datos datos={datos} /> : null}
        {pestana === 'ejes' ? <Ejes datos={datos} /> : null}
        {pestana === 'formato' ? <Formato datos={datos} /> : null}
      </div>
    </div>
  )
}

function useGuardado(): { estado: string; error: string | null; guardar: (accion: () => Promise<{ ok: boolean; codigo?: string }>) => Promise<void> } {
  const { invalidar } = useEvento()
  const [estado, setEstado] = useState<'quieto' | 'guardando' | 'guardado'>('quieto')
  const [error, setError] = useState<string | null>(null)
  return {
    estado: estado === 'guardando' ? 'Guardando…' : estado === 'guardado' ? 'Guardado' : 'Guardar',
    error,
    guardar: async (accion) => {
      setEstado('guardando')
      setError(null)
      const resultado = await accion()
      if (!resultado.ok) {
        setError(mensajeDeError((resultado.codigo ?? 'DATOS_FALLO_INESPERADO') as Parameters<typeof mensajeDeError>[0]))
        setEstado('quieto')
        return
      }
      invalidar()
      setEstado('guardado')
    },
  }
}

function Datos({ datos }: { datos: DatosDelEvento }): ReactElement {
  const [valores, setValores] = useState({
    descripcion: datos.evento.descripcion,
    lugar: datos.evento.lugar,
    fechaInicio: datos.evento.fechaInicio ?? '',
    fechaFin: datos.evento.fechaFin ?? '',
  })
  const { estado, error, guardar } = useGuardado()

  return (
    <Tarjeta className="flex max-w-3xl flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-texto-tenue">Descripción</span>
        <textarea
          rows={3}
          value={valores.descripcion}
          onChange={(evento) => setValores({ ...valores, descripcion: evento.target.value })}
          className={`${CAMPO} h-auto resize-none py-3`}
        />
      </label>
      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-texto-tenue">Empieza</span>
          <SelectorDeFecha
            valor={valores.fechaInicio || null}
            alElegir={(iso) => setValores({ ...valores, fechaInicio: iso })}
            etiquetaAccesible="Empieza"
            vacio="Elegir fecha"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-texto-tenue">Termina</span>
          <SelectorDeFecha
            valor={valores.fechaFin || null}
            alElegir={(iso) => setValores({ ...valores, fechaFin: iso })}
            etiquetaAccesible="Termina"
            vacio="Elegir fecha"
            {...(valores.fechaInicio === '' ? {} : { minimo: valores.fechaInicio })}
          />
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-texto-tenue">Lugar</span>
          <input value={valores.lugar} onChange={(evento) => setValores({ ...valores, lugar: evento.target.value })} className={CAMPO} />
        </label>
      </div>
      {error === null ? null : <Error texto={error} />}
      <BotonMind className="w-fit" onClick={() => void guardar(() => actualizarEvento(datos.evento.id, valores))}>
        {estado}
      </BotonMind>
    </Tarjeta>
  )
}

function Ejes({ datos }: { datos: DatosDelEvento }): ReactElement {
  const [nuevo, setNuevo] = useState('')
  const { error, guardar } = useGuardado()
  const usos = (eje: string): number => datos.ponencias.filter((ponencia) => ponencia.eje === eje).length

  return (
    <Tarjeta className="flex max-w-3xl flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {datos.evento.ejes.map((eje) => (
          <FilaDeEje
            key={eje}
            eje={eje}
            sesiones={usos(eje)}
            alRenombrar={(nombre) => void guardar(() => cambiarEje(datos.evento, eje, nombre))}
            alQuitar={() => void guardar(() => cambiarEje(datos.evento, eje, null))}
          />
        ))}
        {datos.evento.ejes.length === 0 ? <li className="text-texto-tenue">Este evento no usa ejes.</li> : null}
      </ul>
      <div className="flex gap-2">
        <input value={nuevo} onChange={(evento) => setNuevo(evento.target.value)} placeholder="Nuevo eje" className={`${CAMPO} flex-1`} />
        <BotonMind
          icono="add"
          disabled={nuevo.trim() === '' || datos.evento.ejes.includes(nuevo.trim())}
          onClick={() => {
            const nombre = nuevo.trim()
            setNuevo('')
            void guardar(() => actualizarEvento(datos.evento.id, { ejes: [...datos.evento.ejes, nombre] }))
          }}
        >
          Añadir
        </BotonMind>
      </div>
      {error === null ? null : <Error texto={error} />}
    </Tarjeta>
  )
}

function FilaDeEje({
  eje,
  sesiones,
  alRenombrar,
  alQuitar,
}: {
  eje: string
  sesiones: number
  alRenombrar: (nombre: string) => void
  alQuitar: () => void
}): ReactElement {
  const [nombre, setNombre] = useState(eje)
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-panel py-2 pr-2 pl-4">
      <input
        value={nombre}
        onChange={(evento) => setNombre(evento.target.value)}
        onBlur={() => (nombre.trim() !== '' && nombre.trim() !== eje ? alRenombrar(nombre.trim()) : setNombre(eje))}
        className="min-w-0 flex-1 bg-transparent font-medium outline-none"
      />
      <span className="text-sm text-texto-tenue">
        {sesiones} {sesiones === 1 ? 'sesión' : 'sesiones'}
      </span>
      <button
        type="button"
        onClick={alQuitar}
        aria-label={`Quitar ${eje}`}
        className="flex size-9 cursor-pointer items-center justify-center rounded-full text-texto-tenue transition-colors hover:bg-[var(--mind-variante)] hover:text-texto"
      >
        <Icono nombre="close" className="text-lg" />
      </button>
    </li>
  )
}

function Formato({ datos }: { datos: DatosDelEvento }): ReactElement {
  const { usuario } = useSession()
  const [indicaciones, setIndicaciones] = useState(datos.evento.indicacionesDeMemoria)
  const [descarga, setDescarga] = useState<string | null>(null)
  const archivo = useRef<HTMLInputElement>(null)
  const formato = useGuardado()
  const reglas = useGuardado()

  useEffect(() => {
    if (datos.evento.formatoDeMemoria !== null) {
      void direccionDeArchivo(datos.evento.formatoDeMemoria).then(setDescarga)
    }
  }, [datos.evento.formatoDeMemoria])

  const nombre = datos.evento.formatoDeMemoria?.split('/').pop() ?? null

  return (
    <div className="grid grid-cols-2 gap-2">
      <Tarjeta className="flex flex-col gap-5">
        <span className="text-2xl font-medium">Formato</span>
        <div className="flex items-center gap-4 rounded-[20px] bg-panel p-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-acento text-acento-contraste">
            <Icono nombre="description" className="text-2xl" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium">{nombre ?? 'Sin formato'}</span>
            <span className="text-sm text-texto-tenue">Word con el diseño de la institución</span>
          </span>
        </div>
        <div className="flex gap-2">
          {descarga === null ? null : (
            <a href={descarga} className="flex h-10 items-center gap-2 rounded-full bg-acento-tenue px-5 text-sm font-medium transition-colors hover:bg-filete">
              <Icono nombre="download" className="text-lg" /> Descargar
            </a>
          )}
          <BotonMind icono="upload" onClick={() => archivo.current?.click()}>
            Reemplazar
          </BotonMind>
          <input
            ref={archivo}
            type="file"
            accept=".docx"
            hidden
            onChange={(evento) => {
              const elegido = evento.target.files?.[0]
              if (elegido !== undefined) {
                void formato.guardar(() => subirFormato(usuario?.id ?? '', datos.evento, elegido))
              }
            }}
          />
        </div>
        {formato.error === null ? null : <Error texto={formato.error} />}
      </Tarjeta>

      <Tarjeta className="flex flex-col gap-5">
        <span className="text-2xl font-medium">Indicaciones</span>
        <textarea
          rows={9}
          value={indicaciones}
          onChange={(evento) => setIndicaciones(evento.target.value)}
          placeholder="Ej. Si el ponente no tiene teléfono, omite ese campo."
          className={`${CAMPO} h-auto resize-none py-3 text-[15px] leading-relaxed`}
        />
        {reglas.error === null ? null : <Error texto={reglas.error} />}
        <BotonMind className="w-fit" onClick={() => void reglas.guardar(() => actualizarEvento(datos.evento.id, { indicacionesDeMemoria: indicaciones }))}>
          {reglas.estado}
        </BotonMind>
      </Tarjeta>
    </div>
  )
}

function Error({ texto }: { texto: string }): ReactElement {
  return <p className="rounded-2xl bg-[var(--tono-rojo)] px-4 py-3 text-sm [color:var(--tono-rojo-texto)]">{texto}</p>
}
