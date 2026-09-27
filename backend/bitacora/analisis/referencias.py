"""
Las fuentes que la charla citó: lo que el ponente nombró en voz alta y lo que
apareció escrito en sus diapositivas.

No son fichas. Una ficha es una idea citable DE la charla; una referencia es
algo que la charla cita A SU VEZ —un artículo, un libro, un informe— y que
quien escriba sobre la conferencia va a necesitar en su bibliografía.

**Por defecto solo lo que consta.** Un modelo al que se le pide bibliografía
la inventa con una facilidad alarmante: completa el año que falta, arregla el
título y se saca de la manga un DOI. Por eso cada referencia viaja con su
`evidencia` —el trozo donde aparece— y con su `origen`, y la inferencia
(deducir la fuente exacta a partir de una mención vaga: "el estudio de
Stanford del año pasado") está APAGADA salvo que la persona la encienda en
sus preferencias. Encendida, lo inferido se marca como tal y no se mezcla con
lo que se dijo.

El recorrido es el mismo del rastreo de memorias: tramos de transcripción y
material de apoyo, una llamada por tramo, sin dejar nada fuera.
"""

from __future__ import annotations

import json
import logging
import re
import unicodedata
from dataclasses import dataclass
from typing import Any, Protocol, Sequence

from bitacora.compartido.ia import (
    ClienteDeOpenAI,
    TEMPERATURA_DETERMINISTA,
    contenido_del_mensaje,
    detalle_seguro,
    leer_json_del_modelo,
    lista_bajo,
)

registro = logging.getLogger("bitacora.analisis.referencias")

ORIGENES = ("dicha", "diapositiva", "inferida")

"""Tope de tramos que se recorren, igual que en el rastreo: una charla muy larga no se vuelve eterna."""
MAXIMO_DE_TRAMOS = 30


@dataclass(frozen=True)
class Referencia:
    """Cómo se escribiría en una bibliografía, ya formateada en APA por el modelo."""

    cita: str
    autores: str = ""
    anio: str = ""
    titulo: str = ""
    fuente: str = ""
    """`dicha` (el ponente la nombró), `diapositiva` (estaba escrita) o `inferida`."""
    origen: str = "dicha"
    """El trozo donde aparece, para poder comprobarla sin volver a la grabación."""
    evidencia: str = ""


INSTRUCCION_BASE = """\
Recibes un tramo de una charla: su transcripción, o el texto de una de sus \
diapositivas.

Tu trabajo es RECOGER las fuentes que la charla cita: artículos, libros, \
informes, normas, bases de datos o autores con año. No las ideas de la \
charla, sino lo que la charla cita a su vez.

Reglas:

1. Solo lo que aparece en el tramo. No completes de memoria el año, el \
título, la revista ni el DOI de una fuente que reconozcas: si el tramo no lo \
dice, se queda sin ese dato.
2. `evidencia` es el trozo del tramo donde aparece la fuente, copiado tal \
cual. Sin evidencia no hay referencia.
3. `origen` es `diapositiva` si el tramo venía de un material de apoyo, y \
`dicha` si venía de la transcripción.
4. `cita` es la referencia escrita en APA 7 con lo que se sepa. Lo que falte \
se omite, no se inventa: "Pérez, J. (2019). Título." es una cita válida sin \
editorial.
5. Una mención vaga sin datos —"un estudio reciente", "la literatura"— NO es \
una referencia. Descártala.
6. Si el tramo no cita ninguna fuente, devuelve una lista vacía. Es la \
respuesta normal en la mayoría de los tramos.

Devuelves un objeto JSON con una única clave `referencias`, cuyo valor es una \
lista de objetos {"cita": "...", "autores": "...", "anio": "...", \
"titulo": "...", "fuente": "...", "evidencia": "..."}."""

AGREGADO_DE_INFERENCIA = """

7. Excepción a la regla 1, porque esta persona lo pidió: cuando la mención \
sea reconocible pero incompleta ("el experimento de Milgram", "el informe del \
IPCC del año pasado"), puedes proponer la fuente que con más probabilidad es, \
marcándola con `"origen": "inferida"` y dejando en `evidencia` lo que se dijo. \
No infieras DOI ni números de página nunca, y si dudas entre dos fuentes, no \
propongas ninguna."""


class BuscadorDeReferencias(Protocol):
    def __call__(self, tramos: Sequence[str], permitir_inferencia: bool = False) -> tuple[Referencia, ...]: ...


def _texto(valor: Any) -> str:
    return valor.strip() if isinstance(valor, str) else ""


def _clave(referencia: Referencia) -> str:
    """
    Dos referencias son la misma si su cita coincide sin acentos, sin
    puntuación y sin mayúsculas: el modelo la escribe distinta en cada tramo
    ("Pérez 2019" y "Pérez, J. (2019)") y son la misma fuente.
    """
    sin_acentos = unicodedata.normalize("NFKD", referencia.cita.casefold())
    return re.sub(r"[^a-z0-9]+", "", sin_acentos.encode("ascii", "ignore").decode("ascii"))


def buscador_de_referencias(cliente: ClienteDeOpenAI, modelo: str) -> BuscadorDeReferencias:
    def buscar(tramos: Sequence[str], permitir_inferencia: bool = False) -> tuple[Referencia, ...]:
        instruccion = INSTRUCCION_BASE + (AGREGADO_DE_INFERENCIA if permitir_inferencia else "")
        encontradas: dict[str, Referencia] = {}

        for numero, tramo in enumerate(tramos[:MAXIMO_DE_TRAMOS], start=1):
            try:
                respuesta: Any = cliente.chat.completions.create(
                    model=modelo,
                    temperature=TEMPERATURA_DETERMINISTA,
                    response_format={"type": "json_object"},
                    messages=[
                        {"role": "system", "content": instruccion},
                        {"role": "user", "content": json.dumps({"tramo": tramo}, ensure_ascii=False)},
                    ],
                )
            except Exception as fallo:  # noqa: BLE001
                """Un tramo que falla no tumba la búsqueda: se sigue con el siguiente."""
                registro.warning("tramo %s sin referencias: %s", numero, detalle_seguro(fallo))
                continue

            crudas = lista_bajo(leer_json_del_modelo(contenido_del_mensaje(respuesta)), "referencias")

            for cruda in crudas:
                if not isinstance(cruda, dict):
                    continue

                cita = _texto(cruda.get("cita"))
                evidencia = _texto(cruda.get("evidencia"))

                """
                Sin cita o sin evidencia no entra: la evidencia es lo que
                separa una fuente que la charla nombró de una que el modelo
                recordó por su cuenta.
                """
                if cita == "" or evidencia == "":
                    continue

                origen = _texto(cruda.get("origen")) or ("diapositiva" if tramo.startswith("MATERIAL DE APOYO") else "dicha")

                if origen not in ORIGENES or (origen == "inferida" and not permitir_inferencia):
                    origen = "diapositiva" if tramo.startswith("MATERIAL DE APOYO") else "dicha"

                referencia = Referencia(
                    cita=cita,
                    autores=_texto(cruda.get("autores")),
                    anio=_texto(cruda.get("anio")),
                    titulo=_texto(cruda.get("titulo")),
                    fuente=_texto(cruda.get("fuente")),
                    origen=origen,
                    evidencia=evidencia[:400],
                )

                encontradas.setdefault(_clave(referencia), referencia)

        return tuple(encontradas.values())

    return buscar
