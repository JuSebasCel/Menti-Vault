/*
  Catálogo de errores de dominio del frontend.

  Regla de la sección 5 de CLAUDE.md: ningún error queda sin nombre propio, y la
  interfaz nunca muestra el código crudo ni detalle técnico. Cada código conocido
  se traduce a un mensaje accionable en español; cualquier código desconocido cae
  a un mensaje genérico que no filtra información interna.
*/

export type CodigoError =
  /* Acceso y registro (F1). */
  | 'AUTH_CAMPO_REQUERIDO'
  | 'AUTH_NOMBRE_REQUERIDO'
  | 'AUTH_CORREO_REQUERIDO'
  | 'AUTH_CONTRASENA_REQUERIDA'
  | 'AUTH_CORREO_INVALIDO'
  | 'AUTH_CREDENCIALES_INVALIDAS'
  | 'AUTH_CORREO_YA_REGISTRADO'
  | 'AUTH_CONTRASENA_DEBIL'
  | 'AUTH_FALLO_INESPERADO'
  /* Conferencias y etiquetas personales (F2). */
  | 'CONF_NO_ENCONTRADA'
  | 'CONF_PROCESAMIENTO_FALLIDO'
  | 'ETQ_NOMBRE_REQUERIDO'
  | 'ETQ_YA_EXISTE'
  | 'ETQ_NOMBRE_MUY_LARGO'
  | 'ETQ_NO_EDITABLE'
  /* Carga de conferencia (F3). */
  | 'CARGA_CAMPO_REQUERIDO'
  | 'CARGA_ARCHIVO_REQUERIDO'
  | 'CARGA_ARCHIVO_NO_SOPORTADO'
  | 'CARGA_ARCHIVO_MUY_GRANDE'
  | 'CARGA_API_KEY_REQUERIDA'
  | 'CARGA_FALLO_INESPERADO'
  | 'CARGA_ARCHIVO_RECHAZADO'
  /* Directorio compartido de eventos y ponentes (F3). */
  | 'DIR_EVENTO_NOMBRE_REQUERIDO'
  | 'DIR_EVENTO_YA_EXISTE'
  | 'DIR_EVENTO_NOMBRE_MUY_LARGO'
  | 'DIR_PONENTE_NOMBRE_REQUERIDO'
  | 'DIR_PONENTE_YA_EXISTE'
  | 'DIR_PONENTE_NOMBRE_MUY_LARGO'
  /* Editor de plantillas (F4). */
  | 'PLANT_NOMBRE_REQUERIDO'
  | 'PLANT_NOMBRE_MUY_LARGO'
  | 'PLANT_NO_ENCONTRADA'
  | 'PLANT_IMAGEN_NO_SOPORTADA'
  | 'PLANT_IMAGEN_MUY_GRANDE'
  | 'PLANT_DOCX_NO_SOPORTADO'
  | 'PLANT_DOCX_MUY_GRANDE'
  | 'PLANT_DOCX_FALLO_IMPORTACION'
  | 'PLANT_DOCX_FALLO_GENERACION'
  | 'PLANT_ETIQUETA_REQUERIDA'
  /*
    B6: el `.docx` importado ya no viaja como data URL dentro del registro de
    la plantilla, vive en el bucket `plantillas-docx`. Subirlo y recuperarlo
    son dos operaciones de red distintas y fallan por motivos distintos, así
    que llevan códigos propios en vez de caer al `DATOS_*` genérico: quien
    sube quiere reintentar el envío, quien abre una plantilla ya guardada
    quiere saber que el registro está bien y lo que falló fue el archivo.
  */
  | 'PLANT_DOCX_FALLO_SUBIDA'
  | 'PLANT_DOCX_FALLO_DESCARGA'
  /* Un .docx sin ningún [[campo]]: no hay nada que la IA pueda rellenar, así que no se sube. */
  | 'PLANT_DOCX_SIN_CAMPOS'
  /* Generador de memoria (F5). */
  | 'MEM_CONFERENCIA_REQUERIDA'
  | 'MEM_PLANTILLA_REQUERIDA'
  | 'MEM_NOMBRE_REQUERIDO'
  | 'MEM_NOMBRE_MUY_LARGO'
  | 'MEM_NO_ENCONTRADA'
  | 'MEM_FALLO_GENERACION'
  /* Redacción con IA y conversión a PDF: los escribe el backend con el mismo texto. */
  | 'MEM_SIN_HUECOS'
  | 'MEM_DOCX_VACIO'
  | 'MEM_DOCX_DEMASIADO_GRANDE'
  | 'MEM_PDF_SIN_CONVERSOR'
  | 'MEM_PDF_FALLO'
  /* Artículos: los que el backend responde antes de aceptar un paso, con el mismo texto. */
  | 'ART_SIN_CLAVE'
  | 'ART_NO_ENCONTRADO'
  | 'ART_PASO_NO_DISPONIBLE'
  | 'ART_SIN_PONENCIAS'
  | 'ART_MATERIAL_DEMASIADO_GRANDE'
  /* Fallos de OpenAI que llegan desde el backend. Sin ellos, quedarse sin saldo se leía como un error genérico. */
  | 'IA_API_KEY_RECHAZADA'
  | 'IA_LIMITE_DE_USO'
  | 'IA_CUPO_DIARIO_AGOTADO'
  | 'IA_SIN_RESPUESTA'
  | 'IA_RESPUESTA_ILEGIBLE'
  | 'IA_FALLO_INESPERADO'

  /* Taxonomía de temas (F9). */
  | 'TAX_TEMA_NOMBRE_REQUERIDO'
  | 'TAX_TEMA_NOMBRE_MUY_LARGO'
  | 'TAX_TEMA_YA_EXISTE'
  | 'TAX_PROPUESTA_NO_ENCONTRADA'

  /* Chat trazable (F7). */
  | 'CHAT_MENSAJE_VACIO'
  | 'CHAT_CONVERSACION_NO_ENCONTRADA'
  | 'CHAT_MENSAJE_NO_ENCONTRADO'
  | 'CHAT_ETIQUETA_SIN_FICHAS_CITADAS'
  | 'CHAT_TITULO_REQUERIDO'

  /* Configuración: API key y compartidos (F8). */
  | 'CONFIG_API_KEY_REQUERIDA'
  | 'CONFIG_API_KEY_FALLO_INESPERADO'
  | 'CONFIG_CONFERENCIA_REQUERIDA'
  | 'CONFIG_INVITADO_REQUERIDO'
  | 'CONFIG_YA_COMPARTIDA'
  | 'CONFIG_SIN_PERMISO_PARA_COMPARTIR'

  /*
    Persistencia (serie B). Son los tres desenlaces de una operación contra
    Supabase que la interfaz sabe distinguir; cualquier otro fallo de
    Postgres cae al mensaje genérico, que no filtra detalle técnico.
  */
  | 'DATOS_SIN_CONEXION'
  | 'DATOS_SIN_PERMISO'
  | 'DATOS_CONFLICTO'
  | 'DATOS_FALLO_INESPERADO'

