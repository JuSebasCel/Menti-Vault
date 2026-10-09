"""
Acceso a OpenAI con la API key del usuario que hizo la petición.

Dos responsabilidades, las dos de seguridad antes que de comodidad:

1. La clave nunca se imprime. `ClaveDeOpenAI` redefine `__repr__` y `__str__`
   para que ni un log de depuración, ni un `pytest` que muestre variables
   locales al fallar, ni una traza no capturada la dejen escrita en ningún
   lado. Guardar la clave en un `str` pelado bastaría para que apareciera
   sola el día que alguien agregue un `logging.debug(locals())`.

2. Ninguna excepción del SDK cruza hacia arriba. Se traducen a códigos del
   catálogo, porque el mensaje de OpenAI puede incluir el prefijo de la clave
   y porque la interfaz necesita distinguir "tu clave está mal" (se arregla en
   Configuración) de "OpenAI está caído" (se reintenta) — dos acciones
   distintas que un 500 genérico vuelve indistinguibles.
"""

from __future__ import annotations

from dataclasses import dataclass
from types import SimpleNamespace
from typing import Any, Callable, Protocol

from bitacora.compartido.errores import ErrorDeBitacora


@dataclass(frozen=True)
class ClaveDeOpenAI:
    valor: str
    """
    Si es la de la cuenta administradora, compartida con todos. Decide si la
    carga gasta del cupo diario común (`reservar_cupo_de_audio`).
    """
    compartida: bool = False

    def __repr__(self) -> str:
        return "ClaveDeOpenAI(<oculta>)"

    def __str__(self) -> str:
        return "<oculta>"


class ClienteDeOpenAI(Protocol):
    """
    Lo mínimo que este backend usa del SDK, para poder sustituirlo en pruebas.

    Se declara el protocolo en vez de mockear `openai.OpenAI` con parches
    porque los parches se rompen cada vez que el SDK reorganiza sus módulos, y
    lo que la suite quiere fijar es el contrato de este backend, no el del SDK.
    """

    @property
    def audio(self) -> Any: ...

    @property
    def chat(self) -> Any: ...


URL_DE_GROQ = "https://api.groq.com/openai/v1"


def es_de_groq(clave: ClaveDeOpenAI) -> bool:
    """
    El proveedor sale de la propia clave: las de Groq empiezan por `gsk_`, las
    de OpenAI por `sk-`. Así conviven sin un ajuste aparte: quien todavía tenga
    una clave de OpenAI sigue funcionando, y quien pegue una de Groq pasa a
    Groq sin tocar nada más.
    """
    return clave.valor.startswith("gsk_")


"""
Los fallos que hacen pasar al siguiente modelo de la cadena: el límite de uso
de ese modelo (en Groq cada modelo tiene el suyo dentro de la misma cuenta),
un modelo que ya no existe, o el proveedor que no responde. Una clave
rechazada o una petición mal formada no mejoran cambiando de modelo: esas
suben tal cual.
"""
_FALLOS_QUE_PASAN_AL_RESPALDO = frozenset(
    {"RateLimitError", "NotFoundError", "InternalServerError", "APIConnectionError", "APITimeoutError"}
)


def _pasa_al_respaldo(fallo: BaseException) -> bool:
    """
    También el 413 de Groq: una petición que sola supera el límite de tokens
    por minuto del modelo. Esperar no la arregla —el límite es por minuto y
    ella entera ya no cabe—, pero otro modelo de la cadena puede tener un
    límite más holgado.
    """
    if getattr(fallo, "status_code", None) == 413:
        return True
    # Groq rechaza con 400 `json_validate_failed` la respuesta de un modelo
    # que no cerró el JSON pedido (suele quedarse corto de tokens tras
    # razonar). No es una petición mal formada: otro modelo de la cadena
    # puede devolverlo bien.
    if getattr(fallo, "status_code", None) == 400 and "json_validate_failed" in str(fallo):
        return True
    return any(clase.__name__ in _FALLOS_QUE_PASAN_AL_RESPALDO for clase in type(fallo).__mro__)


"""
Lo que se le pide a cada llamada de texto en Groq, si quien llama no lo fija.

Medido en la primera corrida real: una ventana de clasificación pedía unos
8.500 tokens (6.000 de entrada y 2.300 de salida) contra un límite de 8.000
por minuto del plan gratuito, y Groq la rechazaba entera. gpt-oss es un
modelo que razona antes de responder, y ese razonamiento cuenta como
salida: con esfuerzo bajo la salida baja mucho sin tocar el JSON que se
pide. `reasoning_effort` solo se manda a los gpt-oss: llama lo rechaza.
El tope de salida acota lo que Groq reserva para la respuesta, que también
cuenta contra el límite por minuto.
"""
TOPE_DE_SALIDA_EN_GROQ = 3000


