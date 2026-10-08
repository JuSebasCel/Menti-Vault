import type { ReactElement } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { PantallaAcceso, PantallaRegistro } from '@/features/auth/screens'
import { SessionProvider } from '@/features/auth/session'
import { ShellLayout } from '@/app/layout'
import { ShellDelEvento } from '@/app/layout/ShellDelEvento'
import { PantallaInicio } from '@/features/evento/screens/PantallaInicio'
import { PantallaPonentes } from '@/features/evento/screens/PantallaPonentes'
import { PantallaPonencias } from '@/features/evento/screens/PantallaPonencias'
import { PantallaMemoriasDelEvento } from '@/features/evento/screens/PantallaMemoriasDelEvento'
import { PantallaProduccion } from '@/features/evento/screens/PantallaProduccion'
import { PantallaPublicaciones } from '@/features/evento/screens/PantallaPublicaciones'
import { PantallaOrganizacion } from '@/features/evento/screens/PantallaOrganizacion'
import { RutaProtegida } from '@/app/RutaProtegida'
import { CompuertaDelSitio } from '@/app/CompuertaDelSitio'
import { RutaPublica } from '@/app/RutaPublica'
import { SoloEscritorio } from '@/app/SoloEscritorio'
import { PantallaConferencias, PantallaDetalleConferencia } from '@/features/conferencias/screens'
import { PantallaConfiguracion } from '@/features/configuracion/screens'
import { PantallaAlmacen } from '@/features/almacen/PantallaAlmacen'
import { PantallaDetalleMemoria, PantallaMemorias } from '@/features/memorias/screens'
import { PantallaEditorDePlantilla, PantallaPlantillas } from '@/features/plantillas/screens'
import { ProveedorDeTema } from '@/shared/tema'
import { PantallaDiseno } from '@/dev/diseno/PantallaDiseno'
import { PantallaArchivoDePrueba } from '@/dev/diseno/PantallaArchivoDePrueba'

/*
  Mapa de rutas de la aplicación.

  Las dos rutas públicas viven fuera del shell: quien no ha entrado no ve la
  navegación. Van envueltas en `RutaPublica`, que aparta de ellas a quien ya
  tiene sesión abierta, para que nadie llegue al formulario de acceso desde el
  historial y cambie de sesión sin darse cuenta.

  Todo lo demás cuelga de `RutaProtegida`, que redirige a `/acceso` cuando no
  hay sesión y recuerda a dónde se quería ir, y de `ShellLayout`, que aporta la
  barra lateral y la barra superior comunes.

  El chat no es una ruta: se abre desde el dock como modal, y por eso no
  aparece en esta tabla.
*/
export function App(): ReactElement {
  return (
    <ProveedorDeTema>
      <SoloEscritorio>
        <SessionProvider>
          <Routes>
            <Route element={<RutaPublica />}>
              <Route path="/acceso" element={<PantallaAcceso />} />
              <Route path="/registro" element={<PantallaRegistro />} />
            </Route>

            <Route element={<RutaProtegida />}>
              <Route element={<CompuertaDelSitio />}>
              {/*
                El producto reorientado: el ciclo editorial del evento. Las
                pantallas de abajo, en el armazón anterior, siguen vivas para lo
                que todavía no se ha mudado (subir una ponencia, plantillas,
                configuración).
              */}
              <Route element={<ShellDelEvento />}>
                <Route index element={<Navigate to="/inicio" replace />} />
                <Route path="/inicio" element={<PantallaInicio />} />
                <Route path="/ponentes" element={<PantallaPonentes />} />
                <Route path="/ponencias" element={<PantallaPonencias />} />
                <Route path="/memorias-del-evento" element={<PantallaMemoriasDelEvento />} />
                <Route path="/produccion" element={<PantallaProduccion />} />
                <Route path="/publicaciones" element={<PantallaPublicaciones />} />
                <Route path="/organizacion" element={<PantallaOrganizacion />} />
              </Route>
              <Route element={<ShellLayout />}>
                <Route path="/conferencias" element={<PantallaConferencias />} />
                <Route
                  path="/conferencias/:idConferencia"
                  element={<PantallaDetalleConferencia />}
                />
                {/*
                El catálogo se colapsó dentro de Conferencias. La ruta se
                conserva como redirección y no se borra: hay enlaces viejos y
                marcadores apuntando aquí, y un 404 sería peor que llevar a
                donde ahora vive su contenido.
              */}
                <Route path="/catalogo" element={<Navigate to="/conferencias" replace />} />
                <Route path="/memorias" element={<PantallaMemorias />} />
                <Route path="/memorias/:idMemoria" element={<PantallaDetalleMemoria />} />
                <Route path="/plantillas" element={<PantallaPlantillas />} />
                <Route path="/plantillas/:idPlantilla" element={<PantallaEditorDePlantilla />} />
                <Route path="/almacen" element={<PantallaAlmacen />} />
                <Route path="/configuracion" element={<PantallaConfiguracion />} />
              </Route>
              </Route>
            </Route>

            {/*
            Sandbox de revisión de diseño (ver PantallaDiseno.tsx): sin sesión,
            sin shell, sin enlace en ninguna navegación — se entra a mano
            tipeando la URL. Vive fuera de RutaPublica/RutaProtegida a
            propósito, para que no dependa de si hay sesión abierta o no.
          */}
            <Route path="/_diseno" element={<PantallaDiseno />} />

            {/* Vista previa del archivo con los fixtures, para juzgarlo con contenido. */}
            <Route path="/_archivo" element={<PantallaArchivoDePrueba />} />

            <Route path="*" element={<Navigate to="/inicio" replace />} />
          </Routes>
        </SessionProvider>
      </SoloEscritorio>
    </ProveedorDeTema>
  )
}
