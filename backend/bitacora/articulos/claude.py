"""
El cliente de Claude para los artículos.

Va aparte del resto del backend, que habla con OpenAI y Groq por el SDK de
OpenAI con la clave de cada persona: escribir un artículo académico es la
tarea donde la calidad de la prosa se nota, y ahí se usa Claude con una sola
clave de la plataforma (`ANTHROPIC_API_KEY` en el entorno del servidor), no
una por persona.

Sonnet y no Opus por decisión del usuario: cuesta la mitad, y para redactar
sobre un material ya elegido la diferencia de calidad no la justifica.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Mapping, Protocol

from bitacora.compartido.errores import ErrorDeBitacora
from bitacora.compartido.ia import traducir_fallo

registro = logging.getLogger("bitacora.articulos")

MODELO_POR_DEFECTO = "claude-sonnet-5-5"

"""
Holgado a propósito. Un artículo entero con su razonamiento previo cabe de
sobra, y quedarse corto corta el JSON a la mitad: eso no es un artículo más
breve sino uno ilegible. Con este tope hay que ir por streaming, o el SDK
rechaza la petición por el riesgo de que venza el tiempo de espera.
"""
TOKENS_DE_SALIDA = 64000

"""
Si el modelo declina por una de sus categorías de seguridad —un falso
positivo es posible con transcripciones de cualquier tema—, el servidor de
Anthropic reintenta en el modelo que recomienda para esa categoría, dentro
de la misma llamada. Sin esto, un falso positivo sería un artículo fallido.
"""
CABECERA_DE_RESPALDO = "server-side-fallback-2026-07-01"


class PideJson(Protocol):
    def __call__(self, sistema: str, material: str, pedido: str, esquema: Mapping[str, Any]) -> dict[str, Any]: ...


def hay_clave() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY", "").strip())


def modelo_de_articulos() -> str:
    return os.environ.get("BITACORA_MODELO_DE_ARTICULOS", "").strip() or MODELO_POR_DEFECTO


def pedidor_de_claude() -> PideJson:
    """
    Se importa aquí y no arriba: el resto del backend no necesita el SDK de
    Anthropic, y una suite que no toca artículos no debería depender de él.
    """
    import anthropic

    if not hay_clave():
        raise ErrorDeBitacora("ART_SIN_CLAVE")

    cliente = anthropic.Anthropic()
    modelo = modelo_de_articulos()

    def pedir(sistema: str, material: str, pedido: str, esquema: Mapping[str, Any]) -> dict[str, Any]:
        """
        El material va en su propio bloque y con `cache_control`, el pedido
        después. Los tres pasos de un artículo mandan el mismo sistema y el
        mismo material: con el prefijo idéntico, el segundo y el tercero lo
        leen de la caché a una décima parte del precio, en vez de pagar cien
        mil tokens de transcripciones tres veces.
        """
        try:
            with cliente.beta.messages.stream(
                model=modelo,
                max_tokens=TOKENS_DE_SALIDA,
                betas=[CABECERA_DE_RESPALDO],
                fallbacks="default",
                system=sistema,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": material, "cache_control": {"type": "ephemeral"}},
                            {"type": "text", "text": pedido},
                        ],
                    }
                ],
                output_config={
                    "effort": "high",
                    "format": {"type": "json_schema", "schema": dict(esquema)},
                },
            ) as flujo:
                respuesta = flujo.get_final_message()
        except ErrorDeBitacora:
            raise
        except Exception as fallo:  # noqa: BLE001
            raise traducir_fallo(fallo) from fallo

        uso = getattr(respuesta, "usage", None)
        registro.info(
            "claude modelo=%s parada=%s entrada=%s cache_leida=%s cache_escrita=%s salida=%s",
            getattr(respuesta, "model", modelo),
            respuesta.stop_reason,
            getattr(uso, "input_tokens", None),
            getattr(uso, "cache_read_input_tokens", None),
            getattr(uso, "cache_creation_input_tokens", None),
            getattr(uso, "output_tokens", None),
        )

        if respuesta.stop_reason == "refusal":
            raise ErrorDeBitacora("ART_RECHAZADO_POR_EL_MODELO")
        if respuesta.stop_reason == "max_tokens":
            raise ErrorDeBitacora("IA_RESPUESTA_ILEGIBLE", "max_tokens")

        texto = next((bloque.text for bloque in respuesta.content if bloque.type == "text"), None)
        try:
            datos = json.loads(texto or "")
        except ValueError as fallo:
            raise ErrorDeBitacora("IA_RESPUESTA_ILEGIBLE", "json") from fallo

        if not isinstance(datos, dict):
            raise ErrorDeBitacora("IA_RESPUESTA_ILEGIBLE", "no_objeto")
        return datos

    return pedir
