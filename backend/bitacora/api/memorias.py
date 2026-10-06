"""
Endpoints de memorias: redactar los huecos y convertir el resultado a PDF.

Son dos y no uno a propósito. Entre medias está el llenado del `.docx`, que
hace el frontend con la misma librería con la que ya reconocía los
marcadores; juntarlos obligaría a reescribir ese llenado aquí o a mandar la
plantilla de ida y vuelta.

Convertir a PDF responde en línea: tarda segundos.

Redactar ya no. Durante un tiempo fue una sola llamada al modelo y esto decía,
con razón, que no justificaba el 202 con seguimiento del análisis de una
conferencia. Después entraron el rastreo de la transcripción (una llamada por
ventana, hasta treinta) y la lectura de las diapositivas adjuntadas como
imagen (una llamada por imagen, hasta doce): hoy son minutos y cuarenta
llamadas en el peor caso. Una petición abierta todo ese tiempo acaba en un
timeout del proxy que se ve como un fallo aunque el trabajo haya salido bien,
y mientras tanto la interfaz no tenía nada que enseñar.

Así que redactar sigue el mismo camino que procesar: 202, trabajo en segundo
plano y el avance en `memorias.estado`, que la interfaz consulta. La fila la
crea el frontend antes de pedir esto, y por eso el pedido trae `id_memoria`:
la tarjeta existe desde el primer momento, diciendo que se está generando.
"""

from __future__ import annotations

import logging

from typing import Any, Literal

from fastapi import APIRouter, BackgroundTasks, Request, Response, status
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
from bitacora.api.despierto import mientras_trabaja
from bitacora.memorias.repositorio import (
    guardar_redaccion,
    leer_imagenes_de_apoyo,
    leer_material,
    leer_tramos_de_la_transcripcion,
    marcar_memoria_fallida,
)

router = APIRouter(prefix="/memorias", tags=["memorias"])

registro = logging.getLogger("bitacora.memorias")


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
    """La fila que el frontend ya creó en `generando`, donde se escribe el resultado."""
    id_memoria: str = Field(min_length=1)
    huecos: list[HuecoPedido]
    """El tono de la plantilla, ya como frase. Vacío = el de siempre."""
    tono: str = Field(default="", max_length=800)


class RespuestaDeRedaccion(BaseModel):
    id_memoria: str
    estado: str
    mensaje: str


def _redactar_sin_dormirse(*argumentos: object) -> None:
    """La redacción en segundo plano, con el servidor despierto hasta que acabe (ver `despierto.py`)."""
    with mientras_trabaja():
        _redactar_y_guardar(*argumentos)  # type: ignore[arg-type]


def _redactar_y_guardar(
    usuario: Usuario,
    cuerpo: PedidoDeRedaccion,
    huecos: list[Hueco],
    clave: Any,
    cliente: Any,
) -> None:
    """
    Todo el trabajo caro, ya fuera de la petición.

    Un fallo aquí no puede propagarse —nadie lo está esperando— así que deja
    la fila en `fallida` y lo registra. Lo que no se hace es dejarla en
    `generando`: la interfaz la consultaría para siempre.
    """
    try:
        charla, fichas = leer_material(usuario.cliente, cuerpo.id_conferencia)

        """
        Antes de redactar se busca en la transcripción completa lo que pide
        cada hueco. Las fichas son lo citable de la charla, y una plantilla
        pide además datos que nadie citaría —un correo, un teléfono, la
        modalidad—: estaban dichos y la memoria salía sin ellos. Ver
        `rastreo.py`.

        Si no hay transcripción a mano, no hay tramos y la redacción sigue
        como antes, solo con las fichas.
        """
        tramos = leer_tramos_de_la_transcripcion(
            usuario.cliente,
            cuerpo.id_conferencia,
            CARACTERES_POR_VENTANA_EN_GROQ if es_de_groq(clave) else CARACTERES_POR_VENTANA,
        )

        """
        Una diapositiva adjuntada como imagen no tiene texto que sacar: la lee
        un modelo con visión y lo que devuelve entra como un tramo más,
        delante de todo. Es justo donde suelen estar el correo y el teléfono
        de contacto.
        """
        imagenes = leer_imagenes_de_apoyo(usuario.cliente, cuerpo.id_conferencia)
        leidas = lector_de_imagenes_para(usuario, clave)(imagenes) if imagenes else ()

        todos_los_tramos = (*leidas, *tramos)

        extractos = (
            rastreador_para(usuario, cliente)(huecos, todos_los_tramos) if todos_los_tramos else {}
        )

        secciones = redactor_para(usuario, cliente)(
            charla,
            fichas,
            huecos,
            tono=cuerpo.tono.strip(),
            extractos=extractos,
        )

        guardar_redaccion(usuario.cliente, cuerpo.id_memoria, secciones)
        registro.info(
            "memoria redactada id=%s huecos=%s con_material=%s",
            cuerpo.id_memoria,
            len(huecos),
            sum(1 for valor in secciones.values() if valor),
        )
    except Exception as fallo:  # noqa: BLE001
        registro.warning(
            "memoria sin redactar id=%s motivo=%s", cuerpo.id_memoria, type(fallo).__name__
        )
        marcar_memoria_fallida(usuario.cliente, cuerpo.id_memoria)


@router.post(
    "/redactar",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=RespuestaDeRedaccion,
)
def redactar(
    cuerpo: PedidoDeRedaccion, usuario: Usuario, tareas: BackgroundTasks
) -> RespuestaDeRedaccion:
    """
    Lo que puede fallar rápido se comprueba ANTES de aceptar.

    Una plantilla sin marcadores no tiene nada que redactar, y que falte la
    API key se sabe en milisegundos. Dejarlo para el segundo plano devolvería
    202 a una petición condenada y obligaría a esperar a ver `fallida` para
    enterarse de algo que se veía de entrada.
    """
    if not cuerpo.huecos:
        raise ErrorDeBitacora("MEM_SIN_HUECOS")

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

    tareas.add_task(_redactar_sin_dormirse, usuario, cuerpo, huecos, clave, cliente)

    return RespuestaDeRedaccion(
        id_memoria=cuerpo.id_memoria,
        estado="generando",
        mensaje="La memoria entró a redacción. Su estado se actualiza en la tabla.",
    )


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
