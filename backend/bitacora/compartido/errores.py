"""
Catálogo de errores del backend.

Mismo criterio que `frontend/src/shared/errors/index.ts`: ningún error queda
sin nombre propio, y hacia afuera nunca viaja un detalle técnico crudo (una
traza de OpenAI, un SQLSTATE, la ruta de un objeto en Storage). Cada código
conocido tiene un mensaje accionable en español; cualquier código desconocido
cae al genérico.

Los códigos que el frontend ya sabe traducir se reescriben aquí con la MISMA
ortografía a propósito (`DATOS_*`, `CONF_NO_ENCONTRADA`, `CHAT_MENSAJE_VACIO`,
`CONFIG_API_KEY_REQUERIDA`). La respuesta HTTP lleva el código además del
mensaje, así que la interfaz puede pasarlo por su propio `mensajeDeError` y
mostrar el texto que ya usa en el resto de la aplicación, sin que existan dos
redacciones distintas del mismo problema. Los códigos nuevos (`IA_*`,
`PROC_*`, `AUTH_TOKEN_*`) no existen en el frontend: para esos, la interfaz
cae a su mensaje genérico y por eso este catálogo también manda el suyo
redactado, listo para mostrarse tal cual.
"""

from __future__ import annotations

from typing import Final, Literal

CodigoError = Literal[
    # Autenticación de la petición: el token del usuario que viaja en Authorization.
    "AUTH_TOKEN_AUSENTE",
    "AUTH_TOKEN_INVALIDO",
    # API key de OpenAI del usuario (Vault). Nunca se reporta su valor, solo su ausencia o rechazo.
    "CONFIG_API_KEY_REQUERIDA",
    "IA_API_KEY_RECHAZADA",
    "IA_LIMITE_DE_USO",
    "IA_CUPO_DIARIO_AGOTADO",
    "IA_SIN_RESPUESTA",
    "IA_RESPUESTA_ILEGIBLE",
    "IA_FALLO_INESPERADO",
    # Procesamiento de una conferencia (transcripción + análisis de discurso).
    "CONF_NO_ENCONTRADA",
    "CONF_PROCESAMIENTO_FALLIDO",
    "PROC_ESTADO_NO_PROCESABLE",
    "PROC_AUDIO_NO_ENCONTRADO",
    "PROC_ARCHIVO_ILEGIBLE",
    "PROC_TRANSCRIPCION_VACIA",
    "PROC_TRANSCRIPCION_SIN_COORDENADAS",
    "PROC_SIN_TEMAS_DISPONIBLES",
    "PROC_SIN_FICHAS",
    # Memorias: redactar los huecos de una plantilla y convertirla a PDF.
    "MEM_SIN_HUECOS",
    "MEM_DOCX_VACIO",
    "MEM_DOCX_DEMASIADO_GRANDE",
    "MEM_PDF_SIN_CONVERSOR",
    "MEM_PDF_FALLO",
    # Plantillas: proponer que va en cada campo.
    "PLANT_SIN_CAMPOS",
    # Material de apoyo: diapositivas y documentos de una charla.
    "MATERIAL_NO_ENCONTRADO",
    "MATERIAL_SIN_TEXTO",
    # Agente conversacional sobre el catálogo.
    "CHAT_MENSAJE_VACIO",
    "CHAT_CONVERSACION_NO_ENCONTRADA",
    # Persistencia. Mismos tres desenlaces que la capa de datos del frontend.
    "DATOS_SIN_CONEXION",
    "DATOS_SIN_PERMISO",
    "DATOS_CONFLICTO",
    "DATOS_FALLO_INESPERADO",
]

