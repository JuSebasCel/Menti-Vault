"""
El material de un artículo: las transcripciones de las ponencias que entran,
con una clave corta cada una (P1, P2…) para que el modelo diga de cuál sale
cada cita.

Va la transcripción entera, no las fichas. Las fichas eran lo citable visto
charla por charla; un artículo cruza ponencias, y lo que lo sostiene suele
ser justo lo que en una sola charla no parecía citable.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Sequence

from bitacora.compartido.errores import ErrorDeBitacora
from bitacora.conferencias.tipos import Segmento

"""
Unos 600 000 tokens. Sonnet admite un millón, pero un evento que pasa de esto
cuesta varios dólares por paso, y quien lo pide debería elegir menos
ponencias antes que descubrirlo en la factura.
"""
CARACTERES_COMO_MAXIMO = 2_400_000

"""
Una marca de minuto cada vez que cambia: orienta al modelo dentro de una
charla larga sin pagar una marca por cada segmento de Whisper, que serían
cientos por ponencia.
"""
_MARCA_DE_MINUTO = re.compile(r"\[min \d+\]")


@dataclass(frozen=True)
class PonenciaDelCorpus:
    clave: str
    id_conferencia: str
    titulo: str
    ponente: str
    segmentos: tuple[Segmento, ...]


def renderizar(ponencias: Sequence[PonenciaDelCorpus]) -> str:
    bloques: list[str] = []

    for ponencia in ponencias:
        partes: list[str] = [f"### {ponencia.clave} · «{ponencia.titulo}» — {ponencia.ponente}\n"]
        minuto_anterior = -1

        for segmento in ponencia.segmentos:
            minuto = segmento.inicio // 60
            if minuto != minuto_anterior:
                partes.append(f" [min {minuto}] ")
                minuto_anterior = minuto
            partes.append(segmento.texto.strip() + " ")

        bloques.append("".join(partes).strip())

    material = "\n\n".join(bloques)

    if len(material) > CARACTERES_COMO_MAXIMO:
        raise ErrorDeBitacora("ART_MATERIAL_DEMASIADO_GRANDE")

    return "TRANSCRIPCIONES DEL EVENTO\n\n" + material


def sin_marcas(texto: str) -> str:
    """El modelo a veces copia la marca de minuto dentro de una cita: no es parte de lo dicho."""
    return _MARCA_DE_MINUTO.sub(" ", texto)
