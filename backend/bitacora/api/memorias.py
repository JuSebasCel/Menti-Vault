"""
Endpoints de memorias: redactar los huecos y convertir el resultado a PDF.

Son dos y no uno a propósito. Entre medias está el llenado del `.docx`, que
hace el frontend con la misma librería con la que ya reconocía los
marcadores; juntarlos obligaría a reescribir ese llenado aquí o a mandar la
plantilla de ida y vuelta.

Los dos responden en línea. Redactar es una sola llamada al modelo y convertir
tarda segundos, no minutos: no justifican el 202 con seguimiento que usa el
análisis de una conferencia.
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from bitacora.api.dependencias import (
    Usuario,
    cliente_para,
    lector_de_imagenes_para,
    rastreador_para,
    redactor_para,
)
from bitacora.api.procesamiento import CARACTERES_POR_VENTANA_EN_GROQ
from bitacora.analisis.chunking import CARACTERES_POR_VENTANA
from bitacora.compartido.errores import ErrorDeBitacora
from bitacora.compartido.ia import es_de_groq
from bitacora.memorias.pdf import convertir_a_pdf
from bitacora.memorias.redaccion import Hueco
from bitacora.memorias.repositorio import (
    leer_imagenes_de_apoyo,
    leer_material,
    leer_tramos_de_la_transcripcion,
)

router = APIRouter(prefix="/memorias", tags=["memorias"])


class HuecoPedido(BaseModel):
    id: str = Field(min_length=1)
    nombre: str
    instruccion: str = ""
    formato: Literal["parrafo", "lista_vinetas", "lista_numerada"] = "parrafo"
    modo: Literal["redactar", "cita"] = "redactar"
    extension: Literal["breve", "media", "extensa"] = "media"
    """Las únicas respuestas admitidas para este hueco. Vacío = la IA redacta libremente."""
    opciones: list[str] = Field(default_factory=list, max_length=30)


class PedidoDeRedaccion(BaseModel):
    id_conferencia: str = Field(min_length=1)
    huecos: list[HuecoPedido]
    """El tono de la plantilla, ya como frase. Vacío = el de siempre."""
    tono: str = Field(default="", max_length=800)


class RespuestaDeRedaccion(BaseModel):
    """`null` en un hueco significa que la charla no dio material para él."""

    secciones: dict[str, str | None]


@router.post("/redactar", response_model=RespuestaDeRedaccion)
def redactar(cuerpo: PedidoDeRedaccion, usuario: Usuario) -> RespuestaDeRedaccion:
    """
    Se comprueba que haya huecos ANTES de leer nada o pedir la clave: una
    plantilla sin marcadores no tiene nada que redactar, y descubrirlo después
    de gastar una lectura y una llamada al modelo sería pagar por un error que
    se veía en la petición.
    """
    if not cuerpo.huecos:
        raise ErrorDeBitacora("MEM_SIN_HUECOS")

    charla, fichas = leer_material(usuario.cliente, cuerpo.id_conferencia)
    clave = usuario.clave_de_openai("fichas")
    cliente = cliente_para(usuario, clave, "fichas")

    huecos = [
        Hueco(
            id=hueco.id,
            nombre=hueco.nombre.strip(),
            instruccion=hueco.instruccion.strip(),
            formato=hueco.formato,
            modo=hueco.modo,
            extension=hueco.extension,
            opciones=tuple(opcion.strip() for opcion in hueco.opciones if opcion.strip()),
        )
        for hueco in cuerpo.huecos
    ]

    """
    Antes de redactar se busca en la transcripción completa lo que pide cada
    hueco. Las fichas son lo citable de la charla, y una plantilla pide
    además datos que nadie citaría —un correo, un teléfono, la modalidad—:
    estaban dichos y la memoria salía sin ellos. Ver `rastreo.py`.

    Si no hay transcripción a mano, no hay tramos y la redacción sigue como
    antes, solo con las fichas.
    """
    tramos = leer_tramos_de_la_transcripcion(
        usuario.cliente,
        cuerpo.id_conferencia,
        CARACTERES_POR_VENTANA_EN_GROQ if es_de_groq(clave) else CARACTERES_POR_VENTANA,
    )

    """
    Una diapositiva adjuntada como imagen no tiene texto que sacar: la lee un
    modelo con visión y lo que devuelve entra como un tramo más, delante de
    todo. Es justo donde suelen estar el correo y el teléfono de contacto.
    """
    imagenes = leer_imagenes_de_apoyo(usuario.cliente, cuerpo.id_conferencia)
    leidas = lector_de_imagenes_para(usuario, clave)(imagenes) if imagenes else ()

    todos_los_tramos = (*leidas, *tramos)

    extractos = rastreador_para(usuario, cliente)(huecos, todos_los_tramos) if todos_los_tramos else {}

    secciones = redactor_para(usuario, cliente)(
        charla,
        fichas,
        huecos,
        tono=cuerpo.tono.strip(),
        extractos=extractos,
    )

    return RespuestaDeRedaccion(secciones=secciones)


@router.post("/pdf", response_class=Response)
async def a_pdf(peticion: Request, usuario: Usuario) -> Response:
    """
    El `.docx` llega como cuerpo crudo y no como formulario multiparte: es un
    solo archivo sin campos alrededor, y así no hace falta otra dependencia
    solo para desempaquetarlo.

    Pide sesión aunque no lea nada de la base: sin ella, esto sería un
    conversor de documentos abierto a cualquiera que encuentre la URL.
    """
    del usuario

    docx = await peticion.body()
    pdf = await run_in_threadpool(convertir_a_pdf, docx)

    return Response(content=pdf, media_type="application/pdf")