_MENSAJES: Final[dict[str, str]] = {
    "MATERIAL_NO_ENCONTRADO": "No se encontro esa imagen entre el material de apoyo de la conferencia.",
    "MATERIAL_SIN_TEXTO": (
        "No se pudo leer texto en esa imagen. Puede que no tenga texto legible, que pese demasiado "
        "o que el modelo con vision configurado ya no exista."
    ),
    "PLANT_SIN_CAMPOS": (
        "Esta plantilla no tiene ningun campo que configurar. Marcalos en Word con "
        "[[Nombre]] y vuelve a subirla."
    ),
    "MEM_SIN_HUECOS": (
        "Esta plantilla no tiene ningún marcador que rellenar. Márcalos en Word con "
        "[[Nombre]] y vuelve a subirla."
    ),
    "MEM_DOCX_VACIO": "No llegó ningún documento que convertir. Vuelve a generar la memoria.",
    "MEM_DOCX_DEMASIADO_GRANDE": (
        "El documento es demasiado grande para convertirlo a PDF. Reduce el tamaño de las "
        "imágenes de la plantilla en Word y vuelve a subirla."
    ),
    # El único caso en el que el problema es del servidor y no se arregla
    # reintentando: dice qué falta para que quien lo despliega lo encuentre.
    "MEM_PDF_SIN_CONVERSOR": (
        "El servidor no tiene LibreOffice instalado, así que no puede crear el PDF. "
        "La memoria en Word sí se puede descargar."
    ),
    "MEM_PDF_FALLO": (
        "No pudimos convertir la memoria a PDF. La versión en Word sí se puede descargar."
    ),
    "AUTH_TOKEN_AUSENTE": (
        "Tu sesión no viajó con la petición. Vuelve a iniciar sesión e inténtalo de nuevo."
    ),
    "AUTH_TOKEN_INVALIDO": (
        "Tu sesión expiró o dejó de ser válida. Vuelve a iniciar sesión e inténtalo de nuevo."
    ),
    "CONFIG_API_KEY_REQUERIDA": (
        "Necesitas una API key de OpenAI configurada antes de procesar o consultar. "
        "Guárdala en Configuración e inténtalo de nuevo."
    ),
    "IA_API_KEY_RECHAZADA": (
        "El proveedor de IA rechazó la API key. Revísala en Configuración y vuelve a guardarla."
    ),
    "IA_LIMITE_DE_USO": (
        "La cuenta de IA alcanzó su límite de uso, también en los modelos de respaldo. Vuelve a intentarlo en un rato."
    ),
    "IA_CUPO_DIARIO_AGOTADO": (
        "Hoy ya se usó todo el cupo de audio compartido. Vuelve a intentarlo mañana, o usa tus propias claves en Configuración."
    ),
    "IA_SIN_RESPUESTA": (
        "No pudimos comunicarnos con el proveedor de IA. Vuelve a intentarlo en unos momentos."
    ),
    "IA_RESPUESTA_ILEGIBLE": (
        "El análisis devolvió un resultado que no pudimos interpretar. Vuelve a intentarlo."
    ),
    "IA_FALLO_INESPERADO": (
        "No pudimos completar el análisis. Vuelve a intentarlo en unos momentos."
    ),
    # Mismo texto que el frontend: la ambigüedad entre "no existe" y "no te
    # corresponde" es deliberada allá, y distinguirlas aquí volvería al backend
    # el oráculo que revela qué subió otra persona.
    "CONF_NO_ENCONTRADA": (
        "No encontramos esa conferencia entre las tuyas ni entre las compartidas contigo."
    ),
    "CONF_PROCESAMIENTO_FALLIDO": (
        "El procesamiento de esta conferencia se interrumpió, así que todavía no tiene fichas. "
        "Vuelve a cargarla para reintentarlo."
    ),
    "PROC_ESTADO_NO_PROCESABLE": (
        "Esta conferencia no está en cola: ya se procesó o se está procesando ahora mismo."
    ),
    "PROC_AUDIO_NO_ENCONTRADO": (
        "No encontramos el archivo de esta conferencia. Vuelve a cargarla para reintentarlo."
    ),
    "PROC_ARCHIVO_ILEGIBLE": (
        "No pudimos leer el archivo de esta conferencia. Puede estar dañado o en un formato "
        "que todavía no soportamos."
    ),
    "PROC_TRANSCRIPCION_VACIA": (
        "La transcripción quedó vacía: no se reconoció habla en el archivo. "
        "Revisa que el audio tenga voz audible y vuelve a cargarlo."
    ),
    "PROC_TRANSCRIPCION_SIN_COORDENADAS": (
        "Esa transcripción no trae marcas de tiempo ni la conferencia declara duración, así que "
        "no podríamos decir en qué segundo se dijo cada cosa. Agrega marcas del tipo [12:30] al "
        "texto, o carga el audio original."
    ),
    "PROC_SIN_TEMAS_DISPONIBLES": (
        "Todavía no hay temas en la taxonomía con los que clasificar esta charla. "
        "Cura al menos un tema antes de procesarla."
    ),
    "PROC_SIN_FICHAS": (
        "El análisis no encontró ninguna unidad de discurso citable en esta charla. "
        "Revisa que el archivo corresponda a la conferencia."
    ),
    "CHAT_MENSAJE_VACIO": "Escribe algo antes de enviarlo.",
    "CHAT_CONVERSACION_NO_ENCONTRADA": (
        "No encontramos esa conversación. Puede que ya se haya eliminado."
    ),
    "DATOS_SIN_CONEXION": "No pudimos conectarnos. Revisa tu conexión y vuelve a intentarlo.",
    "DATOS_SIN_PERMISO": (
        "No tienes permiso para hacer eso. Puede que quien la compartió haya cambiado los permisos."
    ),
    "DATOS_CONFLICTO": "Eso ya existe. Revisa la lista antes de volver a crearlo.",
    "DATOS_FALLO_INESPERADO": (
        "No pudimos guardar el cambio. Vuelve a intentarlo en unos momentos."
    ),
}

