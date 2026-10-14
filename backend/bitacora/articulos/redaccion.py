"""
Los tres pasos de un artículo: enfoques, esquema con sus evidencias, y
redacción.

Tres llamadas y no una, porque entre ellas decide una persona: qué enfoque
sigue el artículo, y si el esquema con sus citas le sirve antes de pagar la
redacción. Las tres mandan el mismo sistema y el mismo material, así que la
segunda y la tercera leen las transcripciones desde la caché.

Las citas se eligen y se verifican en el esquema, ANTES de redactar. La
redacción solo puede citar evidencias ya comprobadas, por su clave (`{E-3}`),
y el texto de la cita lo pone la interfaz desde la evidencia: el modelo
nunca escribe la cita que se lee entre comillas, así que no puede alterarla.
"""

from __future__ import annotations

import json
import re
from typing import Any, Mapping, Sequence

from bitacora.articulos.claude import PideJson
from bitacora.articulos.corpus import PonenciaDelCorpus, renderizar
from bitacora.articulos.verificacion import verificar
from bitacora.compartido.errores import ErrorDeBitacora

SISTEMA = """\
Eres editor académico. Ayudas a escribir artículos a partir de lo que se \
dijo en un evento: congresos, foros, jornadas. Trabajas SOLO con las \
transcripciones que recibes, una por ponencia, cada una con su clave (P1, \
P2…), su título y su ponente. Las marcas [min N] dicen en qué minuto va la \
charla; no son parte de lo dicho.

Reglas que valen en todos los pasos:

1. Lo que el artículo afirma sobre lo que se dijo tiene que estar en las \
transcripciones. No atribuyas a un ponente nada que no dijo, ni completes \
con cifras, autores o hechos que conozcas por tu cuenta. Un artículo corto y \
cierto vale más que uno largo con relleno.
2. Las transcripciones son habla: repiten, se corrigen y dejan frases a \
medias. Lo que importa es el argumento, no lo bien que suena una frase.
3. Una cita se copia palabra por palabra de la transcripción, sin corregirla, \
resumirla ni unir trozos de partes distintas. Se comprueba después contra la \
transcripción y la que no aparezca tal cual se descarta.
4. Escribe en español, con registro académico."""

TIPOS_DE_ARTICULO = ("Artículo de reflexión", "Artículo de revisión", "Ensayo académico", "Artículo de divulgación")

_ESQUEMA_DE_ENFOQUES = {
    "type": "object",
    "properties": {
        "enfoques": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "titulo": {"type": "string"},
                    "pregunta": {"type": "string"},
                    "tipo": {"type": "string", "enum": list(TIPOS_DE_ARTICULO)},
                    "ponencias": {"type": "array", "items": {"type": "string"}},
                    "evidencias": {"type": "integer"},
                    "respaldo": {"type": "string", "enum": ["solido", "suficiente", "insuficiente"]},
                    "recomendado": {"type": "boolean"},
                    "por_que": {"type": "string"},
                },
                "required": ["titulo", "pregunta", "tipo", "ponencias", "evidencias", "respaldo", "recomendado", "por_que"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["enfoques"],
    "additionalProperties": False,
}

_ESQUEMA_DEL_ESQUEMA = {
    "type": "object",
    "properties": {
        "titulo": {"type": "string"},
        "secciones": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "titulo": {"type": "string"},
                    "proposito": {"type": "string"},
                    "evidencias": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {"ponencia": {"type": "string"}, "cita": {"type": "string"}},
                            "required": ["ponencia", "cita"],
                            "additionalProperties": False,
                        },
                    },
                },
                "required": ["titulo", "proposito", "evidencias"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["titulo", "secciones"],
    "additionalProperties": False,
}

