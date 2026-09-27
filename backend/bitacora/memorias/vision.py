"""
Leer el texto de una imagen: la foto o la captura de una diapositiva.

Parte de lo que una memoria necesita —un correo de contacto, un teléfono, el
nombre de una institución— se mostró en una lámina y nunca se dijo en voz
alta. Si esa lámina llega como `.pptx` o `.pdf`, su texto se saca del propio
archivo (`material.py`). Si llega como imagen, no hay texto que sacar: hay
que mirarla.

**Un modelo con visión, y una sola pasada por imagen.** Se le pide que
TRANSCRIBA lo que se ve, no que resuma ni interprete: lo que devuelve entra
después en el mismo recorrido que la transcripción de la charla
(`rastreo.py`), que ya sabe buscar en texto lo que pide cada hueco. Así la
visión hace una sola cosa —convertir imagen en texto— y no hay dos caminos
distintos según de dónde venga el material.

En Groq son los modelos Llama 4 (`BITACORA_MODELOS_GROQ_VISION`); con una
clave de OpenAI, `gpt-4o-mini`. Si el modelo configurado no acepta imágenes,
la lectura falla y se sigue sin ella: la memoria se escribe con el resto del
material en vez de no escribirse.
"""

from __future__ import annotations

import base64
import logging
from typing import Any, Protocol, Sequence

from bitacora.compartido.ia import ClienteDeOpenAI, TEMPERATURA_DETERMINISTA, contenido_del_mensaje, detalle_seguro

registro = logging.getLogger("bitacora.memorias.vision")

EXTENSIONES_DE_IMAGEN = (".png", ".jpg", ".jpeg", ".webp", ".gif")

"""
Tope por imagen. Groq rechaza la petición entera por encima de 20 MB, y el
base64 engorda los bytes un tercio: 12 MB de imagen son unos 16 MB de
petición, que aún entran. La que se pase se salta con un aviso, en vez de
gastar la petición para que la rechacen.
"""
BYTES_MAXIMOS_POR_IMAGEN = 12 * 1024 * 1024

"""Tope de imágenes por memoria: son una llamada cada una, y una charla no tiene cincuenta láminas clave."""
MAXIMO_DE_IMAGENES = 12

INSTRUCCION = """\
Transcribe TODO el texto que aparece en la imagen, tal cual, sin resumir, sin \
ordenar y sin interpretar.

Reglas:

1. Copia los datos exactos: correos, teléfonos, cifras, nombres propios y \
direcciones web, carácter por carácter. Son lo que más importa.
2. Si algo no se lee con seguridad, escríbelo seguido de [ilegible] en vez de \
adivinarlo.
3. Describe en una línea lo que muestre un gráfico o una foto, solo si no \
tiene texto propio.
4. Si la imagen no tiene texto ni nada identificable, responde exactamente \
SIN TEXTO."""

_TIPOS = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
}


def es_imagen(nombre: str) -> bool:
    return nombre.lower().endswith(EXTENSIONES_DE_IMAGEN)


def _tipo_de(nombre: str) -> str:
    minusculas = nombre.lower()

    for extension, tipo in _TIPOS.items():
        if minusculas.endswith(extension):
            return tipo

    return "image/png"


class LectorDeImagenes(Protocol):
    def __call__(self, imagenes: Sequence[tuple[str, bytes]]) -> tuple[str, ...]: ...


def lector_de_imagenes(cliente: ClienteDeOpenAI, modelo: str) -> LectorDeImagenes:
    def leer(imagenes: Sequence[tuple[str, bytes]]) -> tuple[str, ...]:
        textos: list[str] = []

        for nombre, contenido in imagenes[:MAXIMO_DE_IMAGENES]:
            if len(contenido) > BYTES_MAXIMOS_POR_IMAGEN:
                registro.warning("imagen de apoyo demasiado grande bytes=%s", len(contenido))
                continue

            url = f"data:{_tipo_de(nombre)};base64,{base64.b64encode(contenido).decode('ascii')}"

            try:
                respuesta: Any = cliente.chat.completions.create(
                    model=modelo,
                    temperature=TEMPERATURA_DETERMINISTA,
                    messages=[
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": INSTRUCCION},
                                {"type": "image_url", "image_url": {"url": url}},
                            ],
                        }
                    ],
                )
            except Exception as fallo:  # noqa: BLE001
                registro.warning("imagen de apoyo sin leer: %s", detalle_seguro(fallo))
                continue

            texto = (contenido_del_mensaje(respuesta) or "").strip()

            if texto == "" or texto.upper().startswith("SIN TEXTO"):
                continue

            textos.append(f"MATERIAL DE APOYO «{nombre}» (texto leído de la imagen)\n{texto}")

        return tuple(textos)

    return leer