/** Tope de longitud del nombre de una etiqueta: más largo rompe la fila densa del listado. */
export const LARGO_MAXIMO_DE_ETIQUETA = 24

/** Un tema de la taxonomía es un rótulo corto y comparable entre eventos, no una descripción. */
export const LARGO_MAXIMO_DE_TEMA = 60

/** Nombres de evento y ponente admiten más largo que una etiqueta: son texto libre real, no un chip. */
export const LARGO_MAXIMO_DE_EVENTO = 80
export const LARGO_MAXIMO_DE_PONENTE = 60

/** Nombre de una plantilla: se muestra en tarjetas del listado, similar de largo a un evento. */
export const LARGO_MAXIMO_DE_PLANTILLA = 80

/** Tope del archivo de imagen antes de codificarlo a base64 para guardarlo en sessionStorage. */
export const TAMANO_MAXIMO_DE_IMAGEN_MB = 2

/** Tope del archivo .docx que se puede importar como punto de partida de una plantilla. */
export const TAMANO_MAXIMO_DE_DOCX_MB = 10

/** Largo máximo de una etiqueta personalizada de marcador (texto libre, no un campo fijo). */
export const LARGO_MAXIMO_DE_ETIQUETA_DE_MARCADOR = 120

/** Nombre de una memoria generada: mismo criterio que el nombre de una plantilla. */
export const LARGO_MAXIMO_DE_MEMORIA = 80

/** Mínimo exigido por Supabase Auth (`supabase/config.toml`, B1): mayúscula, minúscula, número y símbolo. */
export const LARGO_MINIMO_DE_CONTRASENA = 8

