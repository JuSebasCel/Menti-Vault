export type Tono = 'verde' | 'ambar' | 'azul' | 'violeta' | 'rojo' | 'gris'

import type { EstadoDeAprobacion, EstadoDeConsentimiento, Ponente, Publicacion, UsoDelConsentimiento } from './tipos'

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
  'sin-enviar': { etiqueta: 'Falta su correo', tono: 'gris' },
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

/*
  Los ponentes de una sesión. Una sesión puede tener varios, y se guardan en
  el mismo campo separados por coma ("Ana Pérez, Luis Gómez"): así se leen
  bien en cualquier sitio que ya enseñaba el campo, sin otra columna ni otra
  tabla que mantener sincronizada.
*/
export function ponentesDe(campo: string): string[] {
  return campo
    .split(',')
    .map((nombre) => nombre.trim())
    .filter((nombre) => nombre !== '')
}

export function unirPonentes(nombres: readonly string[]): string {
  return nombres.map((nombre) => nombre.trim()).filter((nombre) => nombre !== '').join(', ')
}

/*
  Si alguien del directorio da esa sesión. El nombre de la sesión y el del
  directorio no siempre coinciden letra por letra ("Marisol Forero" /
  "Marisol Forero Cárdenas"), y con varios ponentes basta con que sea uno.
*/
export function mismoPonente(enLaPonencia: string, enElDirectorio: string): boolean {
  const normal = (texto: string): string => texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  const otro = normal(enElDirectorio)
  return ponentesDe(enLaPonencia).some((nombre) => {
    const uno = normal(nombre)
    return uno.startsWith(otro) || otro.startsWith(uno)
  })
}

/*
  Si todos los ponentes de una sesión autorizaron un uso. Con uno solo que
  no lo haya hecho —o que no esté en el directorio— la sesión no entra: su
  voz va en la misma grabación y no se puede separar de la de los demás.
*/
export function autorizanTodos(campo: string, directorio: readonly Ponente[], uso: UsoDelConsentimiento): boolean {
  const nombres = ponentesDe(campo)
  return (
    nombres.length > 0 &&
    nombres.every((nombre) => {
      const ponente = directorio.find((uno) => mismoPonente(nombre, uno.nombre))
      return ponente?.consentimiento === 'aceptado' && ponente.usos[uso] === true
    })
  )
}

/* Aritmética de horas `HH:MM` de la agenda, sin pasar por `Date` (que mete la zona horaria). */
export function sumarMinutos(hora: string, minutos: number): string {
  const [horas, mins] = hora.split(':').map(Number)
  const total = Math.min((horas ?? 0) * 60 + (mins ?? 0) + minutos, 23 * 60 + 59)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export function minutosEntre(inicio: string, fin: string): number {
  const aMinutos = (hora: string): number => {
    const [horas, mins] = hora.split(':').map(Number)
    return (horas ?? 0) * 60 + (mins ?? 0)
  }
  return aMinutos(fin) - aMinutos(inicio)
}

/*
  En qué punto está una sesión respecto a ahora: lo que el organizador quiere
  saber al mirar la lista es si ya la vio o todavía no. Se compara con la
  hora de fin, para que una sesión en curso cuente como de hoy y no como
  ocurrida.
*/
export type Momento = 'ocurrio' | 'hoy' | 'proxima' | 'sin-hora'

export function momentoDe(ponencia: { fecha: string; horaInicio: string | null; horaFin: string | null }, ahora = new Date()): Momento {
  if (ponencia.horaInicio === null || ponencia.fecha === '') {
    return 'sin-hora'
  }
  const fin = new Date(`${ponencia.fecha}T${ponencia.horaFin ?? ponencia.horaInicio}:00`)
  const hoy = ahora.toISOString().slice(0, 10) === ponencia.fecha
  if (fin.getTime() < ahora.getTime()) {
    return 'ocurrio'
  }
  return hoy ? 'hoy' : 'proxima'
}

export const MOMENTO: Record<Momento, { etiqueta: string; tono: Tono }> = {
  ocurrio: { etiqueta: 'Ya ocurrió', tono: 'verde' },
  hoy: { etiqueta: 'Hoy', tono: 'ambar' },
  proxima: { etiqueta: 'Por ocurrir', tono: 'azul' },
  'sin-hora': { etiqueta: 'Sin hora', tono: 'gris' },
}
