import { fecha, minuto } from './formato'
import type { DatosDelEvento, Evidencia, Produccion } from './tipos'

/*
  Un artículo como documento LaTeX, con la plantilla de siempre o con la de
  la revista o el congreso donde se va a presentar.

  El modelo nunca escribe LaTeX. Devuelve texto plano y aquí se escapa: un
  solo `%` o `_` sin escapar en una frase rompería la compilación entera, y
  en una transcripción salen solos ("el 30 % de los casos"). Por la misma
  razón las citas se insertan desde la evidencia verificada, igual que en la
  pantalla, y no desde lo que el modelo hubiera copiado.

  Una plantilla propia marca dónde va cada parte con `[[titulo]]`,
  `[[resumen]]`, `[[cuerpo]]`, `[[referencias]]`, `[[evento]]` y
  `[[fecha]]` —la misma convención de los formatos de Word—. Solo
  `[[cuerpo]]` es obligatorio; si no trae `[[resumen]]`, el resumen entra al
  principio del cuerpo.
*/

export const PLANTILLA_POR_DEFECTO = String.raw`\documentclass[11pt]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage[spanish]{babel}
\usepackage{lmodern}
\usepackage[margin=2.5cm]{geometry}
\usepackage{parskip}

\title{[[titulo]]}
\author{}
\date{[[evento]] · [[fecha]]}

\begin{document}
\maketitle

\begin{abstract}
[[resumen]]
\end{abstract}

[[cuerpo]]

[[referencias]]
\end{document}
`

const ESPECIALES: Record<string, string> = {
  '\\': String.raw`\textbackslash{}`,
  '&': String.raw`\&`,
  '%': String.raw`\%`,
  $: String.raw`\$`,
  '#': String.raw`\#`,
  _: String.raw`\_`,
  '{': String.raw`\{`,
  '}': String.raw`\}`,
  '~': String.raw`\textasciitilde{}`,
  '^': String.raw`\textasciicircum{}`,
}

export function escapar(texto: string): string {
  return texto.replace(/[\\&%$#_{}~^]/g, (caracter) => ESPECIALES[caracter] ?? caracter)
}

/* Para citar como en un artículo: los dos últimos nombres son los apellidos. */
function apellidos(nombre: string): string {
  return nombre.split(' ').slice(-2).join(' ')
}

function parrafoConCitas(parrafo: string, porClave: Map<string, Evidencia>): string {
  return parrafo
    .split(/(\{E-\d+\})/)
    .map((trozo) => {
      const evidencia = porClave.get(/^\{(E-\d+)\}$/.exec(trozo)?.[1] ?? '')
      if (evidencia === undefined) {
        return escapar(trozo)
      }
      return `«${escapar(evidencia.texto.replace(/[.]$/, ''))}» (${escapar(apellidos(evidencia.ponente))}, min.~${minuto(evidencia.segundo)})`
    })
    .join('')
}

/* Cada ponencia citada, una vez, como referencia: ponente, fecha, título y evento. */
function referencias(produccion: Produccion, datos: DatosDelEvento): string {
  const citadas = [...new Set(produccion.evidencias.map((evidencia) => evidencia.idConferencia))]
    .map((id) => datos.ponencias.find((ponencia) => ponencia.id === id))
    .filter((ponencia) => ponencia !== undefined)
    .sort((una, otra) => apellidos(una.ponente).localeCompare(apellidos(otra.ponente)))

  if (citadas.length === 0) {
    return ''
  }

  const entradas = citadas.map(
    (ponencia) =>
      `\\item ${escapar(ponencia.ponente)} (${escapar(fecha(ponencia.fecha))}). \\textit{${escapar(ponencia.titulo)}} [Ponencia]. ${escapar(datos.evento.nombre)}.`,
  )
  return ['\\section*{Referencias}', '\\begin{itemize}', ...entradas, '\\end{itemize}'].join('\n')
}

export type ResultadoDeLatex = { ok: true; tex: string } | { ok: false; motivo: string }

export function articuloEnLatex(produccion: Produccion, datos: DatosDelEvento, plantilla: string = PLANTILLA_POR_DEFECTO): ResultadoDeLatex {
  if (!plantilla.includes('[[cuerpo]]')) {
    return { ok: false, motivo: 'La plantilla no tiene [[cuerpo]]: márcalo donde va el texto del artículo y vuelve a elegirla.' }
  }

  const porClave = new Map(produccion.evidencias.map((evidencia) => [evidencia.clave, evidencia]))
  const parrafos = (texto: string): string =>
    texto
      .split('\n\n')
      .map((parrafo) => parrafoConCitas(parrafo.trim(), porClave))
      .filter((parrafo) => parrafo !== '')
      .join('\n\n')

  const resumen = produccion.secciones.find((seccion) => seccion.titulo.trim().toLowerCase() === 'resumen')
  const resto = produccion.secciones.filter((seccion) => seccion !== resumen)
  const conMarcaDeResumen = plantilla.includes('[[resumen]]')

  const cuerpo = [
    ...(resumen !== undefined && !conMarcaDeResumen ? [`\\section*{Resumen}\n${parrafos(resumen.texto)}`] : []),
    ...resto.map((seccion) => `\\section{${escapar(seccion.titulo)}}\n${parrafos(seccion.texto)}`),
  ].join('\n\n')

  const valores: Record<string, string> = {
    titulo: escapar(produccion.titulo),
    evento: escapar(datos.evento.nombre),
    fecha: escapar(fecha(datos.evento.fechaInicio)),
    resumen: resumen === undefined ? '' : parrafos(resumen.texto),
    cuerpo,
    referencias: referencias(produccion, datos),
  }

  return { ok: true, tex: plantilla.replace(/\[\[(titulo|evento|fecha|resumen|cuerpo|referencias)\]\]/g, (_, clave: string) => valores[clave] ?? '') }
}

export function nombreDeArchivo(titulo: string): string {
  const base = titulo
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
  return `${base || 'articulo'}.tex`
}

export function descargarTexto(contenido: string, nombre: string): void {
  const enlace = document.createElement('a')
  enlace.href = URL.createObjectURL(new Blob([contenido], { type: 'application/x-tex;charset=utf-8' }))
  enlace.download = nombre
  enlace.click()
  window.setTimeout(() => URL.revokeObjectURL(enlace.href), 1000)
}

/*
  Abrir el `.tex` en Overleaf para compilarlo a PDF, sin instalar nada en el
  servidor. Es su API pública de "abrir en Overleaf": un formulario que se
  envía en una pestaña nueva con el documento dentro. Solo pasa cuando la
  persona lo pulsa, porque manda el artículo a un servicio de terceros.
*/
export function abrirEnOverleaf(tex: string, nombre: string): void {
  const formulario = document.createElement('form')
  formulario.method = 'post'
  formulario.action = 'https://www.overleaf.com/docs'
  formulario.target = '_blank'
  for (const [campo, valor] of [
    ['encoded_snip', encodeURIComponent(tex)],
    ['snip_name', nombre],
    ['engine', 'pdflatex'],
  ] as const) {
    const entrada = document.createElement('input')
    entrada.type = 'hidden'
    entrada.name = campo
    entrada.value = valor
    formulario.appendChild(entrada)
  }
  document.body.appendChild(formulario)
  formulario.submit()
  formulario.remove()
}
