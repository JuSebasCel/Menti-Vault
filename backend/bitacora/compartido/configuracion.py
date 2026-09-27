"""
Lectura y validación de la configuración por entorno.

Mismo criterio que `frontend/src/shared/supabase/configuracion.ts`: se falla
rápido, al arrancar, con un mensaje que dice exactamente qué variable falta y
dónde completarla — en vez de dejar que el primer request muera con un
`NoneType is not subscriptable` a tres capas de profundidad. Y por eso
`leer_configuracion` recibe el entorno como parámetro en vez de leer
`os.environ` por dentro: así se prueba sin ensuciar el entorno del proceso.

Los identificadores de modelo NO se incrustan en el código: OpenAI los renombra
y deprecia a su ritmo, y una charla que deja de procesarse porque el modelo
del código murió no debería exigir un despliegue. Van con un valor por defecto
vigente y una variable de entorno que lo sobreescribe.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping

"""
`whisper-1` y no un modelo de transcripción más nuevo: la trazabilidad al
segundo es un requisito no funcional duro del producto (README, "coordenada
exacta"), y whisper es el único endpoint de transcripción de OpenAI que
devuelve `verbose_json` con los segmentos y sus tiempos. Los modelos
`gpt-4o-*-transcribe` transcriben mejor pero devuelven solo texto: usarlos
obligaría a inventar las coordenadas, que es exactamente lo que el producto no
puede permitirse. Si algún día publican tiempos, basta cambiar la variable.
"""
MODELO_DE_TRANSCRIPCION_POR_DEFECTO = "whisper-1"

"""
El análisis de discurso decide clasificaciones que después alguien valida a
mano: se paga un modelo grande. El agente conversacional solo traduce una
pregunta a filtros y redacta sobre fichas ya recuperadas —trabajo acotado y
verificado después contra las fichas reales—, así que ahí un modelo pequeño
cuesta menos y responde antes.
"""
MODELO_DE_ANALISIS_POR_DEFECTO = "gpt-4.1"
MODELO_DE_AGENTE_POR_DEFECTO = "gpt-4.1-mini"

ORIGENES_PERMITIDOS_POR_DEFECTO = "http://localhost:5173"

"""
Las cadenas de modelos de Groq, del preferido a los respaldos. Solo modelos
de producción: los de vista previa pueden desaparecer sin aviso, y un
respaldo que ya no existe no respalda nada. La transcripción tiene uno solo
de respaldo porque Groq no ofrece más modelos de voz.
"""
MODELOS_GROQ_TRANSCRIPCION_POR_DEFECTO = "whisper-large-v3-turbo,whisper-large-v3"
MODELOS_GROQ_FICHAS_POR_DEFECTO = "openai/gpt-oss-120b,llama-3.3-70b-versatile,openai/gpt-oss-20b"
MODELOS_GROQ_CHAT_POR_DEFECTO = "openai/gpt-oss-20b,openai/gpt-oss-120b,llama-3.1-8b-instant"

"""
Los que aceptan imágenes: leen el texto de una diapositiva adjuntada como
foto o captura (`memorias/vision.py`). Los de fichas y chat no lo hacen, y
pedírselo devuelve un error del proveedor, no una respuesta peor.

Estos nombres caducan. Los primeros que se pusieron aquí —los Llama 4 de
abril de 2026— ya no estaban en el catálogo de Groq unos meses después, y
como un modelo inexistente falla igual que una imagen ilegible, las
diapositivas dejaron de leerse sin que nadie se enterara. Si vuelve a pasar,
se cambia con `BITACORA_MODELOS_GROQ_VISION` sin tocar el código, y la
lectura a mano desde el Almacén dice el motivo en vez de callarlo.
"""
MODELOS_GROQ_VISION_POR_DEFECTO = "qwen/qwen3.8-27b,qwen/qwen3.6-27b"

"""Con una clave de OpenAI, el modelo con visión más barato de su catálogo."""
MODELO_DE_VISION_DE_OPENAI = "gpt-4o-mini"


@dataclass(frozen=True)
class Configuracion:
    """
    `supabase_anon_key` y no una service-role key, a propósito y sin excepción.

    Todo este backend consulta Supabase con el token del usuario que hizo la
    petición, montado sobre la anon key, de modo que RLS sigue aplicando fila
    por fila igual que cuando el frontend consulta directo. Una service-role
    key convertiría cada endpoint en un agujero que ve el catálogo entero de
    todo el grupo, y el aislamiento del proyecto vive en RLS y en ningún otro
    lado (`supabase/migrations/…_esquema_propio.sql`).
    """

    supabase_url: str
    supabase_anon_key: str
    modelo_de_transcripcion: str
    modelo_de_analisis: str
    modelo_de_agente: str
    origenes_permitidos: tuple[str, ...]
    modelos_groq_transcripcion: tuple[str, ...] = tuple(MODELOS_GROQ_TRANSCRIPCION_POR_DEFECTO.split(","))
    modelos_groq_fichas: tuple[str, ...] = tuple(MODELOS_GROQ_FICHAS_POR_DEFECTO.split(","))
    modelos_groq_chat: tuple[str, ...] = tuple(MODELOS_GROQ_CHAT_POR_DEFECTO.split(","))
    modelos_groq_vision: tuple[str, ...] = tuple(MODELOS_GROQ_VISION_POR_DEFECTO.split(","))
    modelo_de_vision: str = MODELO_DE_VISION_DE_OPENAI
    """
    El secreto que habilita leer las claves compartidas de la administración.
    Vacío, el backend solo usa las claves de cada quien (ver la migración
    `20260922130000`).
    """
    secreto_del_servidor: str = ""


def _requerida(entorno: Mapping[str, str], nombre: str) -> str:
    valor = entorno.get(nombre)

    if valor is None or valor.strip() == "":
        raise RuntimeError(
            f"Falta la variable de entorno {nombre}. Revisa backend/.env "
            f"(ver backend/.env.example) o las variables de entorno del despliegue."
        )

    return valor.strip()


def _opcional(entorno: Mapping[str, str], nombre: str, por_defecto: str) -> str:
    valor = entorno.get(nombre)

    return por_defecto if valor is None or valor.strip() == "" else valor.strip()


def leer_configuracion(entorno: Mapping[str, str]) -> Configuracion:
    origenes = _opcional(entorno, "BITACORA_ORIGENES_PERMITIDOS", ORIGENES_PERMITIDOS_POR_DEFECTO)

    return Configuracion(
        supabase_url=_requerida(entorno, "SUPABASE_URL"),
        supabase_anon_key=_requerida(entorno, "SUPABASE_ANON_KEY"),
        modelo_de_transcripcion=_opcional(
            entorno, "OPENAI_MODELO_TRANSCRIPCION", MODELO_DE_TRANSCRIPCION_POR_DEFECTO
        ),
        modelo_de_analisis=_opcional(
            entorno, "OPENAI_MODELO_ANALISIS", MODELO_DE_ANALISIS_POR_DEFECTO
        ),
        modelo_de_agente=_opcional(
            entorno, "OPENAI_MODELO_AGENTE", MODELO_DE_AGENTE_POR_DEFECTO
        ),
        origenes_permitidos=tuple(
            origen.strip() for origen in origenes.split(",") if origen.strip() != ""
        ),
        modelos_groq_transcripcion=_lista(
            _opcional(entorno, "BITACORA_MODELOS_GROQ_TRANSCRIPCION", MODELOS_GROQ_TRANSCRIPCION_POR_DEFECTO)
        ),
        modelos_groq_fichas=_lista(
            _opcional(entorno, "BITACORA_MODELOS_GROQ_FICHAS", MODELOS_GROQ_FICHAS_POR_DEFECTO)
        ),
        modelos_groq_chat=_lista(_opcional(entorno, "BITACORA_MODELOS_GROQ_CHAT", MODELOS_GROQ_CHAT_POR_DEFECTO)),
        modelos_groq_vision=_lista(
            _opcional(entorno, "BITACORA_MODELOS_GROQ_VISION", MODELOS_GROQ_VISION_POR_DEFECTO)
        ),
        modelo_de_vision=_opcional(entorno, "OPENAI_MODELO_VISION", MODELO_DE_VISION_DE_OPENAI),
        secreto_del_servidor=_opcional(entorno, "BITACORA_SECRETO_DEL_SERVIDOR", ""),
    )


def _lista(valor: str) -> tuple[str, ...]:
    return tuple(parte.strip() for parte in valor.split(",") if parte.strip() != "")