_ESQUEMA_DE_LA_REDACCION = {
    "type": "object",
    "properties": {
        "secciones": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"titulo": {"type": "string"}, "texto": {"type": "string"}},
                "required": ["titulo", "texto"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["secciones"],
    "additionalProperties": False,
}

_CLAVE_DE_EVIDENCIA = re.compile(r"\{(E-\d+)\}")


def _texto(valor: Any) -> str:
    return valor.strip() if isinstance(valor, str) else ""


def _lista_de_objetos(valor: Any) -> list[dict[str, Any]]:
    return [elemento for elemento in valor if isinstance(elemento, dict)] if isinstance(valor, list) else []


def proponer_enfoques(pedir: PideJson, ponencias: Sequence[PonenciaDelCorpus], idea: str) -> list[dict[str, Any]]:
    pedido = f"""\
PASO 1 DE 3 · ENFOQUES

La idea de quien escribe, tal como la dio:
«{idea}»

Propón entre 3 y 4 enfoques posibles para un artículo que desarrolle esa \
idea con este material. Para cada uno:

- `titulo`: el enfoque en una línea, no el título final del artículo.
- `pregunta`: la pregunta que el artículo respondería.
- `tipo`: el tipo de artículo que el material permite.
- `ponencias`: las claves (P1, P2…) de las ponencias que de verdad lo sostienen.
- `evidencias`: cuántos fragmentos citables lo respaldan, contados en las \
transcripciones, no estimados a ojo.
- `respaldo`: `solido` si el material alcanza con holgura, `suficiente` si \
alcanza justo, `insuficiente` si el artículo tendría que rellenar con lo que \
no se dijo.
- `recomendado`: verdadero en uno solo, el que mejor equilibra la idea y el material.
- `por_que`: en una o dos frases, por qué este enfoque y qué lo limita.

Si la idea no encaja con lo que se dijo, dilo en los enfoques: propón lo más \
cercano que sí se pueda escribir y márcalo con su respaldo real."""

    datos = pedir(SISTEMA, renderizar(ponencias), pedido, _ESQUEMA_DE_ENFOQUES)
    ponente_de = {ponencia.clave: ponencia.ponente for ponencia in ponencias}
    enfoques: list[dict[str, Any]] = []

    for crudo in _lista_de_objetos(datos.get("enfoques")):
        claves = [clave for clave in dict.fromkeys(_texto(clave) for clave in crudo.get("ponencias") or []) if clave in ponente_de]
        evidencias = crudo.get("evidencias")
        evidencias = max(int(evidencias), 0) if isinstance(evidencias, (int, float)) else 0
        respaldo = crudo.get("respaldo") if crudo.get("respaldo") in ("solido", "suficiente", "insuficiente") else "suficiente"

        """
        Con menos de tres citas no hay artículo, diga lo que diga el modelo:
        el respaldo que se enseña tiene que ser el que impide avanzar, no
        uno más optimista que el esquema después no pueda cumplir.
        """
        if evidencias < 3 or not claves:
            respaldo = "insuficiente"

        enfoques.append(
            {
                "titulo": _texto(crudo.get("titulo")),
                "pregunta": _texto(crudo.get("pregunta")),
                "tipo": _texto(crudo.get("tipo")) or TIPOS_DE_ARTICULO[0],
                "ponencias": claves,
                "ponentes": len({ponente_de[clave] for clave in claves}),
                "evidencias": evidencias,
                "respaldo": respaldo,
                "recomendado": crudo.get("recomendado") is True,
                "por_que": _texto(crudo.get("por_que")),
            }
        )

    enfoques = [enfoque for enfoque in enfoques if enfoque["titulo"]]
    if not enfoques:
        raise ErrorDeBitacora("IA_RESPUESTA_ILEGIBLE", "sin_enfoques")

    """Exactamente uno recomendado, y nunca uno que no se puede elegir."""
    viables = [enfoque for enfoque in enfoques if enfoque["respaldo"] != "insuficiente"]
    elegido = next((enfoque for enfoque in viables if enfoque["recomendado"]), None) or max(
        viables, key=lambda enfoque: enfoque["evidencias"], default=None
    )
    for enfoque in enfoques:
        enfoque["recomendado"] = enfoque is elegido

    return enfoques


def esquematizar(
    pedir: PideJson, ponencias: Sequence[PonenciaDelCorpus], idea: str, enfoque: Mapping[str, Any]
) -> tuple[str, list[dict[str, Any]], list[dict[str, Any]]]:
    """
    Devuelve el título, el esquema (cada sección con las claves de sus
    evidencias) y las evidencias ya verificadas, con su minuto.
    """
    pedido = f"""\
PASO 2 DE 3 · ESQUEMA Y EVIDENCIAS

La idea de quien escribe:
«{idea}»

El enfoque que eligió:
{json.dumps(dict(enfoque), ensure_ascii=False)}

Arma el esquema del artículo:

- `titulo`: el título del artículo.
- `secciones`: entre 4 y 7, en orden, empezando por una introducción y \
terminando en unas conclusiones. No incluyas el resumen: va aparte.
- En cada sección, `proposito`: qué argumenta, en una frase.
- En cada sección, `evidencias`: las citas que la sostienen, entre 0 y 4. \
La introducción y las conclusiones pueden no tener ninguna. Cada una con la \
clave de su `ponencia` y la `cita` copiada palabra por palabra, de entre 12 y \
60 palabras: lo bastante para que se sostenga leída sola, sin cortar una \
idea a la mitad.

Entre todas las secciones, entre 6 y 18 citas, de tantas ponencias como el \
enfoque permita, sin repetir la misma cita en dos secciones."""

    datos = pedir(SISTEMA, renderizar(ponencias), pedido, _ESQUEMA_DEL_ESQUEMA)
    por_clave = {ponencia.clave: ponencia for ponencia in ponencias}
    evidencias: list[dict[str, Any]] = []
    vistas: set[tuple[str, int]] = set()
    esquema: list[dict[str, Any]] = []

    for seccion in _lista_de_objetos(datos.get("secciones")):
        claves: list[str] = []

        for propuesta in _lista_de_objetos(seccion.get("evidencias")):
            ponencia = por_clave.get(_texto(propuesta.get("ponencia")))
            cita = verificar(_texto(propuesta.get("cita")), ponencia.segmentos) if ponencia else None

            """
            Si no está en la transcripción de la ponencia que dijo, se busca en
            las demás antes de descartarla: confundir la clave es un error
            frecuente y no cambia que la frase se dijo.
            """
            if cita is None:
                for otra in ponencias:
                    cita = verificar(_texto(propuesta.get("cita")), otra.segmentos)
                    if cita is not None:
                        ponencia = otra
                        break

            if cita is None or ponencia is None or (ponencia.clave, cita.segundo) in vistas:
                continue

            vistas.add((ponencia.clave, cita.segundo))
            clave = f"E-{len(evidencias) + 1}"
            evidencias.append(
                {
                    "clave": clave,
                    "id_conferencia": ponencia.id_conferencia,
                    "ponente": ponencia.ponente,
                    "segundo": cita.segundo,
                    "texto": cita.texto,
                    "verificada": True,
                }
            )
            claves.append(clave)

        titulo = _texto(seccion.get("titulo"))
        if titulo:
            esquema.append({"titulo": titulo, "proposito": _texto(seccion.get("proposito")), "evidencias": claves})

    if not evidencias:
        raise ErrorDeBitacora("ART_SIN_EVIDENCIAS")

    return _texto(datos.get("titulo")) or _texto(enfoque.get("titulo")), esquema, evidencias


def redactar(
    pedir: PideJson,
    ponencias: Sequence[PonenciaDelCorpus],
    idea: str,
    enfoque: Mapping[str, Any],
    titulo: str,
    esquema: Sequence[Mapping[str, Any]],
    evidencias: Sequence[Mapping[str, Any]],
) -> list[dict[str, str]]:
    pedido = f"""\
PASO 3 DE 3 · REDACCIÓN

La idea de quien escribe:
«{idea}»

El enfoque:
{json.dumps(dict(enfoque), ensure_ascii=False)}

El título: «{titulo}»

El esquema, sección por sección, con las claves de sus evidencias:
{json.dumps([dict(seccion) for seccion in esquema], ensure_ascii=False)}

Las evidencias, ya verificadas contra la transcripción:
{json.dumps([{"clave": evidencia["clave"], "ponente": evidencia["ponente"], "cita": evidencia["texto"]} for evidencia in evidencias], ensure_ascii=False)}

Redacta el artículo completo:

- La primera sección se titula «Resumen»: un párrafo de 120 a 200 palabras, sin citas.
- Después, una sección por cada una del esquema, con su mismo título y en \
el mismo orden. Entre 2 y 5 párrafos cada una, separados por una línea en \
blanco.
- Para citar escribe SOLO la clave entre llaves, por ejemplo {{E-3}}, en el \
punto de la frase donde va la cita. El texto de la cita y su referencia se \
ponen solos: no copies la cita, no la pongas entre comillas y no añadas el \
minuto. Sí nombra al ponente en tu frase cuando la introduzcas («como \
planteó Ana Rojas, {{E-3}}, …»).
- Usa cada evidencia de su sección; cada clave, una sola vez.
- Entre cita y cita, el argumento es tuyo: relaciona lo que dijeron, \
contrástalo y saca consecuencias. Pero no atribuyas a nadie lo que no dijo, \
ni añadas referencias bibliográficas, autores o datos de fuera del evento."""

    datos = pedir(SISTEMA, renderizar(ponencias), pedido, _ESQUEMA_DE_LA_REDACCION)
    conocidas = {evidencia["clave"] for evidencia in evidencias}
    secciones: list[dict[str, str]] = []

    for seccion in _lista_de_objetos(datos.get("secciones")):
        texto = _CLAVE_DE_EVIDENCIA.sub(lambda marca: marca.group(0) if marca.group(1) in conocidas else "", _texto(seccion.get("texto")))
        titulo_de_seccion = _texto(seccion.get("titulo"))
        if titulo_de_seccion and texto:
            secciones.append({"titulo": titulo_de_seccion, "texto": texto})

    if not secciones:
        raise ErrorDeBitacora("IA_RESPUESTA_ILEGIBLE", "sin_secciones")

    return secciones
