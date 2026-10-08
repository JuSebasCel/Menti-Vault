import type { ReactElement } from 'react'
import { useMemo, useState } from 'react'
import { CargaDelEvento } from '../components/CargaDelEvento'
import { Chip, EncabezadoDePagina, Estado, Icono, Tarjeta } from '../components/piezas'
import { ESTADO_DE_PUBLICACION, RED, fecha, fechaYHora, mismoPonente } from '../formato'
import type { DatosDelEvento, Publicacion } from '../tipos'

/*
  Las piezas para las redes del evento, en el orden en que salen.

  Respetan el consentimiento: de quien no autorizó difundir en redes, o
  todavía no respondió, no se propone ninguna. Se dice arriba y con nombre,
  porque un organizador que no ve una charla en el calendario va a pensar que
  es un fallo.
*/
export function PantallaPublicaciones(): ReactElement {
  return <CargaDelEvento>{(datos) => <Publicaciones datos={datos} />}</CargaDelEvento>
}

function Publicaciones({ datos }: { datos: DatosDelEvento }): ReactElement {
  const [red, setRed] = useState<Publicacion['red'] | 'todas'>('todas')

  const visibles = datos.publicaciones.filter((publicacion) => red === 'todas' || publicacion.red === red)
  const porDia = useMemo(() => {
    const dias = new Map<string, Publicacion[]>()
    for (const publicacion of visibles) {
      const dia = publicacion.programadaPara?.slice(0, 10) ?? 'sin-fecha'
      dias.set(dia, [...(dias.get(dia) ?? []), publicacion])
    }
    return [...dias.entries()]
  }, [visibles])

  const sinPermiso = datos.ponentes.filter(
    (ponente) =>
      datos.ponencias.some((ponencia) => mismoPonente(ponencia.ponente, ponente.nombre)) &&
      (ponente.consentimiento !== 'aceptado' || ponente.usos.redes !== true),
  )

  return (
    <div className="flex flex-col gap-4">
      <EncabezadoDePagina titulo="Redes" />

      {sinPermiso.length === 0 ? null : (
        <div className="flex items-center gap-3 rounded-[20px] tarjeta-borde px-5 py-3 text-texto">
          <Icono nombre="shield_person" className="text-xl" />
          <span className="text-sm">
            Sin piezas de {sinPermiso.map((ponente) => ponente.nombre).join(' ni de ')}:{' '}
            {sinPermiso.length === 1 ? 'no autorizó' : 'no autorizaron'} difundir en redes o no{' '}
            {sinPermiso.length === 1 ? 'ha' : 'han'} respondido.
          </span>
        </div>
      )}

      <div className="flex gap-2">
        <Chip elegido={red === 'todas'} onClick={() => setRed('todas')}>
          Todas
        </Chip>
        {(['linkedin', 'instagram', 'x'] as const).map((una) => (
          <Chip key={una} elegido={red === una} onClick={() => setRed(una)}>
            {RED[una].etiqueta}
          </Chip>
        ))}
      </div>

      <div className="entrar-escalonado flex flex-col gap-5">
        {porDia.map(([dia, publicaciones]) => (
          <section key={dia} className="flex flex-col gap-2">
            <h2 className="px-1 text-sm font-medium text-texto-tenue">{dia === 'sin-fecha' ? 'Sin fecha' : fecha(dia)}</h2>
            <div className="grid grid-cols-2 gap-2">
              {publicaciones.map((publicacion) => (
                <Pieza key={publicacion.id} publicacion={publicacion} evento={datos.evento.nombre} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function Pieza({ publicacion, evento }: { publicacion: Publicacion; evento: string }): ReactElement {
  return (
    <Tarjeta className="flex gap-5 p-4">
      {/* La tarjeta visual de la pieza: cita sobre negro, como saldría en la red. */}
      <div className="flex aspect-square w-44 shrink-0 flex-col justify-between rounded-[20px] bg-acento p-4 text-acento-contraste">
        <span className="text-[10px] tracking-wide uppercase opacity-60">{evento}</span>
        <span className="line-clamp-6 text-[13px] leading-snug font-medium">
          {publicacion.cita === '' ? publicacion.texto.split('.')[0] : `“${publicacion.cita}”`}
        </span>
        <span className="truncate text-[11px] opacity-70">{publicacion.ponente || 'Menti Vault'}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <Icono nombre={RED[publicacion.red].icono} className="text-lg" />
            {RED[publicacion.red].etiqueta} · {publicacion.formato}
          </span>
          <Estado {...ESTADO_DE_PUBLICACION[publicacion.estado]} />
        </div>
        <p className="line-clamp-5 text-sm leading-relaxed">{publicacion.texto}</p>
        <span className="mt-auto flex items-center gap-1.5 text-xs text-texto-tenue">
          <Icono nombre="event" relleno={false} className="text-base" />
          {fechaYHora(publicacion.programadaPara)}
        </span>
      </div>
    </Tarjeta>
  )
}
