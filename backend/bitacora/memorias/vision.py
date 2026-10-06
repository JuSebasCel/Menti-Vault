"""
Leer una imagen: la foto o la captura de una diapositiva.

Parte de lo que una memoria necesita —un correo de contacto, un teléfono, el
nombre de una institución, la tendencia que enseñaba un gráfico— se mostró en
una lámina y nunca se dijo en voz alta. Si esa lámina llega como `.pptx` o
`.pdf`, su texto se saca del propio archivo (`material.py`). Si llega como
imagen, no hay texto que sacar: hay que mirarla.

**Dos bloques en una sola pasada: lo literal y la lectura.** La primera
versión solo pedía TRANSCRIBIR, y por una razón que sigue en pie: lo que la
visión devuelve entra en el mismo recorrido que la transcripción de la charla
(`rastreo.py`), que busca en texto el dato que pide cada hueco, y un resumen
en lugar del original pierde justo lo que ese recorrido necesita —el correo
exacto, la cifra, el apellido bien escrito—. Pero transcribir solo no bastaba
con una lámina cuyo contenido no es texto: un gráfico de barras rotulado con
años y porcentajes se transcribía como una lista de números sin lo que esos
números dicen, y la memoria no podía contar la diapositiva porque nadie la
había leído.

Así que se piden las dos cosas, rotuladas y en este orden: `TEXTO`, lo que
está escrito, carácter por carácter; y `LECTURA`, qué muestra la lámina y qué
afirma. El orden importa: el dato duro va primero porque es el que el rastreo
copia tal cual, y la lectura va detrás porque es interpretación y tiene que
poder distinguirse de lo que consta. Separar los bloques es lo que permite
interpretar sin arriesgar que una cifra acabe redondeada dentro de una frase.

La LECTURA explica lo que hay en la imagen y nada más: no añade contexto de
fuera ni estima lo que no esté escrito. Un modelo al que se le pide
«interpreta esta diapositiva» sin ese límite rellena los huecos con lo que
suele haber en una diapositiva parecida.

En Groq, `qwen/qwen3.8-27b` (`BITACORA_MODELOS_GROQ_VISION`); con una clave de
OpenAI, `gpt-4o-mini`. Si el modelo configurado no acepta imágenes, la lectura
falla y se sigue sin ella: la memoria se escribe con el resto del material en
vez de no escribirse.
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
Mira la imagen —casi siempre una diapositiva de una charla— y devuélvela en \
dos bloques, en este orden y con estos rótulos exactos:

TEXTO
Todo el texto que aparece, copiado tal cual, sin resumir y sin reordenar.

LECTURA
Qué muestra la lámina y qué dice, en dos a cinco frases.

Reglas:

1. En TEXTO, los datos exactos van carácter por carácter: correos, teléfonos, \
cifras, porcentajes, años, nombres propios y direcciones web. Son lo que más \
importa de toda la respuesta.
2. Lo que no se lea con seguridad va seguido de [ilegible]. Nunca lo adivines \
ni lo completes.
3. En LECTURA explica lo que la lámina afirma: qué dice un gráfico o una \
tabla (la tendencia, la comparación, el valor que destaca y en qué unidades), \
qué relación hay entre sus partes (un flujo, unas fases, una jerarquía, un \
antes y un después) y qué se ve en una foto o un esquema sin rótulos.
4. La LECTURA habla SOLO de lo que está en la imagen. No añadas contexto que \
no esté ahí, no estimes cifras que no estén escritas y no supongas de qué \
charla es ni qué dijo el ponente.
5. Si algo queda dudoso, dilo en la LECTURA en vez de resolverlo por tu \
cuenta: "la etiqueta del eje no se lee".
6. Si la imagen no tiene nada escrito, deja TEXTO vacío y escribe solo la \
LECTURA.
7. Si no hay nada identificable, responde exactamente SIN TEXTO."""

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

            textos.append(f"MATERIAL DE APOYO «{nombre}» (imagen leída por un modelo con visión)\n{texto}")

        return tuple(textos)

    return leer