def _ajustes_para_groq(modelo: str, argumentos: dict[str, Any]) -> dict[str, Any]:
    ajustados = dict(argumentos)
    ajustados.setdefault("max_completion_tokens", TOPE_DE_SALIDA_EN_GROQ)
    if "gpt-oss" in modelo:
        ajustados.setdefault("reasoning_effort", "low")
    return ajustados


class _CrearConRespaldo:
    """Un `create` del SDK que prueba cada modelo de la cadena, en orden, hasta que uno responda."""

    def __init__(self, crear: Callable[..., Any], cadena: tuple[str, ...], es_de_texto: bool = False) -> None:
        self._crear = crear
        self._cadena = cadena
        self._es_de_texto = es_de_texto

    def create(self, **argumentos: Any) -> Any:
        ultimo: BaseException | None = None

        for modelo in self._cadena:
            pedidos = _ajustes_para_groq(modelo, argumentos) if self._es_de_texto else argumentos
            try:
                return self._crear(**{**pedidos, "model": modelo})
            except Exception as fallo:  # noqa: BLE001
                if not _pasa_al_respaldo(fallo):
                    raise
                ultimo = fallo

        assert ultimo is not None
        raise ultimo


class ClienteConRespaldo:
    """
    El cliente del SDK con una cadena de modelos: el primero es el preferido,
    los demás los respaldos, del más capaz al de límite más holgado. Quien lo
    usa sigue llamando `chat.completions.create(model=...)` como siempre; el
    modelo que pida se sustituye por la cadena, así que ningún paso del
    análisis necesita saber que existen los respaldos.
    """

    def __init__(self, cliente: Any, cadena: tuple[str, ...]) -> None:
        self.audio = SimpleNamespace(transcriptions=_CrearConRespaldo(cliente.audio.transcriptions.create, cadena))
        self.chat = SimpleNamespace(
            completions=_CrearConRespaldo(cliente.chat.completions.create, cadena, es_de_texto=True)
        )


def crear_cliente(clave: ClaveDeOpenAI, cadena: tuple[str, ...] = ()) -> ClienteDeOpenAI:
    """
    Se importa aquí dentro para que los módulos puros no arrastren el SDK.

    Groq habla el mismo protocolo que OpenAI: basta con cambiar la dirección.
    Sin cadena, el cliente usa el modelo que cada llamada pida.
    """
    from openai import OpenAI

    """
    Con Groq, más reintentos: el SDK ya espera lo que el proveedor pide en
    `retry-after` ante un 429, y con 8.000 tokens por minuto un análisis
    largo va a tener que esperar su turno varias veces. Esperar es mejor que
    fallar o saltar al respaldo al primer aviso.
    """
    cliente = (
        OpenAI(api_key=clave.valor, base_url=URL_DE_GROQ, max_retries=6)
        if es_de_groq(clave)
        else OpenAI(api_key=clave.valor)
    )
    return ClienteConRespaldo(cliente, cadena) if cadena else cliente


"""
Nombres de excepción del SDK mapeados por nombre de clase y no por `isinstance`.

Importar `openai.AuthenticationError` en la firma obligaría a tener el SDK
instalado para probar la traducción de errores, que es justo la parte que hay
que poder ejercitar sin red ni credenciales. El nombre de clase es estable
entre versiones del SDK; la ubicación del módulo no lo ha sido.
"""
_CODIGOS_POR_EXCEPCION: dict[str, str] = {
    "AuthenticationError": "IA_API_KEY_RECHAZADA",
    "PermissionDeniedError": "IA_API_KEY_RECHAZADA",
    "RateLimitError": "IA_LIMITE_DE_USO",
    "APIConnectionError": "IA_SIN_RESPUESTA",
    "APITimeoutError": "IA_SIN_RESPUESTA",
    "InternalServerError": "IA_SIN_RESPUESTA",
    "APIStatusError": "IA_FALLO_INESPERADO",
    "BadRequestError": "IA_FALLO_INESPERADO",
}


def codigo_de_error_de_openai(excepcion: BaseException) -> str:
    """
    Recorre la jerarquía de clases para que una subclase caiga en su padre.

    El SDK crea subclases nuevas entre versiones (`ContentFilterFinishReason`,
    por ejemplo, hereda de `APIError`): mirar solo el nombre exacto haría que
    cada versión nueva mandara errores conocidos al genérico sin que nadie se
    entere.
    """
    for clase in type(excepcion).__mro__:
        codigo = _CODIGOS_POR_EXCEPCION.get(clase.__name__)
        if codigo is not None:
            return codigo

    return "IA_FALLO_INESPERADO"


