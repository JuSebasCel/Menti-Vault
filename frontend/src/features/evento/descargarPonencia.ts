import JSZip from 'jszip'
import { descargar, listarArchivos } from '@/features/almacen/repositorio'
import { APROBACION, fecha, minuto } from './formato'
import { carpetaDeFotosDeSesion, leerTranscripcion, listarFotos } from './repositorio'
import type { DatosDelEvento, Ponencia } from './tipos'

/*
  Todo lo de una ponencia en un solo archivo: su ficha, la grabación, la
  transcripción (en texto con minutos, para leer, y en JSON, para volver a
  procesar), la memoria en PDF y Word, el material de apoyo y las fotos.

  Se arma en el navegador con lo que la persona ya puede leer: no pasa por
  el backend, así que respeta las mismas reglas de acceso que la pantalla.
  Lo que falle al descargarse se omite y se anota en la ficha, para que un
  zip incompleto no parezca completo.
*/
function nombreSeguro(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

export async function descargarPonencia(ponencia: Ponencia, datos: DatosDelEvento, alAvanzar: (texto: string) => void): Promise<void> {
  const zip = new JSZip()
  const faltantes: string[] = []

  const agregar = async (ruta: string, destino: string): Promise<void> => {
    const blob = await descargar(ruta)
    if (blob === null) {
      faltantes.push(destino)
      return
    }
    zip.file(destino, blob)
  }

  alAvanzar('Transcripción…')
  const segmentos = await leerTranscripcion(ponencia.idDueno, ponencia.id)
  if (segmentos !== null) {
    zip.file('transcripcion.txt', segmentos.map((segmento) => `[${minuto(segmento.inicio)}] ${segmento.texto}`).join('\n'))
    zip.file('transcripcion.json', JSON.stringify(segmentos, null, 2))
  }

  alAvanzar('Grabación y material…')
  const archivos = await listarArchivos(ponencia.idDueno, ponencia.id)
  for (const archivo of archivos.ok ? archivos.datos : []) {
    if (archivo.tipo === 'transcripcion-automatica') {
      continue
    }
    await agregar(archivo.ruta, archivo.esApoyo === true ? `material/${archivo.nombre}` : `grabacion/${archivo.nombre}`)
  }

  alAvanzar('Memoria…')
  const memoria = datos.memorias.find((una) => una.idConferencia === ponencia.id)
  if (memoria?.archivoPdf != null) {
    await agregar(memoria.archivoPdf, 'memoria.pdf')
  }
  if (memoria?.archivoDocx != null) {
    await agregar(memoria.archivoDocx, 'memoria.docx')
  }

  alAvanzar('Fotos…')
  for (const foto of await listarFotos(carpetaDeFotosDeSesion(ponencia.idDueno, ponencia.id))) {
    await agregar(foto.ruta, `fotos/${foto.nombre}`)
  }

  const ficha = [
    ponencia.titulo,
    '',
    `Ponente: ${ponencia.ponente}`,
    `Evento: ${datos.evento.nombre}`,
    `Fecha: ${fecha(ponencia.fecha)}${ponencia.horaInicio === null ? '' : `, ${ponencia.horaInicio} – ${ponencia.horaFin ?? ''}`}`,
    `Espacio: ${ponencia.sala || '—'}`,
    `Eje: ${ponencia.eje || '—'}`,
    `Texto: ${APROBACION[ponencia.aprobacion].etiqueta}`,
    ponencia.comentarioDelPonente === '' ? '' : `Cambio pedido por el ponente: ${ponencia.comentarioDelPonente}`,
    memoria === undefined ? 'Sin memoria todavía.' : '',
    faltantes.length === 0 ? '' : `No se pudieron descargar: ${faltantes.join(', ')}`,
  ]
    .filter((linea, indice) => indice < 2 || linea !== '')
    .join('\n')
  zip.file('ficha.txt', ficha)

  alAvanzar('Comprimiendo…')
  const contenido = await zip.generateAsync({ type: 'blob' })
  const enlace = document.createElement('a')
  enlace.href = URL.createObjectURL(contenido)
  enlace.download = `${nombreSeguro(datos.evento.nombre)}-${nombreSeguro(ponencia.titulo)}.zip`
  enlace.click()
  URL.revokeObjectURL(enlace.href)
}