const MENSAJES: Record<CodigoError, string> = {
  AUTH_CAMPO_REQUERIDO: 'Completa todos los campos para continuar.',
  AUTH_NOMBRE_REQUERIDO: 'Escribe tu nombre.',
  AUTH_CORREO_REQUERIDO: 'Escribe tu correo.',
  AUTH_CONTRASENA_REQUERIDA: 'Escribe tu contraseña.',
  AUTH_CORREO_INVALIDO: 'Ese correo no tiene un formato válido. Revísalo e inténtalo de nuevo.',
  AUTH_CREDENCIALES_INVALIDAS:
    'El correo o la contraseña no coinciden. Revísalos e inténtalo de nuevo.',
  AUTH_CORREO_YA_REGISTRADO:
    'Ya existe una cuenta con ese correo. Inicia sesión o usa otro correo.',
  AUTH_CONTRASENA_DEBIL: `La contraseña debe tener al menos ${LARGO_MINIMO_DE_CONTRASENA} caracteres, con mayúscula, minúscula, número y símbolo.`,
  AUTH_FALLO_INESPERADO: 'No pudimos completar la acción. Vuelve a intentarlo en unos momentos.',

  /*
    Este mensaje cubre a propósito dos situaciones: la conferencia no existe, o
    existe y no está compartida con quien la pide. Distinguirlas convertiría el
    detalle en una forma de averiguar qué subió otra persona, en contra de la
    regla de aislamiento por fila de PLAN.md sección 6.3.
  */
  CONF_NO_ENCONTRADA:
    'No encontramos esa conferencia entre las tuyas ni entre las compartidas contigo.',
  CONF_PROCESAMIENTO_FALLIDO:
    'El procesamiento de esta conferencia se interrumpió, así que todavía no tiene fichas. Vuelve a cargarla para reintentarlo.',
  ETQ_NOMBRE_REQUERIDO: 'Escribe un nombre para la etiqueta antes de crearla.',
  ETQ_YA_EXISTE: 'Ya tienes una etiqueta con ese nombre. Elígela de la lista o usa otro nombre.',
  ETQ_NOMBRE_MUY_LARGO: `El nombre de la etiqueta admite hasta ${LARGO_MAXIMO_DE_ETIQUETA} caracteres. Acórtalo para guardarlo.`,
  ETQ_NO_EDITABLE:
    'Esa etiqueta la puso quien te compartió la conferencia, así que solo esa persona puede quitarla.',

  CARGA_CAMPO_REQUERIDO: 'Completa el título, el ponente, el evento y la fecha antes de continuar.',
  CARGA_ARCHIVO_REQUERIDO: 'Elige el archivo de audio o transcripción antes de continuar.',
  CARGA_ARCHIVO_NO_SOPORTADO:
    'Ese archivo no tiene un formato admitido para la fuente elegida. Revísalo e inténtalo de nuevo.',
  CARGA_ARCHIVO_MUY_GRANDE: 'Ese archivo supera el tamaño máximo admitido. Usa uno más liviano.',
  CARGA_API_KEY_REQUERIDA: 'Necesitas una API key configurada antes de cargar una conferencia.',
  CARGA_FALLO_INESPERADO: 'No pudimos recibir la conferencia. Vuelve a intentarlo en unos momentos.',
  /*
    Separado del genérico a propósito: la fila se guarda y el archivo se sube
    en dos pasos distintos, y confundirlos manda a reintentar cuando lo que
    hay que hacer es cambiar el archivo. El motivo de verdad (tamaño, formato,
    permisos del bucket) sale por consola: es de Supabase y no se puede
    traducir sin adivinar.
  */
  CARGA_ARCHIVO_RECHAZADO:
    'La conferencia se guardó pero el almacenamiento rechazó el archivo. Mira la consola para ver el motivo exacto; lo más habitual es que pese más de lo que el proyecto admite.',

  DIR_EVENTO_NOMBRE_REQUERIDO: 'Escribe un nombre para el evento antes de crearlo.',
  DIR_EVENTO_YA_EXISTE: 'Ya existe un evento con ese nombre. Elígelo de la lista o usa otro nombre.',
  DIR_EVENTO_NOMBRE_MUY_LARGO: `El nombre del evento admite hasta ${LARGO_MAXIMO_DE_EVENTO} caracteres. Acórtalo para guardarlo.`,
  DIR_PONENTE_NOMBRE_REQUERIDO: 'Escribe un nombre para el ponente antes de crearlo.',
  DIR_PONENTE_YA_EXISTE:
    'Ese ponente ya está registrado en este evento. Elígelo de la lista o usa otro nombre.',
  DIR_PONENTE_NOMBRE_MUY_LARGO: `El nombre del ponente admite hasta ${LARGO_MAXIMO_DE_PONENTE} caracteres. Acórtalo para guardarlo.`,

  PLANT_NOMBRE_REQUERIDO: 'Escribe un nombre para la plantilla antes de guardarla.',
  PLANT_NOMBRE_MUY_LARGO: `El nombre de la plantilla admite hasta ${LARGO_MAXIMO_DE_PLANTILLA} caracteres. Acórtalo para guardarlo.`,
  PLANT_NO_ENCONTRADA: 'No encontramos esa plantilla. Puede que ya se haya eliminado.',
  PLANT_IMAGEN_NO_SOPORTADA:
    'Esa imagen no tiene un formato admitido. Usa PNG, JPG o WEBP e inténtalo de nuevo.',
  PLANT_IMAGEN_MUY_GRANDE: `Esa imagen supera el tamaño máximo admitido (${TAMANO_MAXIMO_DE_IMAGEN_MB} MB). Usa una más liviana.`,
  PLANT_DOCX_NO_SOPORTADO: 'Ese archivo no es un .docx admitido. Expórtalo desde Word y vuelve a intentarlo.',
  PLANT_DOCX_MUY_GRANDE: `Ese archivo supera el tamaño máximo admitido (${TAMANO_MAXIMO_DE_DOCX_MB} MB). Usa uno más liviano.`,
  PLANT_DOCX_FALLO_IMPORTACION:
    'No pudimos leer ese archivo. Puede estar dañado o usar un formato que todavía no soportamos.',
  PLANT_DOCX_FALLO_GENERACION:
    'No pudimos generar la vista previa. Revisa que las marcas [[SI:...]]/[[FIN SI]] y [[REPETIR:...]]/[[FIN REPETIR]] estén completas y bien escritas en el documento.',
  PLANT_ETIQUETA_REQUERIDA: 'Escribe una descripción para el campo personalizado antes de agregarlo.',
  PLANT_DOCX_FALLO_SUBIDA:
    'No pudimos guardar el archivo de la plantilla. Revisa tu conexión y vuelve a subirlo.',
  PLANT_DOCX_SIN_CAMPOS:
    'Esta plantilla no tiene ningún campo, así que no se subió: no habría nada que rellenar. En Word, escribe entre dobles corchetes el nombre de cada campo donde va su contenido —por ejemplo, [[Resumen de la tesis]]— y vuelve a subirla.',
  PLANT_DOCX_FALLO_DESCARGA:
    'No pudimos recuperar el archivo original de esta plantilla. Vuelve a intentarlo en unos momentos.',

  MEM_CONFERENCIA_REQUERIDA: 'Elige la conferencia de la que quieres generar la memoria.',
  MEM_PLANTILLA_REQUERIDA: 'Elige la plantilla que quieres usar para la memoria.',
  MEM_NOMBRE_REQUERIDO: 'Escribe un nombre para la memoria antes de generarla.',
  MEM_NOMBRE_MUY_LARGO: `El nombre de la memoria admite hasta ${LARGO_MAXIMO_DE_MEMORIA} caracteres. Acórtalo para generarla.`,
  MEM_NO_ENCONTRADA: 'No encontramos esa memoria. Puede que ya se haya eliminado.',
  ART_SIN_CLAVE:
    'La redacción de artículos todavía no está activada en el servidor. Pide a la administración que configure la clave de Anthropic.',
  ART_NO_ENCONTRADO: 'No encontramos ese artículo entre los tuyos.',
  ART_PASO_NO_DISPONIBLE: 'Este artículo ya está en otro paso. Recarga la página para ver en qué va.',
  ART_SIN_PONENCIAS:
    'Ninguna de las ponencias elegidas tiene una transcripción que se pueda leer. Transcribe al menos una antes de escribir el artículo.',
  ART_MATERIAL_DEMASIADO_GRANDE: 'Las ponencias elegidas suman demasiado texto para un solo artículo. Elige menos y vuelve a intentarlo.',
  MEM_FALLO_GENERACION:
    'No pudimos generar la memoria. Puede que la conferencia o la plantilla de origen ya no estén disponibles.',
  IA_API_KEY_RECHAZADA:
    'El proveedor de IA rechazó la API key. Revísala en Configuración y vuelve a guardarla.',
  IA_LIMITE_DE_USO:
    'La cuenta de IA alcanzó su límite de uso, también en los modelos de respaldo. Vuelve a intentarlo en un rato.',
  IA_CUPO_DIARIO_AGOTADO:
    'Hoy ya se usó todo el cupo de audio compartido. Vuelve a intentarlo mañana, o usa tus propias claves en Configuración.',
  IA_SIN_RESPUESTA:
    'No pudimos comunicarnos con el proveedor de IA. Vuelve a intentarlo en unos momentos.',
  IA_RESPUESTA_ILEGIBLE:
    'El análisis devolvió un resultado que no pudimos interpretar. Vuelve a intentarlo.',
  IA_FALLO_INESPERADO:
    'No pudimos completar el análisis. Vuelve a intentarlo en unos momentos.',
  MEM_SIN_HUECOS:
    'Esta plantilla no tiene ningún marcador que rellenar. Márcalos en Word con [[Nombre]] y vuelve a subirla.',
  MEM_DOCX_VACIO:
    'No llegó ningún documento que convertir. Vuelve a generar la memoria.',
  MEM_DOCX_DEMASIADO_GRANDE:
    'El documento es demasiado grande para convertirlo a PDF. Reduce el tamaño de las imágenes de la plantilla en Word y vuelve a subirla.',
  MEM_PDF_SIN_CONVERSOR:
    'El servidor no tiene LibreOffice instalado, así que no puede crear el PDF. La memoria en Word sí se puede descargar.',
  MEM_PDF_FALLO:
    'No pudimos convertir la memoria a PDF. La versión en Word sí se puede descargar.',

  TAX_TEMA_NOMBRE_REQUERIDO: 'Escribe un nombre para el tema.',
  TAX_TEMA_NOMBRE_MUY_LARGO: `El nombre de un tema admite hasta ${LARGO_MAXIMO_DE_TEMA} caracteres. Acórtalo para guardarlo.`,
  TAX_TEMA_YA_EXISTE:
    'Ya existe un tema con ese nombre. Se reutiliza en vez de crear uno nuevo: el vocabulario repetido rompe la comparación entre eventos.',
  TAX_PROPUESTA_NO_ENCONTRADA: 'No encontramos esa propuesta. Puede que ya se haya revisado.',

  CHAT_MENSAJE_VACIO: 'Escribe algo antes de enviarlo.',
  CHAT_CONVERSACION_NO_ENCONTRADA: 'No encontramos esa conversación. Puede que ya se haya eliminado.',
  CHAT_MENSAJE_NO_ENCONTRADO: 'No encontramos ese mensaje para editarlo.',
  CHAT_ETIQUETA_SIN_FICHAS_CITADAS: 'Esta respuesta no cita ninguna ficha, así que no hay nada que etiquetar.',
  CHAT_TITULO_REQUERIDO: 'Escribe un nombre para la conversación.',

  CONFIG_API_KEY_REQUERIDA: 'Escribe tu API key antes de guardarla.',
  CONFIG_API_KEY_FALLO_INESPERADO: 'No pudimos guardar tu API key. Vuelve a intentarlo en unos momentos.',
  CONFIG_CONFERENCIA_REQUERIDA: 'Elige la conferencia que quieres compartir.',
  CONFIG_INVITADO_REQUERIDO: 'Elige con quién quieres compartirla.',
  CONFIG_YA_COMPARTIDA: 'Esa persona ya tiene esta conferencia compartida.',
  CONFIG_SIN_PERMISO_PARA_COMPARTIR: 'Quien te compartió esta conferencia no permitió que la vuelvas a compartir.',

  DATOS_SIN_CONEXION: 'No pudimos conectarnos. Revisa tu conexión y vuelve a intentarlo.',
  DATOS_SIN_PERMISO: 'No tienes permiso para hacer eso. Puede que quien la compartió haya cambiado los permisos.',
  DATOS_CONFLICTO: 'Eso ya existe. Revisa la lista antes de volver a crearlo.',
  DATOS_FALLO_INESPERADO: 'No pudimos guardar el cambio. Vuelve a intentarlo en unos momentos.',
}

const MENSAJE_GENERICO = 'No pudimos completar la acción. Vuelve a intentarlo en unos momentos.'

/*
  Lista de códigos conocidos, útil para recorrer el catálogo completo en pruebas
  y en herramientas de diagnóstico sin duplicar la definición del tipo.
*/
export const CODIGOS_DE_ERROR = Object.keys(MENSAJES) as readonly CodigoError[]

function esCodigoConocido(codigo: string): codigo is CodigoError {
  return Object.prototype.hasOwnProperty.call(MENSAJES, codigo)
}

export function mensajeDeError(codigo: string): string {
  if (!esCodigoConocido(codigo)) {
    return MENSAJE_GENERICO
  }

  return MENSAJES[codigo]
}
