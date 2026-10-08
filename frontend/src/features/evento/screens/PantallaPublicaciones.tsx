import type { ReactElement } from 'react'
import { useMemo, useState } from 'react'
import { CargaDelEvento } from '../components/CargaDelEvento'
import { BotonMind, Chip, EncabezadoDePagina, Estado, Icono, Tarjeta } from '../components/piezas'
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

      <p className="px-1 text-sm text-texto-tenue">
        Cada pieza trae el texto de la publicación y la imagen con la cita, listos para subir a la red del evento.
      </p>

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
            <div className="grid grid-cols-3 gap-2">
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

/*
  La tarjeta de la pieza como imagen de 1080×1080, dibujada en un lienzo con
  la misma tipografía de la app: es lo que se sube a la red junto al texto.
  Se dibuja en el navegador para no depender de un servicio de imágenes.
*/
function partirEnLineas(contexto: CanvasRenderingContext2D, texto: string, ancho: number): string[] {
  const lineas: string[] = []
  let actual = ''
  for (const palabra of texto.split(' ')) {
    const prueba = actual === '' ? palabra : `${actual} ${palabra}`
    if (contexto.measureText(prueba).width > ancho && actual !== '') {
      lineas.push(actual)
      actual = palabra
    } else {
      actual = prueba
    }
  }
  if (actual !== '') {
    lineas.push(actual)
  }
  return lineas
}

async function descargarTarjeta(publicacion: Publicacion, evento: string): Promise<void> {
  const lienzo = document.createElement('canvas')
  lienzo.width = 1080
  lienzo.height = 1080
  const contexto = lienzo.getContext('2d')
  if (contexto === null) {
    return
  }
  await document.fonts.ready
  contexto.fillStyle = '#000000'
  contexto.fillRect(0, 0, 1080, 1080)
  contexto.fillStyle = 'rgba(255,255,255,0.6)'
  contexto.font = '500 30px "DM Sans Variable", sans-serif'
  contexto.fillText(evento.toUpperCase(), 96, 140)

  const cita = publicacion.cita === '' ? (publicacion.texto.split('.')[0] ?? '') : `“${publicacion.cita}”`
  contexto.fillStyle = '#ffffff'
  contexto.font = '600 62px "DM Sans Variable", sans-serif'
  const lineas = partirEnLineas(contexto, cita, 888).slice(0, 9)
  const alto = lineas.length * 80
  lineas.forEach((linea, indice) => contexto.fillText(linea, 96, 540 - alto / 2 + indice * 80))

  contexto.fillStyle = 'rgba(255,255,255,0.75)'
  contexto.font = '500 34px "DM Sans Variable", sans-serif'
  contexto.fillText(publicacion.ponente || evento, 96, 960)

  const blob = await new Promise<Blob | null>((resolver) => lienzo.toBlob(resolver, 'image/png'))
  if (blob === null) {
    return
  }
  const enlace = document.createElement('a')
  enlace.href = URL.createObjectURL(blob)
  enlace.download = `${evento}-${publicacion.red}-${publicacion.id.slice(0, 6)}.png`
  enlace.click()
  URL.revokeObjectURL(enlace.href)
}

function Pieza({ publicacion, evento }: { publicacion: Publicacion; evento: string }): ReactElement {
  const [copiado, setCopiado] = useState(false)

  return (
    <Tarjeta className="flex flex-col gap-4 p-5">
      {/* Cabecera como la de la red: quién publica y cuándo. */}
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-acento text-sm font-semibold text-acento-contraste">
          {evento.slice(0, 2).toUpperCase()}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[15px] font-semibold">{evento}</span>
          <span className="flex items-center gap-1.5 text-xs text-texto-tenue">
            <Icono nombre={RED[publicacion.red].icono} className="text-sm" />
            {RED[publicacion.red].etiqueta} · {fechaYHora(publicacion.programadaPara)}
          </span>
        </span>
        <Estado {...ESTADO_DE_PUBLICACION[publicacion.estado]} />
      </div>

      <p className="text-[15px] leading-relaxed whitespace-pre-line">{publicacion.texto}</p>

      <div className="flex aspect-square w-full max-w-72 flex-col justify-between self-center rounded-[20px] bg-black p-6 text-white">
        <span className="text-[10px] tracking-wide uppercase opacity-60">{evento}</span>
        <span className="text-lg leading-snug font-semibold">
          {publicacion.cita === '' ? publicacion.texto.split('.')[0] : `“${publicacion.cita}”`}
        </span>
        <span className="truncate text-xs opacity-75">{publicacion.ponente || evento}</span>
      </div>

      <div className="flex gap-2">
        <BotonMind
          variante="tenue"
          icono={copiado ? 'check' : 'content_copy'}
          onClick={() => {
            void navigator.clipboard?.writeText(publicacion.texto)
            setCopiado(true)
            window.setTimeout(() => setCopiado(false), 1600)
          }}
        >
          {copiado ? 'Copiado' : 'Copiar texto'}
        </BotonMind>
        <BotonMind variante="tenue" icono="download" onClick={() => void descargarTarjeta(publicacion, evento)}>
          Descargar imagen
        </BotonMind>
      </div>
    </Tarjeta>
  )
}
