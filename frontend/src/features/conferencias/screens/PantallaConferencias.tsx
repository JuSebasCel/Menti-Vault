import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { useSearchParams } from 'react-router'
import { PARAMETRO_DE_CREACION } from '@/app/layout/navegacion'
import { useSession } from '@/features/auth/session'
import { useTemas } from '@/features/taxonomia'
import { mensajeDeError } from '@/shared/errors'
import { ModalDeCarga, useConferenciasVisibles } from '../components'
import type { ResultadoCreacion } from '../components'
import { ModalDeCompartir } from '@/features/configuracion/components'
import {
  escribirCriterios,
  invitacionesPendientes,
  leerCriterios,
  listarConferencias,
  privacidadEfectiva,
} from '../query'
import { responderComparticion } from '@/features/configuracion/comparticiones/repositorio'
import type { CriteriosDeListado } from '../query'
import {
  actualizarConferencia,
  editarFicha,
  eliminarConferencia,
  eliminarFicha,
} from '../repositorio'
import {
  alTerminarUnaTarea,
  analizarEnSegundoPlano,
  descartarAviso,
  useAvisosDeCarga,
} from '../carga/segundoPlano'
import { useEtiquetas } from '../tags'
import { PantallaArchivo } from './PantallaArchivo'

/*
  Conferencias y fichas en una sola sección.

  Esta pantalla no lista nada por su cuenta: eso lo hace `PantallaArchivo`,
  con el modelo de columnas de la referencia. Aquí queda lo que rodea a ese
  recorrido — los criterios, las etiquetas, el panel de carga y el parámetro
  `?nuevo=1` con el que el dock pide abrirlo.

  **Los criterios viven en la URL y no en estado de React.** Así una vista
  filtrada se comparte como enlace, sobrevive a un recargado y se conserva al
  volver de otra pantalla. La consecuencia es que la entrada es texto que
  cualquiera puede escribir a mano, y de eso ya se encarga `leerCriterios`:
  nada lanza, lo que no se reconoce cae al valor por defecto.

  El orden dejó de ser un control —el archivo se lee por fecha, de lo último a
  lo primero— pero sigue en los criterios porque sin él el listado cambiaría
  solo entre recargas.
*/
export function PantallaConferencias(): ReactElement {
  const { usuario } = useSession()
  const idUsuario = usuario?.id ?? ''
  const { carga, visibles, todas, fichas, error, recargar } = useConferenciasVisibles(idUsuario)
  /*
    Lo que te compartieron y no contestaste todavía. Vive también en la
    campana, pero aquí es donde se buscan las conferencias: una invitación
    que solo existe en un aviso se pierde en cuanto se cierra.
  */
  const invitaciones = useMemo(() => invitacionesPendientes(todas, idUsuario), [todas, idUsuario])
  const { temas, recargar: recargarTemas } = useTemas()
  const { espacio, visiblesDe, crear, asignar, quitar, eliminar } = useEtiquetas(idUsuario)
  const [params, setParams] = useSearchParams()
  const [panelDeCargaAbierto, setPanelDeCargaAbierto] = useState(false)
  const [compartirAbierto, setCompartirAbierto] = useState(false)
  const avisosDeCarga = useAvisosDeCarga()

  /*
    Cuando una subida o una petición de análisis termina en segundo plano, la
    lista se vuelve a leer: es la única forma de que la tarjeta pase de lo
    que sabía este navegador a lo que ya dice la base.
  */
  useEffect(() => {
    alTerminarUnaTarea(() => {
      recargar()
      recargarTemas()
    })
    return () => alTerminarUnaTarea(null)
  }, [recargar, recargarTemas])

  /*
    El modal de carga crece desde el botón de la cabecera. También cuando lo
    abre el dock con `?nuevo=1`: el botón sigue en pantalla, así que el gesto
    se lee igual de bien venga de donde venga.
  */
  const botonDeCarga = useRef<HTMLElement>(null)
  const botonDeCompartir = useRef<HTMLElement>(null)
  const marco = useRef<HTMLDivElement>(null)

  const idsDeEtiqueta = useMemo(() => espacio.etiquetas.map((etiqueta) => etiqueta.id), [espacio.etiquetas])

  const criterios = useMemo(() => leerCriterios(params, idsDeEtiqueta), [params, idsDeEtiqueta])

  const listadas = useMemo(
    () =>
      listarConferencias({
        visibles,
        criterios,
        asignaciones: espacio.asignaciones,
        fichas,
      }),
    [visibles, criterios, espacio.asignaciones, fichas],
  )

  /*
    El análisis corre en el backend y esta pantalla no tiene forma de
    enterarse: la petición responde 202 y sigue por detrás, y lo único
    observable es `conferencias.estado`. Así que mientras haya algo en vuelo se
    vuelve a preguntar cada diez segundos, y en cuanto no queda nada el
    intervalo se apaga solo — sin esto había que recargar a mano para ver si
    la charla ya tenía fichas.
  */
  const hayAlgoEnVuelo = visibles.some(
    (visible) => visible.conferencia.estado === 'en-cola' || visible.conferencia.estado === 'procesando',
  )

  useEffect(() => {
    if (!hayAlgoEnVuelo) {
      return
    }

    /*
      También los temas: el análisis los va creando sobre la marcha, y sin
      esto una ficha recién guardada apunta a un tema que esta pantalla no
      conoce y se pinta como "Tema retirado".
    */
    const intervalo = setInterval(() => {
      recargar()
      recargarTemas()
    }, 10_000)

    return () => clearInterval(intervalo)
  }, [hayAlgoEnVuelo, recargar, recargarTemas])

  /*
    "Cargar conferencia" vive en el dock y llega como `?nuevo=1`. Va en un
    efecto y no en el valor inicial porque quien pulsa la acción puede estar
    ya en esta pantalla: entonces la ruta no se remonta, solo cambia la
    consulta. El parámetro se borra al abrir para que recargar no lo reabra,
    y se conserva el resto de la consulta para no tirar los filtros puestos.
  */
  useEffect(() => {
    if (params.get(PARAMETRO_DE_CREACION) === null) {
      return
    }

    setPanelDeCargaAbierto(true)

    const siguiente = new URLSearchParams(params)
    siguiente.delete(PARAMETRO_DE_CREACION)
    setParams(siguiente, { replace: true })
  }, [params, setParams])

  /*
    Los cambios se aplican sobre los criterios que la URL tenga en ese
    momento, no sobre los del render actual. Con la forma directa, dos cambios
    seguidos antes de un re-render se pisaban entre sí: elegir una procedencia
    y marcar una etiqueta a continuación descartaba la procedencia recién
    elegida.
  */
  function aplicar(cambio: Partial<CriteriosDeListado>): void {
    setParams((anteriores) => escribirCriterios({ ...leerCriterios(anteriores, idsDeEtiqueta), ...cambio }))
  }

  function alternarEtiquetaDelFiltro(idEtiqueta: string): void {
    setParams((anteriores) => {
      const previos = leerCriterios(anteriores, idsDeEtiqueta)
      const etiquetas = previos.etiquetas.includes(idEtiqueta)
        ? previos.etiquetas.filter((id) => id !== idEtiqueta)
        : [...previos.etiquetas, idEtiqueta]

      return escribirCriterios({ ...previos, etiquetas })
    })
  }

  /*
    Devuelve el mensaje ya traducido en el momento de intentar crear, y no un
    estado que llegue en un render posterior: así quien abrió el campo decide
    por sí solo si se limpia (éxito) o muestra el error, sin que esta pantalla
    tenga que mantener ese estado por él.
  */
  async function alCrearEtiqueta(nombre: string): Promise<ResultadoCreacion> {
    const resultado = await crear(nombre)

    return resultado.ok
      ? { ok: true, etiqueta: resultado.etiqueta }
      : { ok: false, mensaje: mensajeDeError(resultado.codigo) }
  }

  /** Poner o quitar una etiqueta propia sobre la conferencia elegida. */
  function alAlternarAsignacion(idEtiqueta: string, idConferencia: string): void {
    const yaAsignada = espacio.asignaciones.some(
      (asignacion) => asignacion.idEtiqueta === idEtiqueta && asignacion.idConferencia === idConferencia,
    )

    void (yaAsignada ? quitar(idEtiqueta, idConferencia) : asignar(idEtiqueta, idConferencia))
  }

  return (
    <div ref={marco} className="flex min-h-0 flex-1 flex-col">
      {avisosDeCarga.map((aviso) => (
        <div
          key={aviso.id}
          role="alert"
          className="mx-6 mt-4 flex items-center gap-3 rounded-[24px] bg-acento-tenue px-5 py-3 text-sm text-texto"
        >
          <span aria-hidden="true" className="material-symbols-rounded icono-relleno text-lg text-error">
            error
          </span>
          <span className="min-w-0 flex-1">{aviso.texto}</span>
          <button
            type="button"
            onClick={() => descartarAviso(aviso.id)}
            aria-label="Cerrar el aviso"
            className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-texto-tenue transition-colors hover:bg-fondo hover:text-texto"
          >
            <span aria-hidden="true" className="material-symbols-rounded text-lg">
              close
            </span>
          </button>
        </div>
      ))}

      {/* El título y los controles viven dentro del archivo, en el mismo renglón. */}
      <PantallaArchivo
        visibles={listadas}
        invitaciones={invitaciones}
        alResponderInvitacion={(idConferencia, aceptar) => {
          void responderComparticion(idConferencia, idUsuario, aceptar ? 'aceptada' : 'rechazada').then(recargar)
        }}
        fichas={fichas}
        temas={temas}
        cargando={carga === 'cargando'}
        error={error}
        alCargarConferencia={() => setPanelDeCargaAbierto(true)}
        criterios={criterios}
        etiquetas={espacio.etiquetas}
        etiquetasDe={visiblesDe}
        hayConferenciasSinFiltrar={visibles.length > 0}
        alCambiarCriterios={aplicar}
        alAlternarEtiquetaDelFiltro={alternarEtiquetaDelFiltro}
        alCrearEtiqueta={alCrearEtiqueta}
        alAlternarAsignacion={alAlternarAsignacion}
        alEliminarEtiqueta={(idEtiqueta) => void eliminar(idEtiqueta)}
        /*
          La fila dice "Analizando…" en el acto, sin esperar a que el backend
          despierte y conteste; si no acepta, la propia fila dice por qué.
        */
        alAnalizar={(idConferencia) => {
          void analizarEnSegundoPlano(idConferencia)
        }}
        alEliminarFicha={(idFicha) => {
          void eliminarFicha(idFicha).then(recargar)
        }}
        alEditarFicha={async (idFicha, texto) => {
          const resultado = await editarFicha(idFicha, texto)
          recargar()
          return resultado.ok
        }}
        alRenombrarConferencia={(idConferencia, cambio) => {
          void actualizarConferencia(idConferencia, cambio).then(recargar)
        }}
        /*
          El dueño va como parámetro y no se deduce de la sesión: el audio
          cuelga de su carpeta, y una conferencia compartida la borraría de la
          carpeta equivocada. Solo se ofrece sobre las propias, de todas formas.
        */
        alEliminarConferencia={(idConferencia) => {
          const visible = visibles.find((v) => v.conferencia.id === idConferencia)

          if (visible === undefined) {
            return
          }

          void eliminarConferencia(idConferencia, visible.conferencia.idDueno).then(recargar)
        }}
        refDelBotonDeCarga={botonDeCarga}
        refDelBotonDeCompartir={botonDeCompartir}
        alCompartir={() => setCompartirAbierto(true)}
      />

      {/*
        Solo se ofrecen las que de verdad se pueden pasar: las propias siempre,
        y las ajenas únicamente si quien las compartió lo permitió. Ofrecer el
        resto sería dejar que Postgres diga que no después de elegirlas.
      */}
      <ModalDeCompartir
        abierto={compartirAbierto}
        alCerrar={() => setCompartirAbierto(false)}
        idUsuario={idUsuario}
        alEnviado={recargar}
        anclaEn={botonDeCompartir}
        limites={marco}
        conferencias={visibles
          .filter(
            (visible) =>
              visible.procedencia === 'propia' || privacidadEfectiva(visible).permitirRecompartir,
          )
          .map((visible) => visible.conferencia)}
      />

      <ModalDeCarga
        abierto={panelDeCargaAbierto}
        alCerrar={() => setPanelDeCargaAbierto(false)}
        anclaEn={botonDeCarga}
        limites={marco}
        alCargar={() => {
          setPanelDeCargaAbierto(false)
          recargar()
        }}
      />
    </div>
  )
}
