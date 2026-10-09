"""
El recorrido completo de una conferencia: de `en-cola` a `procesada`/`fallida`.

Recibe sus colaboradores por parámetro (repositorio, transcriptor, analizador)
en vez de construirlos: es lo que permite ejercitar el recorrido entero —
incluyendo el camino de fallo y el estado en que queda la conferencia— sin red
ni credenciales. La composición real vive en `api/dependencias.py`.

El estado se escribe en la tabla conforme avanza y no al final, porque es lo
único que el frontend puede observar mientras esto corre: la petición HTTP ya
respondió (procesar una charla de 45 minutos tarda minutos, no cabe en un
request), así que `conferencias.estado` ES la barra de progreso.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, replace
from typing import Callable, Protocol, Sequence

from bitacora.analisis.chunking import (
    CARACTERES_POR_VENTANA,
    Ventana,
    agrupar_en_ventanas,
    renderizar_ventana,
)
from bitacora.analisis.clasificacion import (
    ContextoDeClasificacion,
    deduplicar,
    deduplicar_propuestas,
    resumen_de,
    validar_propuestas,
)
from bitacora.analisis.condensacion import Condensador, condensar_fichas
from bitacora.analisis.modelo import AnalizadorDeDiscurso
from bitacora.compartido.errores import ErrorDeBitacora
from bitacora.conferencias.repositorio import RepositorioDeConferencias
from bitacora.conferencias.tipos import Conferencia, Ficha, PropuestaDeTema, Segmento, Tema
from bitacora.transcripcion.lectura import texto_de_archivo
from bitacora.transcripcion.segmentos import duracion_de, segmentos_desde_transcripcion

"""
Estados desde los que se puede (re)procesar. `procesada` queda fuera a
propósito: reprocesar borra las fichas y con ellas el trabajo de validación
que alguien ya hizo a mano, así que no puede ser el resultado de que dos
pestañas manden la misma petición. `fallida` sí entra, porque es exactamente
el caso en que reintentar es lo que corresponde.
"""
ESTADOS_PROCESABLES = ("en-cola", "fallida")


class Transcriptor(Protocol):
    def __call__(self, nombre_de_archivo: str, contenido: bytes) -> tuple[Segmento, ...]: ...


@dataclass(frozen=True)
class ResultadoDelProcesamiento:
    id_conferencia: str
    fichas_creadas: int
    fichas_pendientes: int
    temas_propuestos: int
    duracion_en_segundos: int


def _segmentos_de_la_fuente(
    conferencia: Conferencia,
    nombre_de_archivo: str,
    contenido: bytes,
    transcribir: Transcriptor,
) -> tuple[Segmento, ...]:
    """
    Si la fuente ya es transcripción, no se transcribe: se parsea.

    Mandar una transcripción a Whisper sería pagar por convertir texto en
    texto, y de paso perder las marcas de tiempo que el propio archivo ya
    traía.
    """
    if conferencia.fuente == "transcripcion":
        return segmentos_desde_transcripcion(
            texto_de_archivo(nombre_de_archivo, contenido),
            conferencia.duracion_en_segundos,
        )

    return transcribir(nombre_de_archivo, contenido)


def _tema_de_respaldo(conferencia: Conferencia, temas: Sequence[Tema]) -> str:
    """
    Cadena vacía cuando no hay nada a lo que caer.

    Con la taxonomía vacía —el estado normal de una cuenta nueva— no existe
    ningún tema de respaldo, y eso ya no es un problema: una ficha sin tema
    reconocido viaja con el nombre que propuso el análisis y se resuelve
    después, cuando ese tema ya se creó.
    """
    if conferencia.id_tema_principal:
        return conferencia.id_tema_principal

    return temas[0].id if temas else ""


def _es_de_la_clave(fallo: BaseException) -> bool:
    return any(
        clase.__name__ in {"AuthenticationError", "PermissionDeniedError"} for clase in type(fallo).__mro__
    )


def _analizar_ventanas(
    conferencia: Conferencia,
    ventanas: Sequence[Ventana],
    temas: Sequence[Tema],
    analizar: AnalizadorDeDiscurso,
) -> tuple[tuple[Ficha, ...], tuple[PropuestaDeTema, ...]]:
    contexto = ContextoDeClasificacion(
        id_conferencia=conferencia.id,
        ponente=conferencia.ponente,
        temas=tuple(temas),
        id_tema_de_respaldo=_tema_de_respaldo(conferencia, temas),
    )

    fichas: list[Ficha] = []
    propuestas: list[PropuestaDeTema] = []

    for ventana in ventanas:
        try:
            crudas = analizar(
                conferencia.titulo,
                conferencia.ponente,
                conferencia.evento,
                temas,
                renderizar_ventana(ventana),
            )
        except Exception as fallo:  # noqa: BLE001
            # Una ventana que ningún modelo pudo devolver en JSON válido no
            # tumba la charla entera: se pierden las fichas de ese tramo, no
            # las de los otros cuarenta minutos ni la transcripción ya hecha.
            # Una clave rechazada sí se propaga: fallaría igual en todas.
            if _es_de_la_clave(fallo):
                raise
            registro.warning(
                "ventana sin analizar conferencia=%s fallo=%s", conferencia.id, type(fallo).__name__
            )
            continue
        resultado = validar_propuestas(crudas, ventana, contexto)
        fichas.extend(resultado.fichas)
        propuestas.extend(resultado.temas_propuestos)

    return deduplicar(fichas), deduplicar_propuestas(propuestas)


"""
Techo de fichas por minuto de charla.

