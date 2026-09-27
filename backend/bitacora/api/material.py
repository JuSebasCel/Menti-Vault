"""
Leer a mano el texto de una imagen de apoyo.

Existe para que la lectura de diapositivas sea COMPROBABLE. La lectura
automática ocurre al escribir una memoria y, si falla —el modelo con visión
cambió de nombre, la imagen pesa de más—, lo único que queda es una memoria
con huecos y ninguna pista de por qué. Aquí se pide una imagen concreta y se
devuelve lo que el modelo leyó, o el error, que es lo que hace falta para
saber si el problema es la imagen, el modelo o la clave.
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from bitacora.api.dependencias import Usuario, lector_de_imagenes_para
from bitacora.compartido.errores import ErrorDeBitacora
from bitacora.memorias.repositorio import leer_imagenes_de_apoyo

router = APIRouter(prefix="/material", tags=["material"])


class PedidoDeLectura(BaseModel):
    id_conferencia: str = Field(min_length=1)
    """Nombre del archivo dentro de la carpeta de apoyo de la conferencia."""
    nombre: str = Field(min_length=1, max_length=300)


class RespuestaDeLectura(BaseModel):
    texto: str


@router.post("/leer-imagen", response_model=RespuestaDeLectura)
def leer_imagen(cuerpo: PedidoDeLectura, usuario: Usuario) -> RespuestaDeLectura:
    imagenes = [
        (nombre, contenido)
        for nombre, contenido in leer_imagenes_de_apoyo(usuario.cliente, cuerpo.id_conferencia)
        if nombre == cuerpo.nombre
    ]

    if not imagenes:
        raise ErrorDeBitacora("MATERIAL_NO_ENCONTRADO")

    leidas = lector_de_imagenes_para(usuario, usuario.clave_de_openai("fichas"))(imagenes)

    if not leidas:
        raise ErrorDeBitacora("MATERIAL_SIN_TEXTO")

    """
    Se devuelve solo lo leído, sin el encabezado con el nombre del archivo que
    `vision.py` antepone para el rastreo: aquí ya se sabe de qué imagen es.
    """
    primera = leidas[0]
    _, _, texto = primera.partition("\n")

    return RespuestaDeLectura(texto=texto or primera)
