"""
Lo que un artículo lee y dónde deja cada paso.

Con el cliente de la persona que pide, como el resto del backend: RLS decide
qué producciones y qué transcripciones son suyas.
"""

from __future__ import annotations

import logging
from typing import Any, Mapping, Sequence

from bitacora.articulos.corpus import PonenciaDelCorpus
from bitacora.compartido.datos import ClienteSupabase, traducir_fallo_de_datos
from bitacora.compartido.errores import ErrorDeBitacora, mensaje_de_error
from bitacora.conferencias.repositorio import RepositorioSupabase
from bitacora.transcripcion.lectura import texto_de_archivo
from bitacora.transcripcion.segmentos import segmentos_desde_transcripcion

registro = logging.getLogger("bitacora.articulos.repositorio")


def leer_produccion(cliente: ClienteSupabase, id_produccion: str) -> dict[str, Any]:
    try:
        respuesta = cliente.table("producciones").select("*").eq("id", id_produccion).limit(1).execute()
    except Exception as fallo:  # noqa: BLE001
        raise traducir_fallo_de_datos(fallo) from fallo

    filas: list[dict[str, Any]] = getattr(respuesta, "data", None) or []
    if not filas:
        raise ErrorDeBitacora("ART_NO_ENCONTRADO")
    return filas[0]


def actualizar_produccion(cliente: ClienteSupabase, id_produccion: str, cambios: Mapping[str, Any]) -> None:
    """
    El resultado de un paso y su estado, en una sola escritura: una fila que
    dijera `eligiendo` sin sus enfoques se abriría vacía.
    """
    try:
        cliente.table("producciones").update(dict(cambios)).eq("id", id_produccion).execute()
    except Exception as fallo:  # noqa: BLE001
        raise traducir_fallo_de_datos(fallo) from fallo


def marcar_fallida(cliente: ClienteSupabase, id_produccion: str, codigo: str) -> None:
    """
    Se guarda el mensaje ya redactado, no el código: la interfaz lo enseña
    tal cual, y así no necesita conocer los códigos nuevos del backend.

    Corre en el manejo de un fallo, así que no vuelve a lanzar.
    """
    try:
        cliente.table("producciones").update({"estado": "fallida", "fallo": mensaje_de_error(codigo)}).eq(
            "id", id_produccion
        ).execute()
    except Exception:  # noqa: BLE001
        registro.warning("no se pudo marcar la producción como fallida id=%s", id_produccion)


def leer_ponencias(cliente: ClienteSupabase, ponencias: Sequence[Mapping[str, Any]]) -> tuple[PonenciaDelCorpus, ...]:
    """
    La transcripción de cada ponencia elegida. Una que no se pueda leer se
    salta en vez de tumbar el artículo; si no queda ninguna, sí es un error.
    """
    repositorio = RepositorioSupabase(cliente)
    leidas: list[PonenciaDelCorpus] = []

    for ponencia in ponencias:
        id_conferencia = str(ponencia.get("id_conferencia") or "")
        try:
            conferencia = repositorio.obtener_conferencia(id_conferencia)
            segmentos = repositorio.leer_transcripcion_guardada(conferencia)
            if segmentos is None and conferencia.fuente == "transcripcion":
                nombre, contenido = repositorio.descargar_fuente(conferencia)
                segmentos = segmentos_desde_transcripcion(
                    texto_de_archivo(nombre, contenido), conferencia.duracion_en_segundos
                )
        except Exception:  # noqa: BLE001
            registro.warning("ponencia sin transcripción legible id=%s", id_conferencia)
            continue

        if segmentos:
            leidas.append(
                PonenciaDelCorpus(
                    clave=str(ponencia.get("clave") or f"P{len(leidas) + 1}"),
                    id_conferencia=id_conferencia,
                    titulo=str(ponencia.get("titulo") or conferencia.titulo),
                    ponente=str(ponencia.get("ponente") or conferencia.ponente),
                    segmentos=tuple(segmentos),
                )
            )

    if not leidas:
        raise ErrorDeBitacora("ART_SIN_PONENCIAS")
    return tuple(leidas)
