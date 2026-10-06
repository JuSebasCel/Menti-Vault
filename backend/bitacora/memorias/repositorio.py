"""
Lo que la redacción necesita leer, y dónde deja lo que escribió.

Con el cliente de la persona que pide, igual que el resto del backend: RLS
decide qué conferencias puede usar para una memoria, y una que no le
corresponde llega como no encontrada.
"""

from __future__ import annotations

import logging

from typing import Any, Mapping

from bitacora.analisis.chunking import agrupar_en_ventanas, renderizar_ventana
from bitacora.memorias.material import texto_de_material
from bitacora.memorias.vision import es_imagen
from bitacora.compartido.datos import ClienteSupabase, traducir_fallo_de_datos
from bitacora.conferencias.repositorio import RepositorioSupabase
from bitacora.memorias.redaccion import DatosDeLaCharla, FichaParaRedactar
from bitacora.transcripcion.lectura import texto_de_archivo
from bitacora.transcripcion.segmentos import segmentos_desde_transcripcion

registro = logging.getLogger("bitacora.memorias.repositorio")


def leer_material(
    cliente: ClienteSupabase, id_conferencia: str
) -> tuple[DatosDeLaCharla, tuple[FichaParaRedactar, ...]]:
    conferencia = RepositorioSupabase(cliente).obtener_conferencia(id_conferencia)

    try:
        respuesta = (
            cliente.table("fichas")
            .select("tipo_de_unidad, fragmento, condensado")
            .eq("id_conferencia", id_conferencia)
            .order("segundo_inicio")
            .execute()
        )
    except Exception as fallo:  # noqa: BLE001
        raise traducir_fallo_de_datos(fallo) from fallo

    filas: list[dict[str, Any]] = getattr(respuesta, "data", None) or []

    fichas = tuple(
        FichaParaRedactar(
            tipo=str(fila.get("tipo_de_unidad") or ""),
            texto=str(fila.get("condensado") or fila.get("fragmento") or "").strip(),
            literal=str(fila.get("fragmento") or "").strip(),
        )
        for fila in filas
    )

    charla = DatosDeLaCharla(
        titulo=conferencia.titulo,
        ponente=conferencia.ponente,
        evento=conferencia.evento,
        fecha=conferencia.fecha_del_evento,
        resumen=conferencia.resumen,
    )

    return charla, tuple(ficha for ficha in fichas if ficha.texto)


def leer_tramos_de_la_transcripcion(
    cliente: ClienteSupabase, id_conferencia: str, caracteres_por_tramo: int
) -> tuple[str, ...]:
    """
    La transcripción completa, partida en tramos del tamaño que acepta el
    proveedor. Es lo que `rastreo.py` recorre para encontrar los datos que las
    fichas no recogen.

    Se prefiere la transcripción que guardó el análisis: ya está transcrita y
    con sus tiempos. Si no la hay —una charla que llegó como texto y aún no se
    analizó— se lee el archivo original. Y si tampoco se puede, se devuelven
    cero tramos: la memoria se escribe solo con las fichas, como antes, en vez
    de fallar.
    """
    repositorio = RepositorioSupabase(cliente)

    try:
        conferencia = repositorio.obtener_conferencia(id_conferencia)
        segmentos = repositorio.leer_transcripcion_guardada(conferencia)

        if segmentos is None and conferencia.fuente == "transcripcion":
            nombre, contenido = repositorio.descargar_fuente(conferencia)
            segmentos = segmentos_desde_transcripcion(
                texto_de_archivo(nombre, contenido), conferencia.duracion_en_segundos
            )

        if not segmentos:
            return _tramos_de_apoyo(repositorio, conferencia, caracteres_por_tramo)

        ventanas = agrupar_en_ventanas(segmentos, caracteres_por_ventana=caracteres_por_tramo)

        return (
            *_tramos_de_apoyo(repositorio, conferencia, caracteres_por_tramo),
            *(renderizar_ventana(ventana) for ventana in ventanas),
        )
    except Exception:  # noqa: BLE001
        return ()


def _tramos_de_apoyo(
    repositorio: RepositorioSupabase, conferencia: Any, caracteres_por_tramo: int
) -> tuple[str, ...]:
    """
    Las diapositivas van PRIMERO, antes de la transcripción.

    El rastreo se detiene en cuanto cubre todos los huecos, y los datos duros
    —correo, teléfono, nombre del evento— están casi siempre en una lámina y
    casi nunca dichos en voz alta. Empezar por ahí suele resolver la memoria
    en una o dos llamadas.
    """
    tramos: list[str] = []

    for nombre, contenido in repositorio.listar_material_de_apoyo(conferencia):
        if es_imagen(nombre):
            continue

        texto = texto_de_material(nombre, contenido)

        for inicio in range(0, len(texto), caracteres_por_tramo):
            tramos.append(f"MATERIAL DE APOYO «{nombre}»\n{texto[inicio : inicio + caracteres_por_tramo]}")

    return tuple(tramos)


def leer_imagenes_de_apoyo(cliente: ClienteSupabase, id_conferencia: str) -> tuple[tuple[str, bytes], ...]:
    """
    Las diapositivas adjuntadas como imagen. Van aparte de los tramos de
    texto porque para leerlas hace falta un modelo con visión, y eso es una
    decisión del endpoint (qué clave, qué modelo), no del repositorio.
    """
    try:
        repositorio = RepositorioSupabase(cliente)
        conferencia = repositorio.obtener_conferencia(id_conferencia)

        return tuple(
            (nombre, contenido)
            for nombre, contenido in repositorio.listar_material_de_apoyo(conferencia)
            if es_imagen(nombre)
        )
    except Exception:  # noqa: BLE001
        return ()


def guardar_redaccion(
    cliente: ClienteSupabase, id_memoria: str, secciones: Mapping[str, str | None]
) -> None:
    """
    Lo redactado y el estado, en una sola escritura.

    Las dos cosas juntas y no en dos pasos: una memoria que dijera `lista`
    antes de tener sus secciones se abriría vacía, y el orden inverso dejaría
    contenido bueno marcado como si siguiera generándose. Es la fila la que
    tiene que pasar de un estado coherente al siguiente.
    """
    try:
        cliente.table("memorias").update({"secciones": dict(secciones), "estado": "lista"}).eq(
            "id", id_memoria
        ).execute()
    except Exception as fallo:  # noqa: BLE001
        raise traducir_fallo_de_datos(fallo) from fallo


def marcar_memoria_fallida(cliente: ClienteSupabase, id_memoria: str) -> None:
    """
    Que la redacción falle no puede dejar la fila diciendo `generando` para
    siempre: la interfaz la consultaría sin fin y quien la pidió no sabría
    nunca que no va a llegar. Esto corre en el manejo de un fallo, así que no
    vuelve a lanzar: si tampoco se puede escribir el estado, lo que importa es
    el fallo original.
    """
    try:
        cliente.table("memorias").update({"estado": "fallida"}).eq("id", id_memoria).execute()
    except Exception:  # noqa: BLE001
        registro.warning("no se pudo marcar la memoria como fallida id=%s", id_memoria)