El mismo numero que usa la interfaz al ofrecer las opciones (`carga/cuota.ts`).
Se vuelve a aplicar aqui porque alli solo se conoce la duracion cuando se sube
un audio: con una transcripcion no hay forma de saber cuanto dura hasta
haberla leido, asi que el recorte de verdad tiene que ocurrir donde ya se sabe.
"""
registro = logging.getLogger("bitacora.analisis")

FICHAS_POR_MINUTO = 0.75
MINIMO_DE_FICHAS = 3


def _cuantas_caben(maximo_pedido: int | None, duracion_en_segundos: int) -> int | None:
    """
    Lo pedido, recortado por lo que la duracion permite. `None` es sin limite.

    Se recorta y no se rechaza: quien pidio ciento veinte fichas de un audio de
    dos minutos no se equivoco de forma que haya que corregirle, simplemente no
    sabia cuanto duraba. Darle las que caben es mas util que un error.
    """
    if maximo_pedido is None:
        return None

    techo = max(MINIMO_DE_FICHAS, round((duracion_en_segundos / 60) * FICHAS_POR_MINUTO))

    return min(maximo_pedido, techo)


def _mejores(fichas: Sequence[Ficha], cuantas: int | None) -> tuple[Ficha, ...]:
    """
    Las `cuantas` mas citables, devueltas en el orden de la charla.

    Se ordena por relevancia para elegir y se reordena por coordenada para
    guardar: una lista de fichas saltando de un minuto a otro no se puede leer
    como lo que es, el recorrido de una charla.
    """
    if cuantas is None or len(fichas) <= cuantas:
        return tuple(fichas)

    elegidas = sorted(fichas, key=lambda f: f.relevancia, reverse=True)[:cuantas]

    return tuple(sorted(elegidas, key=lambda f: f.segundo_inicio))


def _resolver_temas_nuevos(
    fichas: Sequence[Ficha],
    vocabulario: Sequence[Tema],
    id_de_respaldo: str,
) -> tuple[Ficha, ...]:
    """
    Cambia el nombre del tema por su id, ya que el tema existe.

    Una ficha que se queda sin id se descarta en vez de guardarse mal: pasa
    solo si el tema no se pudo crear, y meterla bajo un tema cualquiera sería
    peor que perderla — quedaría archivada donde nadie la busca y nadie sabría
    que está mal.
    """
    por_nombre = {tema.nombre.strip().casefold(): tema.id for tema in vocabulario}
    resueltas: list[Ficha] = []

    for ficha in fichas:
        if not ficha.nombre_de_tema_nuevo:
            resueltas.append(ficha)
            continue

        id_tema = por_nombre.get(ficha.nombre_de_tema_nuevo.strip().casefold()) or id_de_respaldo

        if not id_tema:
            continue

        resueltas.append(replace(ficha, id_tema=id_tema, nombre_de_tema_nuevo=""))

    return tuple(resueltas)


def procesar_conferencia(
    id_conferencia: str,
    repositorio: RepositorioDeConferencias,
    transcribir: Transcriptor,
    analizar: AnalizadorDeDiscurso,
    condensar: Condensador | None = None,
    caracteres_por_ventana: int = CARACTERES_POR_VENTANA,
) -> ResultadoDelProcesamiento:
    """
    Marca `fallida` ante cualquier fallo posterior a `procesando`, y solo ahí.

    Un fallo ANTES de marcar `procesando` (la conferencia no existe, no está
    en un estado procesable, no hay temas en la taxonomía) no debe tocar el
    estado: no es la conferencia la que falló, es la petición la que no
    correspondía, y dejar en `fallida` una conferencia que sigue perfectamente
    `en-cola` obligaría a alguien a recargarla para nada.
    """
    conferencia = repositorio.obtener_conferencia(id_conferencia)

    if conferencia.estado not in ESTADOS_PROCESABLES:
        raise ErrorDeBitacora("PROC_ESTADO_NO_PROCESABLE", conferencia.estado)

    """
    Un pool vacío es un punto de partida válido, no un error.

    Antes esto moría en `PROC_SIN_TEMAS_DISPONIBLES`, y era un punto muerto:
    procesar exigía temas, los temas salían de curar propuestas, y las
    propuestas salían de procesar. Nadie podía empezar. Ahora el análisis
    clasifica contra lo que haya —aunque sea nada— y crea lo que le falte.
    """
    temas = repositorio.listar_temas()

    repositorio.marcar_estado(id_conferencia, "procesando")

    try:
        """
        La transcripción de un audio se guarda la primera vez y se reusa en
        los reintentos. Transcribir es lo más caro de todo y lo único que no
        cambia de un intento a otro: con Groq gratuito, dos intentos seguidos
        de una charla de 90 minutos agotaban el cupo de audio de la hora (7.200
        segundos por modelo) antes de llegar a analizar nada.
        """
        guardada = repositorio.leer_transcripcion_guardada(conferencia) if conferencia.fuente == "audio" else None

        if guardada is not None:
            segmentos = guardada
        else:
            nombre, contenido = repositorio.descargar_fuente(conferencia)
            segmentos = _segmentos_de_la_fuente(conferencia, nombre, contenido, transcribir)
            # También la de un .txt subido: la interfaz, Menti y las memorias
            # leen siempre este archivo, con sus minutos, sea cual sea la fuente.
            repositorio.guardar_transcripcion(conferencia, segmentos)

        """
        Procesar es transcribir, y nada más.

        Antes, después de transcribir se partía la charla en ventanas y se le
        pedían fichas a un modelo. El producto ya no usa fichas —las memorias,
        los artículos y Menti leen la transcripción—, y ese paso era el que
        fallaba: un JSON mal cerrado en una ventana dejaba la conferencia como
        `fallida` aunque la transcripción ya estuviera hecha y guardada.
        `analizar` sigue en la firma para no tocar a quien llama.
        """
        duracion = max(conferencia.duracion_en_segundos, duracion_de(segmentos))
        repositorio.guardar_resultado_del_analisis(
            id_conferencia,
            (),
            "",
            duracion,
            tiempos_estimados=all(segmento.estimado for segmento in segmentos),
        )
        registro.info("transcripcion conferencia=%s segmentos=%d duracion=%d", id_conferencia, len(segmentos), duracion)
    except ErrorDeBitacora:
        repositorio.marcar_estado(id_conferencia, "fallida")
        raise
    except Exception as fallo:  # noqa: BLE001
        repositorio.marcar_estado(id_conferencia, "fallida")
        raise ErrorDeBitacora("CONF_PROCESAMIENTO_FALLIDO", type(fallo).__name__) from fallo

    return ResultadoDelProcesamiento(
        id_conferencia=id_conferencia,
        fichas_creadas=len(fichas),
        fichas_pendientes=sum(
            1 for ficha in fichas if ficha.estado_de_validacion == "pendiente"
        ),
        temas_propuestos=len(propuestas),
        duracion_en_segundos=duracion,
    )


def procesar_sin_propagar(
    id_conferencia: str,
    repositorio: RepositorioDeConferencias,
    transcribir: Transcriptor,
    analizar: AnalizadorDeDiscurso,
    registrar: Callable[[str, str], None],
    condensar: Condensador | None = None,
    caracteres_por_ventana: int = CARACTERES_POR_VENTANA,
) -> None:
    """
    Envoltorio para correr en segundo plano, donde no hay a quién propagarle.

    El código del error se registra en el log del servidor —nunca el detalle
    de la excepción original— y el desenlace le llega a la persona por el
    único canal que sigue abierto: `conferencias.estado` en `fallida`, que la
    interfaz ya sabe traducir a `CONF_PROCESAMIENTO_FALLIDO`.
    """
    try:
        procesar_conferencia(id_conferencia, repositorio, transcribir, analizar, condensar, caracteres_por_ventana)
    except ErrorDeBitacora as error:
        registrar(id_conferencia, f"{error.codigo} ({error.detalle})" if error.detalle else error.codigo)
    except Exception as fallo:  # noqa: BLE001
        registrar(id_conferencia, f"INESPERADO:{type(fallo).__name__}")
