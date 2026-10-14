"""
Endpoints de los artículos: un paso por endpoint, los tres en segundo plano.

El mismo camino que procesar una charla o redactar una memoria: 202, el
trabajo sigue en segundo plano y el avance queda en `producciones.estado`,
que la interfaz consulta. Cada paso lee el modelo sobre todas las
transcripciones elegidas, y eso son minutos: una petición abierta todo ese
tiempo acabaría en un timeout del proxy que se ve como un fallo aunque el
paso haya salido bien.

La fila la crea la interfaz, con la idea y las ponencias, antes de pedir el
primer paso; así la tarjeta existe desde el primer momento y sobrevive a
cerrar el modal o la pestaña.

Los estados, en orden: `buscando` → `eligiendo` → `esquematizando` →
`esquema` → `redactando` → `lista`, y `fallida` desde cualquiera de los que
trabajan.
"""

from __future__ import annotations

import logging
from typing import Any, Callable

from fastapi import APIRouter, BackgroundTasks, status
from pydantic import BaseModel, Field

from bitacora.api.dependencias import Usuario
from bitacora.api.despierto import mientras_trabaja
from bitacora.articulos.claude import PideJson, hay_clave, pedidor_de_claude
from bitacora.articulos.redaccion import esquematizar, proponer_enfoques, redactar
from bitacora.articulos.repositorio import actualizar_produccion, leer_ponencias, leer_produccion, marcar_fallida
from bitacora.compartido.errores import ErrorDeBitacora

router = APIRouter(prefix="/articulos", tags=["articulos"])

registro = logging.getLogger("bitacora.articulos")


class PonenciaPedida(BaseModel):
    id_conferencia: str = Field(min_length=1)
    titulo: str = ""
    ponente: str = ""


class PedidoDeEnfoques(BaseModel):
    ponencias: list[PonenciaPedida] = Field(min_length=1, max_length=200)


class PedidoDeEsquema(BaseModel):
    """La posición del enfoque elegido en la lista que se propuso."""

    enfoque: int = Field(ge=0)


class RespuestaDePaso(BaseModel):
    id: str
    estado: str


def _en_segundo_plano(usuario: Usuario, id_produccion: str, paso: str, trabajo: Callable[[PideJson], None]) -> None:
    """
    Un fallo aquí no puede propagarse —nadie lo espera—: deja la fila en
    `fallida` con el motivo. Lo que nunca hace es dejarla en un estado de
    trabajo, que la interfaz consultaría para siempre.
    """
    with mientras_trabaja():
        try:
            trabajo(pedidor_de_claude())
            registro.info("artículo paso=%s id=%s listo", paso, id_produccion)
        except ErrorDeBitacora as fallo:
            registro.warning("artículo paso=%s id=%s codigo=%s detalle=%s", paso, id_produccion, fallo.codigo, fallo.detalle)
            marcar_fallida(usuario.cliente, id_produccion, fallo.codigo)
        except Exception as fallo:  # noqa: BLE001
            registro.warning("artículo paso=%s id=%s motivo=%s", paso, id_produccion, type(fallo).__name__)
            marcar_fallida(usuario.cliente, id_produccion, "IA_FALLO_INESPERADO")


def _comprobar(usuario: Usuario, id_produccion: str, estados: tuple[str, ...]) -> dict[str, Any]:
    """
    Lo que puede fallar rápido se comprueba antes de aceptar: sin clave en el
    servidor, o con la fila en otro paso, el 202 sería una promesa vacía.
    """
    if not hay_clave():
        raise ErrorDeBitacora("ART_SIN_CLAVE")

    fila = leer_produccion(usuario.cliente, id_produccion)
    if fila.get("estado") not in estados:
        raise ErrorDeBitacora("ART_PASO_NO_DISPONIBLE")
    return fila


