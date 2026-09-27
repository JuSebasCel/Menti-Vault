import type { ReactElement } from 'react'
import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { mensajeDeError } from '@/shared/errors'
import { Esqueleto, PanelDeError, useCrecerDesdeOrigen } from '@/shared/ui'
import { usePlantillas } from '../usePlantillas'
import { ConfirmacionDePlantillaDocx } from './ConfirmacionDePlantillaDocx'

/*
  La pantalla de una plantilla: resuelve cuál es por la URL y entrega su
  configuración a `ConfirmacionDePlantillaDocx`.

  Se llamaba "editor" porque aquí vivía el editor de la plantilla en blanco,
  un documento TipTap que se escribía dentro de la app. Se retiró: el diseño se
  hace en Word, y aquí solo se dice qué debe escribir la IA en cada campo. El
  nombre del archivo se conserva para no mover la ruta ni sus importaciones.
*/

function EnlaceDeRegreso(): ReactElement {
  return (
    <Link
      to="/plantillas"
      aria-label="Volver a plantillas"
      className="flex w-fit items-center gap-1 rounded-full py-1 pr-2 text-sm text-texto-tenue transition-colors hover:text-texto"
    >
      <span aria-hidden="true" className="material-symbols-rounded icono-contorno text-base">
        arrow_back
      </span>
      Plantillas
    </Link>
  )
}

export function PantallaEditorDePlantilla(): ReactElement {
  const { idPlantilla = '' } = useParams()
  const mutadores = usePlantillas()
  const navegar = useNavigate()
  const plantilla = mutadores.plantillas.find((candidata) => candidata.id === idPlantilla)
  /*
    Borrar la saca de la lista antes de volver a la galería (el borrado es
    optimista), y en ese instante la pantalla la buscaba, no la encontraba
    y pintaba "No encontramos esa plantilla" en rojo hasta que llegaba la
    navegación. Mientras se borra, no hay nada que decir: se sale.
  */
  const [borrando, setBorrando] = useState(false)

  /*
    La pantalla crece desde la tarjeta de la que se abrió, y el contenedor que
    crece es SIEMPRE el mismo: el de la carga, el del error y el de la
    plantilla ya leída.

    Antes la carga salía por su cuenta y la animación solo arrancaba al llegar
    la plantilla: se veía el esqueleto a pantalla completa y, encima, la
    pantalla creciendo desde la tarjeta. Ese era el parpadeo.
  */
  const pantalla = useRef<HTMLDivElement>(null)
  useCrecerDesdeOrigen(pantalla, idPlantilla)

  return (
    <div ref={pantalla} className="flex min-h-0 flex-1 flex-col">
      {mutadores.cargando ? (
        <Esqueleto filas={4} etiqueta="Cargando la plantilla" />
      ) : borrando && plantilla === undefined ? null : mutadores.codigoDeError !== null ||
        plantilla === undefined ? (
        <div className="flex flex-col gap-4">
          <EnlaceDeRegreso />
          <PanelDeError mensaje={mensajeDeError(mutadores.codigoDeError ?? 'PLANT_NO_ENCONTRADA')} />
        </div>
      ) : (
        <ConfirmacionDePlantillaDocx
          plantilla={plantilla}
          alRenombrar={(nombre) => mutadores.renombrarPlantilla(plantilla.id, nombre)}
          alCambiarMarcadores={(marcadores) => mutadores.actualizarMarcadoresDeDocx(plantilla.id, marcadores)}
          alCambiarTono={(tono) => mutadores.cambiarTono(plantilla.id, tono)}
          alEliminar={async () => {
            setBorrando(true)
            await mutadores.eliminar(plantilla.id)
            void navegar('/plantillas')
          }}
        />
      )}
    </div>
  )
}
