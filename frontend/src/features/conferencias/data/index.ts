/*
  Superficie pública de la capa de datos del dominio de conferencias. El resto
  del módulo importa desde aquí y no desde los archivos sueltos, para que la
  sustitución de los fixtures por el backend real (B6) toque un solo punto.
*/

export type {
  AsignacionDeEtiqueta,
  Comparticion,
  Conferencia,
  EspacioDeEtiquetas,
  EstadoDeComparticion,
  EstadoDeProcesamiento,
  EstadoDeValidacion,
  Etiqueta,
  Evento,
  Ficha,
  FuenteDeConferencia,
  Ponente,
  PrivacidadDeComparticion,
  TipoDeUnidad,
} from './tipos'
export { ESPACIO_DE_ETIQUETAS_VACIO } from './tipos'

export { formatearDuracion, formatearFecha, formatearTimestamp } from './formato'
export { nombreDePersona } from './personas'

export { CONFERENCIAS_DE_EJEMPLO } from './conferencias.fixture'
export { FICHAS_DE_EJEMPLO } from './fichas.fixture'
export { ESPACIOS_DE_ETIQUETAS_DE_EJEMPLO } from './etiquetas.fixture'
export { PERSONAS_DE_EJEMPLO } from './personas.fixture'
export type { PersonaDeEjemplo } from './personas.fixture'