MENSAJE_GENERICO: Final[str] = (
    "No pudimos completar la acción. Vuelve a intentarlo en unos momentos."
)

CODIGOS_DE_ERROR: Final[tuple[str, ...]] = tuple(_MENSAJES)

"""
Estado HTTP por código. Solo se declaran los que NO son 500: el estado por
defecto de un error nombrado sigue siendo 500, porque la mayoría de los
desenlaces de este backend son fallos de una dependencia (OpenAI, Postgres) y
no culpa de la petición. Mapear cada código a mano y no derivarlo del prefijo
evita que agregar un código nuevo cambie sin querer el estado de otro.
"""
_ESTADOS_HTTP: Final[dict[str, int]] = {
    "AUTH_TOKEN_AUSENTE": 401,
    "AUTH_TOKEN_INVALIDO": 401,
    "CONFIG_API_KEY_REQUERIDA": 409,
    "IA_API_KEY_RECHAZADA": 409,
    "IA_LIMITE_DE_USO": 429,
    "IA_CUPO_DIARIO_AGOTADO": 429,
    "IA_SIN_RESPUESTA": 503,
    "CONF_NO_ENCONTRADA": 404,
    "CHAT_CONVERSACION_NO_ENCONTRADA": 404,
    "CHAT_MENSAJE_VACIO": 422,
    "MEM_SIN_HUECOS": 422,
    "PLANT_SIN_CAMPOS": 422,
    "MATERIAL_NO_ENCONTRADO": 404,
    "MATERIAL_SIN_TEXTO": 422,
    "MEM_DOCX_VACIO": 422,
    "MEM_DOCX_DEMASIADO_GRANDE": 413,
    "MEM_PDF_SIN_CONVERSOR": 503,
    "PROC_ESTADO_NO_PROCESABLE": 409,
    "PROC_AUDIO_NO_ENCONTRADO": 404,
    "PROC_TRANSCRIPCION_SIN_COORDENADAS": 422,
    "PROC_SIN_TEMAS_DISPONIBLES": 409,
    "DATOS_SIN_PERMISO": 403,
    "DATOS_SIN_CONEXION": 503,
    "DATOS_CONFLICTO": 409,
}

_ESTADO_HTTP_POR_DEFECTO: Final[int] = 500


def mensaje_de_error(codigo: str) -> str:
    """Traduce un código a su mensaje. Un código desconocido nunca se filtra tal cual."""
    return _MENSAJES.get(codigo, MENSAJE_GENERICO)


def estado_http_de_error(codigo: str) -> int:
    return _ESTADOS_HTTP.get(codigo, _ESTADO_HTTP_POR_DEFECTO)


class ErrorDeBitacora(Exception):
    """
    Único error que este backend deja escapar de una capa a otra.

    `detalle` existe para el log del servidor y JAMÁS entra en la respuesta
    HTTP: es donde se guarda lo que sí sirve para depurar (el SQLSTATE, el
    tipo de excepción de OpenAI) sin que llegue al navegador. La alternativa
    obvia —devolver `str(excepcion_original)`— es justo la que filtra rutas de
    Storage, nombres de columnas y, en el peor caso, fragmentos de una clave.
    """

    def __init__(self, codigo: CodigoError | str, detalle: str = "") -> None:
        super().__init__(codigo)
        self.codigo = codigo
        self.detalle = detalle

    @property
    def mensaje(self) -> str:
        return mensaje_de_error(self.codigo)

    @property
    def estado_http(self) -> int:
        return estado_http_de_error(self.codigo)

    def como_respuesta(self) -> dict[str, str]:
        """Cuerpo JSON del error: código para que la interfaz decida, mensaje para mostrar."""
        return {"codigo": self.codigo, "mensaje": self.mensaje}

    def __repr__(self) -> str:  # pragma: no cover - solo diagnóstico
        return f"ErrorDeBitacora({self.codigo!r})"
