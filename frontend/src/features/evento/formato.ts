export type Tono = 'verde' | 'ambar' | 'azul' | 'violeta' | 'rojo' | 'gris'

import type { EstadoDeAprobacion, EstadoDeConsentimiento, Publicacion } from './tipos'

/*
  Cómo se dice cada estado en la interfaz y con qué tono de pastilla.

  Un color por significado, el mismo en todas las pantallas: verde es listo,
  ámbar espera a alguien, azul tiene algo que leer (un cambio pedido, algo
  programado), gris todavía no empieza y rojo bloquea. Son contenedores
  tonales a la manera de Material 3, con texto oscuro del mismo matiz, para
  que se distingan sin volverse pastel.

  Un solo sitio para las dos tablas porque el mismo estado aparece en el
  tablero, en la lista y en el panel de detalle, y que cambie de nombre según
  la pantalla haría dudar de si es el mismo.
*/
export const CONSENTIMIENTO: Record<EstadoDeConsentimiento, { etiqueta: string; tono: Tono }> = {
  'sin-enviar': { etiqueta: 'Esperando respuesta', tono: 'ambar' },
  enviado: { etiqueta: 'Esperando respuesta', tono: 'ambar' },
  aceptado: { etiqueta: 'Autorizó', tono: 'verde' },
  rechazado: { etiqueta: 'No autorizó', tono: 'rojo' },
}

export const APROBACION: Record<EstadoDeAprobacion, { etiqueta: string; tono: Tono }> = {
  'sin-enviar': { etiqueta: 'Sin enviar', tono: 'gris' },
  enviada: { etiqueta: 'En revisión', tono: 'ambar' },
  aprobada: { etiqueta: 'Aprobada', tono: 'verde' },
  'con-cambios': { etiqueta: 'Aprobada con ajustes', tono: 'azul' },
}

export const RED: Record<Publicacion['red'], { etiqueta: string; icono: string }> = {
  linkedin: { etiqueta: 'LinkedIn', icono: 'work' },
  instagram: { etiqueta: 'Instagram', icono: 'photo_camera' },
  x: { etiqueta: 'X', icono: 'tag' },
  facebook: { etiqueta: 'Facebook', icono: 'groups' },
}

export const ESTADO_DE_PUBLICACION: Record<Publicacion['estado'], { etiqueta: string; tono: Tono }> = {
  propuesta: { etiqueta: 'Propuesta', tono: 'gris' },
  aprobada: { etiqueta: 'Aprobada', tono: 'verde' },
  programada: { etiqueta: 'Programada', tono: 'azul' },
  publicada: { etiqueta: 'Publicada', tono: 'violeta' },
}

/* Una ponencia cuenta para la memoria y la producción si su ponente la aprobó, con o sin cambios. */
export function estaAprobada(estado: EstadoDeAprobacion): boolean {
  return estado === 'aprobada' || estado === 'con-cambios'
}

export function minuto(segundos: number): string {
  const horas = Math.floor(segundos / 3600)
  const minutos = Math.floor((segundos % 3600) / 60)
  const resto = Math.floor(segundos % 60)
  const mm = String(minutos).padStart(horas > 0 ? 2 : 1, '0')
  return `${horas > 0 ? `${horas}:` : ''}${mm}:${String(resto).padStart(2, '0')}`
}

export function duracion(segundos: number): string {
  const minutos = Math.round(segundos / 60)
  return minutos >= 60 ? `${Math.floor(minutos / 60)} h ${minutos % 60} min` : `${minutos} min`
}

const FECHA = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long' })
const FECHA_Y_HORA = new Intl.DateTimeFormat('es-CO', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
})

/* Fechas ISO de solo día: se leen a mediodía para que la zona horaria no las corra al día anterior. */
export function fecha(iso: string | null): string {
  if (iso === null || iso === '') {
    return '—'
  }
  return FECHA.format(new Date(iso.length === 10 ? `${iso}T12:00:00` : iso))
}

export function fechaYHora(iso: string | null): string {
  return iso === null ? '—' : FECHA_Y_HORA.format(new Date(iso))
}

export function iniciales(nombre: string): string {
  return nombre
    .split(' ')
    .filter((parte) => parte !== '')
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() ?? '')
    .join('')
}

/* El nombre de la conferencia y el del directorio no siempre coinciden letra por letra ("Marisol Forero" / "Marisol Forero Cárdenas"). */
export function mismoPonente(enLaPonencia: string, enElDirectorio: string): boolean {
  const normal = (texto: string): string => texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  const [uno, otro] = [normal(enLaPonencia), normal(enElDirectorio)]
  return uno.startsWith(otro) || otro.startsWith(uno)
}
