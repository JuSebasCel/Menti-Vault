import { FFmpeg } from '@ffmpeg/ffmpeg'
import { toBlobURL } from '@ffmpeg/util'

/*
  El audio de un video, sacado en el navegador antes de subir nada.

  Una grabación de Zoom pesa gigas y lo único que necesita la transcripción
  es su voz: se sube el audio en mono, a 16 kHz y 32 kbps (unos 14 MB por
  hora), que es lo que el modelo de transcripción usa por dentro y cabe en
  los límites de Storage y del plan gratuito de transcripción. El video no
  sale de la máquina.

  El video no se copia a la memoria del navegador: se monta tal cual con
  WORKERFS, así un archivo de varios gigas no revienta la pestaña. El núcleo
  de ffmpeg (≈30 MB) se descarga la primera vez que hace falta y no antes.
*/
const NUCLEO = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm'

let instancia: Promise<FFmpeg> | null = null

function cargar(): Promise<FFmpeg> {
  instancia ??= (async () => {
    const ffmpeg = new FFmpeg()
    await ffmpeg.load({
      coreURL: await toBlobURL(`${NUCLEO}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${NUCLEO}/ffmpeg-core.wasm`, 'application/wasm'),
    })
    return ffmpeg
  })()
  return instancia
}

export const EXTENSIONES_DE_VIDEO = ['.mp4', '.mov', '.mkv', '.webm', '.avi'] as const

export function esVideo(archivo: File): boolean {
  const nombre = archivo.name.toLowerCase()
  return archivo.type.startsWith('video/') || EXTENSIONES_DE_VIDEO.some((extension) => nombre.endsWith(extension))
}

export async function extraerAudio(video: File, alAvanzar: (fraccion: number) => void): Promise<File> {
  const ffmpeg = await cargar()
  const progreso = ({ progress }: { progress: number }): void => alAvanzar(Math.min(1, Math.max(0, progress)))
  ffmpeg.on('progress', progreso)

  const carpeta = `/entrada-${Date.now()}`
  await ffmpeg.createDir(carpeta)
  await ffmpeg.mount('WORKERFS' as Parameters<FFmpeg['mount']>[0], { files: [video] }, carpeta)

  try {
    await ffmpeg.exec(['-i', `${carpeta}/${video.name}`, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'aac', '-b:a', '32k', 'audio.m4a'])
    const datos = await ffmpeg.readFile('audio.m4a')
    await ffmpeg.deleteFile('audio.m4a')
    const nombre = `${video.name.replace(/\.[^.]+$/, '')}.m4a`
    return new File([datos as Uint8Array<ArrayBuffer>], nombre, { type: 'audio/mp4' })
  } finally {
    ffmpeg.off('progress', progreso)
    await ffmpeg.unmount(carpeta)
    await ffmpeg.deleteDir(carpeta)
  }
}
