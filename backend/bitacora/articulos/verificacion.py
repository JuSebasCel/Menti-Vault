"""
Comprobar que una cita está, palabra por palabra, en la transcripción.

Es lo que separa estos artículos de pedirle uno a un modelo a secas: el
modelo propone la cita, pero la que entra al artículo es la que se encontró
en la transcripción, con su minuto. Una cita que no aparece no se usa.

Se compara sin tildes, mayúsculas ni puntuación. Whisper puntúa a su
criterio y el modelo a veces "corrige" una coma o una tilde; eso no cambia
lo que se dijo, y exigirlo tiraría citas buenas.

Si no aparece tal cual, se busca el tramo más parecido y, si se parece lo
bastante, se usa EL TRAMO DE LA TRANSCRIPCIÓN, no la versión del modelo. Así
una palabra cambiada o un "eh" que el modelo quitó no tumban la cita, y aun
así lo que se lee entre comillas es exactamente lo que dice la grabación.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Sequence

from bitacora.articulos.corpus import sin_marcas
from bitacora.conferencias.tipos import Segmento

"""
Por debajo de esto ya no es la misma frase con una palabra distinta, sino
otra frase. Medido a ojo sobre citas reales: los casos buenos que fallan la
coincidencia exacta rondan 0,9; los que son otra cosa, menos de 0,7.
"""
PARECIDO_MINIMO = 0.85

"""Una cita de menos de esto no sostiene nada: es una muletilla."""
PALABRAS_MINIMAS = 6


@dataclass(frozen=True)
class CitaVerificada:
    texto: str
    """El segundo donde empieza, para escucharla en la grabación."""
    segundo: int


def _normal(palabra: str) -> str:
    sin_tildes = unicodedata.normalize("NFD", palabra)
    sin_tildes = "".join(letra for letra in sin_tildes if unicodedata.category(letra) != "Mn")
    return re.sub(r"[^\w]", "", sin_tildes.lower())


def _palabras(segmentos: Sequence[Segmento]) -> tuple[list[str], list[str], list[int]]:
    """
    Las palabras de la transcripción en tres listas paralelas: tal cual, normalizadas
    y el segundo de su segmento. La tal cual es la que se devuelve como cita.
    """
    originales: list[str] = []
    normales: list[str] = []
    segundos: list[int] = []

    for segmento in segmentos:
        for palabra in segmento.texto.split():
            normal = _normal(palabra)
            if normal:
                originales.append(palabra)
                normales.append(normal)
                segundos.append(segmento.inicio)

    return originales, normales, segundos


def verificar(cita: str, segmentos: Sequence[Segmento]) -> CitaVerificada | None:
    buscada = [normal for normal in (_normal(palabra) for palabra in sin_marcas(cita).split()) if normal]

    if len(buscada) < PALABRAS_MINIMAS or not segmentos:
        return None

    originales, normales, segundos = _palabras(segmentos)
    largo = len(buscada)

    def tramo(inicio: int, fin: int) -> CitaVerificada:
        return CitaVerificada(texto=" ".join(originales[inicio:fin]).strip(" ,;:"), segundo=segundos[inicio])

    for inicio in range(len(normales) - largo + 1):
        if normales[inicio] == buscada[0] and normales[inicio : inicio + largo] == buscada:
            return tramo(inicio, inicio + largo)

    """
    Sin coincidencia exacta: se prueba cada ventana que empiece en una de las
    tres primeras palabras de la cita (el modelo suele respetar el arranque y
    tocar el medio), con el largo de la cita y un margen de dos palabras.
    """
    arranques = set(buscada[:3])
    comparador = SequenceMatcher(None, autojunk=False)
    comparador.set_seq2(" ".join(buscada))
    mejor: tuple[float, int, int] = (0.0, 0, 0)

    for inicio, palabra in enumerate(normales):
        if palabra not in arranques:
            continue
        for largo_de_ventana in (largo - 2, largo - 1, largo, largo + 1, largo + 2):
            fin = inicio + largo_de_ventana
            if largo_de_ventana < PALABRAS_MINIMAS or fin > len(normales):
                continue
            comparador.set_seq1(" ".join(normales[inicio:fin]))
            # Las dos cotas baratas descartan casi todas las ventanas antes del cálculo caro:
            # un "que" o un "la" de arranque aparecen miles de veces en una charla.
            if comparador.real_quick_ratio() < PARECIDO_MINIMO or comparador.quick_ratio() < PARECIDO_MINIMO:
                continue
            parecido = comparador.ratio()
            if parecido > mejor[0]:
                mejor = (parecido, inicio, fin)

    parecido, inicio, fin = mejor
    return tramo(inicio, fin) if parecido >= PARECIDO_MINIMO else None