def detalle_seguro(excepcion: BaseException) -> str:
    """
    Lo que sirve para depurar un fallo del proveedor, sin nada sensible.

    El tipo de la excepción, el código HTTP y el código de error que manda el
    proveedor (`rate_limit_exceeded`, `request_too_large`,
    `json_validate_failed`…): palabras fijas de un catálogo, nunca el
    mensaje, que en un `AuthenticationError` cita la clave enviada. Sin el
    código del proveedor, un 413 por petición demasiado grande y un 400 por
    JSON inválido llegaban al log como el mismo `IA_FALLO_INESPERADO`, y no
    había forma de saber cuál de los dos era.
    """
    partes = [type(excepcion).__name__]

    estado = getattr(excepcion, "status_code", None)
    if isinstance(estado, int):
        partes.append(str(estado))

    cuerpo = getattr(excepcion, "body", None)
    error = cuerpo.get("error", cuerpo) if isinstance(cuerpo, dict) else None
    if isinstance(error, dict):
        for campo in ("code", "type"):
            valor = error.get(campo)
            if isinstance(valor, str) and valor.replace("_", "").isalnum() and len(valor) <= 60:
                partes.append(valor)

    return ":".join(partes)


def traducir_fallo(excepcion: BaseException) -> ErrorDeBitacora:
    """El detalle nunca lleva el mensaje del proveedor: ver `detalle_seguro`."""
    return ErrorDeBitacora(codigo_de_error_de_openai(excepcion), detalle_seguro(excepcion))


"""
Temperatura 0 en todas las llamadas de este backend.

Ni el análisis de discurso ni el agente ganan algo con variedad: dos corridas
sobre la misma charla deberían producir el mismo catálogo, y la misma pregunta
debería devolver la misma respuesta sobre las mismas fichas. Con temperatura
alta, reprocesar se vuelve una lotería en la que desaparecen fichas que
alguien ya validó, y "el chat me dijo otra cosa ayer" deja de ser un bug
reproducible.
"""
TEMPERATURA_DETERMINISTA = 0.0


def contenido_del_mensaje(respuesta: Any) -> str | None:
    """
    Acepta el objeto tipado del SDK o un dict con la misma forma.

    Las pruebas devuelven dicts: exigir el objeto del SDK obligaría a fabricar
    en cada prueba tres capas de objetos falsos (`choices[0].message.content`)
    solo para leer un campo, y esos objetos falsos envejecen con el SDK sin que
    nadie los mire.
    """
    if isinstance(respuesta, dict):
        opciones = respuesta.get("choices") or []
        if not opciones:
            return None
        mensaje = opciones[0].get("message") or {}
        return mensaje.get("content")

    opciones = getattr(respuesta, "choices", None) or []
    if not opciones:
        return None

    return getattr(getattr(opciones[0], "message", None), "content", None)


def leer_json_del_modelo(contenido: str | None) -> Any:
    """
    Interpreta la respuesta del modelo como JSON, tolerando el cerco de markdown.

    Se pide `response_format={"type": "json_object"}` en todas las llamadas, lo
    que ya garantiza JSON válido en los modelos vigentes; esto es el cinturón
    además del tirante, porque el identificador de modelo es configurable por
    entorno y nada impide apuntar a uno que no soporte el modo JSON. Antes que
    reventar con un `JSONDecodeError` a mitad del pipeline y dejar la
    conferencia colgada en `procesando`, se falla con un código propio.
    """
    import json

    texto = (contenido or "").strip()

    if texto.startswith("```"):
        partes = texto.split("```")
        texto = partes[1] if len(partes) > 1 else texto
        if texto.startswith("json"):
            texto = texto[len("json") :]
        texto = texto.strip()

    if texto == "":
        raise ErrorDeBitacora("IA_RESPUESTA_ILEGIBLE", "respuesta vacia")

    try:
        return json.loads(texto)
    except ValueError as fallo:
        raise ErrorDeBitacora("IA_RESPUESTA_ILEGIBLE", type(fallo).__name__) from fallo


def lista_bajo(datos: Any, clave: str) -> list[Any]:
    """
    El modo JSON de OpenAI devuelve un objeto, nunca un arreglo en la raíz.

    Así que todo lo que este backend pide como lista viene envuelto en una
    clave. Se acepta además la lista pelada por si el modelo la devuelve
    directo: resolver los dos casos aquí evita repetir el mismo `isinstance`
    en cada llamador y que uno de ellos se olvide.
    """
    if isinstance(datos, list):
        return datos

    if isinstance(datos, dict):
        valor = datos.get(clave)
        if isinstance(valor, list):
            return valor

    return []
