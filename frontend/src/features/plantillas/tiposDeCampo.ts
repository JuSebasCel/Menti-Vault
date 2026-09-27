import type { MarcadorSimpleDeDocx } from './data'

/*
  Qué va en un campo, elegido de una lista en vez de escrito a mano.

  Escribir una instrucción por campo es donde se atasca quien arma una
  plantilla: hay que decidir qué pedir, cómo pedirlo y con qué extensión, y
  eso por cada uno de quince campos. Casi siempre es una de media docena de
  cosas —la tesis, un resumen, las cifras, una cita, los datos del evento—,
  así que se eligen de una lista y la instrucción, el tipo de texto, el
  formato y la extensión quedan puestos de una vez.

  **La instrucción sigue siendo el dato que manda.** Elegir un tipo la
  escribe; después se edita libremente, y el tipo solo dice de dónde salió.
  Nada más abajo lee el tipo: la redacción del backend recibe la instrucción,
  como siempre.

  `opciones` es la excepción: un campo de lista cerrada no lo redacta la IA,
  lo ESCOGE de entre lo que quien armó la plantilla escribió ("conferencia",
  "taller", "panel"). Eso sí viaja al backend, porque no se puede expresar
  como instrucción sin arriesgarse a que el modelo conteste otra cosa.
*/

export type TipoDeCampo =
  | 'tesis'
  | 'resumen'
  | 'cifras'
  | 'cita'
  | 'conclusiones'
  | 'fuentes'
  | 'dato'
  | 'lista'
  | 'propio'

type Ajustes = Pick<MarcadorSimpleDeDocx, 'instruccion' | 'modo' | 'extension' | 'formato'>

export const TIPOS_DE_CAMPO: readonly {
  readonly valor: TipoDeCampo
  readonly etiqueta: string
  readonly icono: string
  readonly ajustes: Ajustes
}[] = [
  {
    valor: 'tesis',
    etiqueta: 'La tesis del ponente',
    icono: 'target',
    ajustes: {
      instruccion: 'Resume la tesis principal que defendió el ponente y el argumento con que la sostuvo.',
      modo: 'redactar',
      extension: 'media',
      formato: 'parrafo',
    },
  },
  {
    valor: 'resumen',
    etiqueta: 'Resumen de la charla',
    icono: 'subject',
    ajustes: {
      instruccion: 'Resume de qué trató la charla y por dónde pasó, en el orden en que la contó el ponente.',
      modo: 'redactar',
      extension: 'extensa',
      formato: 'parrafo',
    },
  },
  {
    valor: 'cifras',
    etiqueta: 'Cifras y datos',
    icono: 'monitoring',
    ajustes: {
      instruccion: 'Recoge los datos y cifras concretos que dio, cada uno con el contexto que le dio sentido.',
      modo: 'redactar',
      extension: 'media',
      formato: 'lista_vinetas',
    },
  },
  {
    valor: 'cita',
    etiqueta: 'Una cita textual',
    icono: 'format_quote',
    ajustes: {
      instruccion: 'Copia la frase más citable de la charla, palabra por palabra, sin comillas.',
      modo: 'cita',
      extension: 'breve',
      formato: 'parrafo',
    },
  },
  {
    valor: 'conclusiones',
    etiqueta: 'Conclusiones',
    icono: 'flag',
    ajustes: {
      instruccion: 'Resume las conclusiones y las recomendaciones con que cerró.',
      modo: 'redactar',
      extension: 'media',
      formato: 'lista_vinetas',
    },
  },
  {
    valor: 'fuentes',
    etiqueta: 'Fuentes que citó',
    icono: 'menu_book',
    ajustes: {
      instruccion:
        'Lista las fuentes que la charla citó (autor, año y título), tal como se dijeron o aparecieron en las diapositivas. No añadas ninguna que no conste.',
      modo: 'redactar',
      extension: 'media',
      formato: 'lista_vinetas',
    },
  },
  {
    valor: 'dato',
    etiqueta: 'Un dato del evento',
    icono: 'badge',
    ajustes: {
      instruccion:
        'Escribe el dato que pide el nombre de este campo (ponente, evento, fecha, lugar, correo de contacto…), tal como conste en la charla o en sus diapositivas. Si no consta, déjalo vacío.',
      modo: 'redactar',
      extension: 'breve',
      formato: 'parrafo',
    },
  },
  {
    valor: 'lista',
    etiqueta: 'Elegir de una lista',
    icono: 'checklist',
    ajustes: {
      instruccion: 'Elige la opción que corresponda según lo que se dijo en la charla.',
      modo: 'redactar',
      extension: 'breve',
      formato: 'parrafo',
    },
  },
  {
    valor: 'propio',
    etiqueta: 'Lo escribo yo',
    icono: 'edit',
    ajustes: { instruccion: '', modo: 'redactar', extension: 'media', formato: 'parrafo' },
  },
]

/* Un tipo que no esté en la lista (una plantilla vieja) no cambia nada de lo que ya había. */
export function ajustesDelTipo(tipo: TipoDeCampo): Ajustes {
  return (
    TIPOS_DE_CAMPO.find((candidato) => candidato.valor === tipo)?.ajustes ?? {
      instruccion: '',
      modo: 'redactar',
      extension: 'media',
      formato: 'parrafo',
    }
  )
}
