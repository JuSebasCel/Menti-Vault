"""
Menti, el chat del evento, como agente: un modelo que conversa y que busca
en las ponencias solo cuando la pregunta lo necesita.

El backend no busca. Ofrece al modelo una herramienta, `buscar_en_ponencias`,
y si el modelo la pide, devuelve la petición a la interfaz, que es quien ya
tiene las transcripciones en memoria y su buscador (`menti/motor.ts`); la
interfaz vuelve a llamar con los fragmentos encontrados. Así no se descargan
las transcripciones dos veces —una en el navegador y otra aquí— y la clave
de IA nunca sale del servidor.

Antes Menti era solo ese buscador, y todo lo que no fuera un tema —un saludo,
"¿cómo me llamo?" con una errata, "¿qué opinas?"— se buscaba como si lo
fuera. Con el modelo delante, buscar es una decisión, no el único camino.
"""

from __future__ import annotations

import json
from typing import Any, Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from bitacora.api.dependencias import Usuario, cliente_de_openai

router = APIRouter(prefix="/menti", tags=["menti"])

MENSAJES_COMO_MAXIMO = 40
"""
La conversación entera viaja en cada turno, pero no sin límite: más allá de
esto se conservan los últimos. Una charla de cuarenta mensajes ya es larga, y
el contexto del evento ocupa lo suyo.
"""


class MensajeDeMenti(BaseModel):
    role: Literal["user", "assistant", "tool"]
    content: str = ""
    tool_calls: list[dict[str, Any]] | None = None
    tool_call_id: str | None = None


class TurnoDeMenti(BaseModel):
    evento: str = Field(min_length=1)
    """Lo que hay en el evento —ponencias, ponentes, resúmenes—, armado por la interfaz con lo que RLS ya le dejó ver."""
    contexto_del_evento: str = ""
    nombre_de_la_persona: str = ""
    mensajes: list[MensajeDeMenti] = Field(min_length=1)


class LlamadaAHerramienta(BaseModel):
    id: str
    nombre: str
    argumentos: dict[str, Any]


class RespuestaDeMenti(BaseModel):
    contenido: str
    llamadas: list[LlamadaAHerramienta]


HERRAMIENTAS = [
    {
        "type": "function",
        "function": {
            "name": "buscar_en_ponencias",
            "description": (
                "Busca en las transcripciones de las ponencias del evento los fragmentos donde se habló de algo. "
                "Úsala solo cuando la respuesta dependa de lo que se dijo en las charlas: qué dijo alguien, quién "
                "habló de un tema, qué ponencias lo trataron, si lo que se dijo es cierto. No la uses para saludar, "
                "conversar, responder sobre ti o sobre la persona, ni para lo que ya está en el contexto del evento."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "consulta": {
                        "type": "string",
                        "description": "Las palabras del tema a buscar, en español, sin relleno. Ej.: 'inteligencia artificial criterio humano'.",
                    },
                    "ponente": {
                        "type": "string",
                        "description": "Nombre del ponente si la búsqueda se limita a su charla; vacío si no.",
                    },
                },
                "required": ["consulta"],
            },
        },
    }
]


def indicaciones(evento: str, contexto: str, nombre: str) -> str:
    persona = f"La persona se llama {nombre}. " if nombre.strip() else ""
    return f"""Eres Menti, el asistente de Menti Vault para el evento «{evento}». Hablas en español, con calidez y sin rodeos, como una persona que conoce bien el evento.

{persona}Reglas:
1. Conversa con naturalidad. A un saludo, una pregunta sobre ti, sobre la persona o sobre lo que ya hablaron, responde sin buscar nada.
2. Recuerda la conversación: si dicen "eso", "esos" o "lo anterior", se refieren a lo último que se habló.
3. Cuando la respuesta dependa de lo que se dijo en las ponencias, usa buscar_en_ponencias. Si una búsqueda no trae nada útil, prueba otra vez con otras palabras antes de rendirte.
4. Lo que afirmes sobre las ponencias tiene que salir de los fragmentos encontrados o del contexto del evento. No inventes citas, minutos ni ponentes. Cita los fragmentos que uses con su marca, por ejemplo [F2].
5. Si te piden juzgar si algo es cierto, da tu lectura razonada con lo que sabes en general, separa datos de opiniones y di con claridad qué habría que contrastar con una fuente. No tienes acceso a internet.
6. Respuestas breves: dos o tres párrafos como mucho, sin listas largas salvo que te las pidan.

Contexto del evento (ponencias, ponentes y resúmenes):
{contexto}
"""


@router.post("/turno", response_model=RespuestaDeMenti)
def turno(cuerpo: TurnoDeMenti, usuario: Usuario) -> RespuestaDeMenti:
    cliente = cliente_de_openai(usuario, "chat")
    mensajes: list[dict[str, Any]] = [
        {"role": "system", "content": indicaciones(cuerpo.evento, cuerpo.contexto_del_evento, cuerpo.nombre_de_la_persona)}
    ]
    for mensaje in cuerpo.mensajes[-MENSAJES_COMO_MAXIMO:]:
        fila: dict[str, Any] = {"role": mensaje.role, "content": mensaje.content}
        if mensaje.tool_calls:
            fila["tool_calls"] = mensaje.tool_calls
        if mensaje.tool_call_id:
            fila["tool_call_id"] = mensaje.tool_call_id
        mensajes.append(fila)

    respuesta = cliente.chat.completions.create(
        model=usuario.configuracion.modelo_de_agente,
        messages=mensajes,
        tools=HERRAMIENTAS,
        tool_choice="auto",
        temperature=0.4,
    )
    elegido = respuesta.choices[0].message

    llamadas: list[LlamadaAHerramienta] = []
    for llamada in elegido.tool_calls or []:
        try:
            argumentos = json.loads(llamada.function.arguments or "{}")
        except json.JSONDecodeError:
            argumentos = {}
        llamadas.append(LlamadaAHerramienta(id=llamada.id, nombre=llamada.function.name, argumentos=argumentos))

    return RespuestaDeMenti(contenido=elegido.content or "", llamadas=llamadas)