@router.post("/{id_produccion}/enfoques", status_code=status.HTTP_202_ACCEPTED, response_model=RespuestaDePaso)
def pedir_enfoques(id_produccion: str, cuerpo: PedidoDeEnfoques, usuario: Usuario, tareas: BackgroundTasks) -> RespuestaDePaso:
    fila = _comprobar(usuario, id_produccion, ("buscando", "eligiendo", "fallida"))

    """
    Las claves P1, P2… se fijan aquí y se guardan con la fila: los pasos
    siguientes tienen que llamar a cada ponencia igual que la llamó el
    modelo cuando propuso los enfoques.
    """
    ponencias = [
        {"clave": f"P{indice + 1}", "id_conferencia": ponencia.id_conferencia, "titulo": ponencia.titulo, "ponente": ponencia.ponente}
        for indice, ponencia in enumerate(cuerpo.ponencias)
    ]
    actualizar_produccion(usuario.cliente, id_produccion, {"estado": "buscando", "ponencias": ponencias, "fallo": ""})

    def trabajo(pedir: PideJson) -> None:
        corpus = leer_ponencias(usuario.cliente, ponencias)
        enfoques = proponer_enfoques(pedir, corpus, str(fila.get("idea") or ""))
        actualizar_produccion(usuario.cliente, id_produccion, {"enfoques": enfoques, "estado": "eligiendo"})

    tareas.add_task(_en_segundo_plano, usuario, id_produccion, "enfoques", trabajo)
    return RespuestaDePaso(id=id_produccion, estado="buscando")


@router.post("/{id_produccion}/esquema", status_code=status.HTTP_202_ACCEPTED, response_model=RespuestaDePaso)
def pedir_esquema(id_produccion: str, cuerpo: PedidoDeEsquema, usuario: Usuario, tareas: BackgroundTasks) -> RespuestaDePaso:
    fila = _comprobar(usuario, id_produccion, ("eligiendo", "esquema", "fallida"))
    enfoques = fila.get("enfoques") or []
    if cuerpo.enfoque >= len(enfoques):
        raise ErrorDeBitacora("ART_PASO_NO_DISPONIBLE")

    enfoque = enfoques[cuerpo.enfoque]
    actualizar_produccion(
        usuario.cliente, id_produccion, {"estado": "esquematizando", "enfoque": enfoque, "tipo": enfoque.get("tipo") or "", "fallo": ""}
    )

    def trabajo(pedir: PideJson) -> None:
        corpus = leer_ponencias(usuario.cliente, fila.get("ponencias") or [])
        titulo, esquema, evidencias = esquematizar(pedir, corpus, str(fila.get("idea") or ""), enfoque)
        actualizar_produccion(
            usuario.cliente,
            id_produccion,
            {"titulo": titulo, "esquema": esquema, "evidencias": evidencias, "secciones": [], "estado": "esquema"},
        )

    tareas.add_task(_en_segundo_plano, usuario, id_produccion, "esquema", trabajo)
    return RespuestaDePaso(id=id_produccion, estado="esquematizando")


@router.post("/{id_produccion}/redactar", status_code=status.HTTP_202_ACCEPTED, response_model=RespuestaDePaso)
def pedir_redaccion(id_produccion: str, usuario: Usuario, tareas: BackgroundTasks) -> RespuestaDePaso:
    fila = _comprobar(usuario, id_produccion, ("esquema", "lista", "fallida"))
    if not fila.get("evidencias") or not fila.get("enfoque"):
        raise ErrorDeBitacora("ART_PASO_NO_DISPONIBLE")

    actualizar_produccion(usuario.cliente, id_produccion, {"estado": "redactando", "fallo": ""})

    def trabajo(pedir: PideJson) -> None:
        corpus = leer_ponencias(usuario.cliente, fila.get("ponencias") or [])
        secciones = redactar(
            pedir,
            corpus,
            str(fila.get("idea") or ""),
            fila.get("enfoque") or {},
            str(fila.get("titulo") or ""),
            fila.get("esquema") or [],
            fila.get("evidencias") or [],
        )
        actualizar_produccion(usuario.cliente, id_produccion, {"secciones": secciones, "estado": "lista"})

    tareas.add_task(_en_segundo_plano, usuario, id_produccion, "redaccion", trabajo)
    return RespuestaDePaso(id=id_produccion, estado="redactando")
