"""
Endpoint de referencias: qué fuentes citó una charla.

Va aparte del análisis y no dentro de él, a propósito. El análisis se paga
una vez por conferencia y no todas las charlas necesitan bibliografía;
además, quien la quiere suele quererla DESPUÉS de leer las fichas, y para
entonces el análisis ya pasó. Aquí se pide cuando hace falta, sobre el mismo
material: la transcripción guardada y las diapositivas de apoyo, imágenes
incluidas.

Responde en línea, como redactar una memoria: son varias llamadas cortas
—una por tramo, y se corta al llegar al tope— y no los minutos que tarda
transcribir un audio.
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from bitacora.analisis.chunking import CARACTERES_POR_VENTANA
from bitacora.api.dependencias import (
    Usuario,
    buscador_de_referencias_para,
    cliente_para,
    lector_de_imagenes_para,
    repositorio_de_conferencias,
)
from bitacora.api.procesamiento import CARACTERES_POR_VENTANA_EN_GROQ
from bitacora.compartido.errores import ErrorDeBitacora
from bitacora.compartido.ia import es_de_groq
from bitacora.memorias.repositorio import leer_imagenes_de_apoyo, leer_tramos_de_la_transcripcion

router = APIRouter(prefix="/conferencias", tags=["referencias"])


class PedidoDeReferencias(BaseModel):
    """
    Si se permite proponer fuentes a partir de menciones incompletas. Apagado
    por defecto: un modelo al que se le pide bibliografía la completa de
    memoria, y una referencia inventada en un documento académico es de los
    errores más caros que puede cometer esta app.
    """

    permitir_inferencia: bool = Field(default=False)


class ReferenciaLeida(BaseModel):
    cita: str
    autores: str = ""
    anio: str = ""
    titulo: str = ""
    fuente: str = ""
    origen: str = "dicha"
    evidencia: str = ""


class RespuestaDeReferencias(BaseModel):
    referencias: list[ReferenciaLeida]


@router.post("/{id_conferencia}/referencias", response_model=RespuestaDeReferencias)
async def buscar_referencias(
    id_conferencia: str, cuerpo: PedidoDeReferencias, usuario: Usuario
) -> RespuestaDeReferencias:
    clave = usuario.clave_de_openai("fichas")
    cliente = cliente_para(usuario, clave, "fichas")

    def trabajo() -> tuple[ReferenciaLeida, ...]:
        tramos = leer_tramos_de_la_transcripcion(
            usuario.cliente,
            id_conferencia,
            CARACTERES_POR_VENTANA_EN_GROQ if es_de_groq(clave) else CARACTERES_POR_VENTANA,
        )

        """
        Las diapositivas que son imágenes se leen antes: una bibliografía
        suele estar escrita en la última lámina y no dictada en voz alta.
        """
        imagenes = leer_imagenes_de_apoyo(usuario.cliente, id_conferencia)
        leidas = lector_de_imagenes_para(usuario, clave)(imagenes) if imagenes else ()

        if not leidas and not tramos:
            raise ErrorDeBitacora("REF_SIN_MATERIAL")

        encontradas = buscador_de_referencias_para(usuario, cliente)(
            (*leidas, *tramos), permitir_inferencia=cuerpo.permitir_inferencia
        )

        repositorio_de_conferencias(usuario).guardar_referencias(
            id_conferencia, [referencia.__dict__ for referencia in encontradas]
        )

        return tuple(ReferenciaLeida(**referencia.__dict__) for referencia in encontradas)

    """
    En un hilo aparte: son varias llamadas al modelo, una por tramo, y el
    cliente de OpenAI es síncrono. Sin esto se bloquea el bucle de eventos y
    el backend deja de atender al resto mientras dura la búsqueda.
    """
    referencias = await run_in_threadpool(trabajo)

    return RespuestaDeReferencias(referencias=list(referencias))
