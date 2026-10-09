import { useEffect } from 'react'
import type { ReactElement } from 'react'
import { Outlet } from 'react-router'
import { useSession } from '@/features/auth/session'
import { useCierreDelSitio } from '@/features/configuracion/cierreDelSitio'
import { permitirElegirDemostracion } from '@/features/evento/demostracion'
import { MarcaDeMenti } from '@/shared/ui/Logo'

/*
  Deja pasar al armazón, o enseña "estamos trabajando" si la administración
  cerró la app.

  Va después de `RutaProtegida` y no delante del acceso: la administración
  tiene que poder iniciar sesión con la app cerrada, que es justo cuando más
  la necesita. A los demás se les deja entrar a su cuenta y se les dice que
  vuelvan más tarde, con la opción de salir.

  Mientras se consulta, se deja pasar: la consulta tarda un instante y casi
  siempre la app está abierta, así que esperar por ella retrasaría cada
  entrada para proteger un caso raro.
*/
export function CompuertaDelSitio(): ReactElement {
  const { usuario, cerrarSesion } = useSession()
  const { cerrado, soyAdministracion, soyDemostracion } = useCierreDelSitio(usuario?.id ?? '')

  /* Solo la administración decide si se trabaja en demostración; el resto la tiene siempre puesta. */
  useEffect(() => permitirElegirDemostracion(soyAdministracion), [soyAdministracion])

  /* La cuenta de demostración entra sin el aviso: quien mira la presentación no tiene por qué saber que la app está cerrada. */
  if (!cerrado || soyDemostracion) {
    return <Outlet />
  }

  /*
    La administración entra, pero con un recordatorio fijo: con la app
    cerrada es fácil olvidarse de volver a abrirla.
  */
  if (soyAdministracion) {
    return (
      <>
        <Outlet />
        <p
          role="status"
          className="fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full bg-error px-4 py-2 text-sm font-medium text-acento-contraste shadow-lg"
        >
          <span aria-hidden="true" className="material-symbols-rounded icono-relleno text-base">
            lock
          </span>
          La app está cerrada para los demás
        </p>
      </>
    )
  }

  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-6 bg-fondo px-6 text-center text-texto">
      <MarcaDeMenti tamano={56} />

      <div className="flex max-w-md flex-col gap-3">
        <h1 className="font-titulo text-[32px] leading-tight font-semibold">Estamos trabajando en Menti Vault</h1>
        <p className="text-base leading-relaxed text-texto-tenue">
          La app está cerrada un momento mientras la mejoramos. Tus conferencias, fichas y memorias
          siguen guardadas. Vuelve a intentarlo en un rato.
        </p>
      </div>

      <button
        type="button"
        onClick={cerrarSesion}
        className="h-11 cursor-pointer rounded-full bg-acento-tenue px-6 text-base text-texto transition-colors hover:bg-ilustracion"
      >
        Cerrar sesión
      </button>
    </main>
  )
}
