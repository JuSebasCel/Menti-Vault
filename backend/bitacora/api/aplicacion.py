"""
Construcción de la aplicación FastAPI.

Una función y no un módulo con un `app` global: la suite necesita montar la
aplicación con una configuración de prueba y sin tocar `os.environ`, y un
global se construye al importar, cuando ya es tarde para eso.

El manejador de `ErrorDeBitacora` es la última red: cualquier error nombrado
que llegue hasta aquí sale como `{codigo, mensaje}` con su estado HTTP, y
cualquier error NO nombrado sale como el genérico con 500. En ninguno de los
dos casos cruza un detalle técnico, que es la regla de la sección de errores
del proyecto llevada al borde de la red.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from bitacora.api import chat, material, memorias, menti, plantillas, procesamiento
from bitacora.compartido.configuracion import Configuracion
from bitacora.compartido.errores import ErrorDeBitacora, MENSAJE_GENERICO

registro = logging.getLogger("bitacora.api")

TITULO = "Bitácora AI — orquestación de IA"

DESCRIPCION = (
    "Transcripción, chunking, análisis de discurso y agente conversacional. "
    "Todas las consultas corren con el token del usuario, bajo las políticas de RLS."
)


def crear_aplicacion(configuracion: Configuracion) -> FastAPI:
    aplicacion = FastAPI(title=TITULO, description=DESCRIPCION)

    """
    CORS con la lista explícita del entorno y `allow_credentials=False`.

    El token viaja en la cabecera `Authorization` que el frontend pone a mano,
    no en una cookie, así que no hace falta habilitar credenciales — y no
    habilitarlas cierra de entrada la clase de ataque que un `allow_origins`
    demasiado ancho volvería explotable.
    """
    aplicacion.add_middleware(
        CORSMiddleware,
        allow_origins=list(configuracion.origenes_permitidos),
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @aplicacion.exception_handler(ErrorDeBitacora)
    def manejar_error_de_bitacora(_: Request, error: ErrorDeBitacora) -> JSONResponse:
        registro.info("error de dominio codigo=%s detalle=%s", error.codigo, error.detalle)

        return JSONResponse(status_code=error.estado_http, content=error.como_respuesta())

    @aplicacion.exception_handler(Exception)
    def manejar_error_inesperado(_: Request, error: Exception) -> JSONResponse:
        """
        Un fallo sin nombre propio se registra con su tipo y sale como genérico.

        Es el caso que no debería ocurrir: si ocurre seguido, la corrección no
        es mejorar este mensaje sino darle un código al desenlace que lo
        provoca y atenderlo donde nace.
        """
        registro.exception("error no controlado tipo=%s", type(error).__name__)

        return JSONResponse(
            status_code=500,
            content={"codigo": "DATOS_FALLO_INESPERADO", "mensaje": MENSAJE_GENERICO},
        )

    @aplicacion.get("/salud", tags=["diagnóstico"])
    def salud() -> dict[str, str]:
        """
        No comprueba Supabase ni OpenAI a propósito.

        Es la sonda de vida del proceso, y hacerla depender de terceros la
        volvería roja cada vez que OpenAI tenga un mal minuto, con el
        despliegue reiniciando un backend que estaba perfectamente sano.
        """
        return {"estado": "ok"}

    aplicacion.include_router(procesamiento.router)
    aplicacion.include_router(chat.router)
    aplicacion.include_router(menti.router)
    aplicacion.include_router(memorias.router)
    aplicacion.include_router(plantillas.router)
    aplicacion.include_router(material.router)

    return aplicacion
