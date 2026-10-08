"""
Consultas del dominio de conferencias contra Supabase.

Misma convención que la serie B del frontend (commit «capa compartida de
acceso a datos»): un repositorio por dominio, con funciones planas, y nadie
más habla con `cliente.table(...)`. Los pipelines dependen del protocolo de
abajo y no de esta implementación, que es lo que permite probarlos enteros con
un repositorio en memoria, sin red ni credenciales.

Todas las consultas corren con el token del usuario, así que un id de
conferencia ajeno no devuelve una fila «prohibida»: devuelve cero filas, y
este módulo lo traduce a `CONF_NO_ENCONTRADA` — la misma ambigüedad
deliberada que ya usa el frontend para no convertir el detalle del error en
una forma de averiguar qué subió otra persona.
"""

from __future__ import annotations

import json

from typing import Any, Protocol, Sequence

from bitacora.compartido.datos import ClienteSupabase, traducir_fallo_de_datos
from bitacora.compartido.errores import ErrorDeBitacora
from bitacora.conferencias.tipos import Conferencia, Ficha, PropuestaDeTema, Segmento, Tema, fila_de_ficha

BUCKET_DE_AUDIO = "audio-conferencias"

"""
La transcripción de un audio, guardada junto a él para no volver a pagarla en
los reintentos (ver `pipeline.procesar_conferencia`). Queda fuera de la lista
de fuentes: no es el audio.
"""
NOMBRE_DE_LA_TRANSCRIPCION_GUARDADA = "transcripcion-guardada.json"

"""
Subcarpeta con las diapositivas y documentos de apoyo de la charla. Va en una
subcarpeta y no junto al audio porque el archivo fuente se elige listando la
carpeta: un PDF suelto ahí se habría intentado transcribir.
"""
CARPETA_DE_APOYO = "apoyo"


class RepositorioDeConferencias(Protocol):
    def obtener_conferencia(self, id_conferencia: str) -> Conferencia: ...

    def listar_temas(self) -> tuple[Tema, ...]: ...

    def marcar_estado(self, id_conferencia: str, estado: str) -> None: ...

    def guardar_resultado_del_analisis(
        self,
        id_conferencia: str,
        fichas: Sequence[Ficha],
        resumen: str,
        duracion_en_segundos: int,
        tiempos_estimados: bool = False,
    ) -> None: ...

    def registrar_temas_propuestos(
        self, id_evento: str | None, propuestas: Sequence[PropuestaDeTema]
    ) -> None: ...

    def crear_temas(self, nombres: Sequence[str]) -> tuple[Tema, ...]: ...

    def descargar_fuente(self, conferencia: Conferencia) -> tuple[str, bytes]: ...

    def leer_transcripcion_guardada(self, conferencia: Conferencia) -> tuple[Segmento, ...] | None: ...

    def listar_material_de_apoyo(self, conferencia: Conferencia) -> tuple[tuple[str, bytes], ...]: ...

    def guardar_transcripcion(self, conferencia: Conferencia, segmentos: Sequence[Segmento]) -> None: ...


def _fila_a_conferencia(fila: dict[str, Any]) -> Conferencia:
    return Conferencia(
        id=str(fila["id"]),
        titulo=str(fila.get("titulo") or ""),
        ponente=str(fila.get("ponente") or ""),
        evento=str(fila.get("evento") or ""),
        codigo_de_evento=str(fila.get("codigo_de_evento") or ""),
        fecha_del_evento=str(fila.get("fecha_del_evento") or ""),
        duracion_en_segundos=int(fila.get("duracion_en_segundos") or 0),
        maximo_de_fichas=(
            int(fila["maximo_de_fichas"]) if fila.get("maximo_de_fichas") else None
        ),
        id_dueno=str(fila.get("id_dueno") or ""),
        estado=str(fila.get("estado") or ""),
        fuente=str(fila.get("fuente") or ""),
        resumen=str(fila.get("resumen") or ""),
        id_tema_principal=(
            str(fila["id_tema_principal"]) if fila.get("id_tema_principal") else None
        ),
    )


class RepositorioSupabase:
    def __init__(self, cliente: ClienteSupabase) -> None:
        self._cliente = cliente

    def obtener_conferencia(self, id_conferencia: str) -> Conferencia:
        try:
            respuesta = (
                self._cliente.table("conferencias")
                .select("*")
                .eq("id", id_conferencia)
                .limit(1)
                .execute()
            )
        except Exception as fallo:  # noqa: BLE001
            raise traducir_fallo_de_datos(fallo) from fallo

        filas = getattr(respuesta, "data", None) or []
        if not filas:
            raise ErrorDeBitacora("CONF_NO_ENCONTRADA")

        return _fila_a_conferencia(filas[0])

    def listar_temas(self) -> tuple[Tema, ...]:
        """
        El pool completo, no los activos del evento.

        `temas_activos_evento` liga temas a un `eventos.id`, pero
        `conferencias.evento` es texto denormalizado (así lo decidió la
        migración: el directorio es una fuente de sugerencias, no una relación
        estricta), así que no hay un id de evento fiable con el que acotar.
        Clasificar contra el pool completo devuelve de más antes que de menos,
        y de menos habría significado mandar a curaduría temas que ya existen.
        """
        try:
            respuesta = self._cliente.table("temas").select("id, nombre").execute()
        except Exception as fallo:  # noqa: BLE001
            raise traducir_fallo_de_datos(fallo) from fallo

        filas = getattr(respuesta, "data", None) or []

        return tuple(
            Tema(id=str(fila["id"]), nombre=str(fila.get("nombre") or "")) for fila in filas
        )

    def crear_temas(self, nombres: Sequence[str]) -> tuple[Tema, ...]:
        """
        Da de alta temas nuevos y devuelve los definitivos, con su id.

        El vocabulario lo construye el análisis: cuando ninguno de los temas
        existentes describe lo que acaba de encontrar, crea uno. Por eso esto
        escribe en `temas` y no en `temas_propuestos` — la curaduría queda para
        revisar lo que se creó, no como puerta previa que deja una base vacía
        sin poder analizar nada nunca.

        `upsert` sobre `nombre`, que es único: dos ventanas de la misma charla
        pueden proponer el mismo tema, y dos charlas procesándose a la vez
        también. El choque no es un error, es el caso normal, y resolverlo
        devolviendo la fila que ya estaba es justo lo que se quiere.
        """
        limpios = [nombre.strip() for nombre in nombres if nombre.strip() != ""]

        if not limpios:
            return ()

        try:
            respuesta = (
                self._cliente.table("temas")
                .upsert(
                    [{"nombre": nombre} for nombre in dict.fromkeys(limpios)],
                    on_conflict="nombre",
                )
                .execute()
            )
        except Exception as fallo:  # noqa: BLE001
            raise traducir_fallo_de_datos(fallo) from fallo

        filas = getattr(respuesta, "data", None) or []

        return tuple(
            Tema(id=str(fila["id"]), nombre=str(fila.get("nombre") or "")) for fila in filas
        )

    def marcar_estado(self, id_conferencia: str, estado: str) -> None:
        try:
            self._cliente.table("conferencias").update({"estado": estado}).eq(
                "id", id_conferencia
            ).execute()
        except Exception as fallo:  # noqa: BLE001
            raise traducir_fallo_de_datos(fallo) from fallo

    def guardar_resultado_del_analisis(
        self,
        id_conferencia: str,
        fichas: Sequence[Ficha],
        resumen: str,
        duracion_en_segundos: int,
        tiempos_estimados: bool = False,
    ) -> None:
        """
        Borra las fichas anteriores antes de insertar las nuevas.

        Procesar es idempotente por diseño: reprocesar una conferencia
        (después de un fallo, o con otro modelo) tiene que dejar el catálogo
        con las fichas de esta corrida y no con las de esta más las de la
        anterior. El costo es que una reprocesada pierde el estado de
        validación que alguien ya había puesto a mano — aceptable mientras
        reprocesar sea una operación explícita sobre una conferencia
        `en-cola`/`fallida`, que es lo que el pipeline exige.
        """
        try:
            self._cliente.table("fichas").delete().eq(
                "id_conferencia", id_conferencia
            ).execute()

            if fichas:
                self._cliente.table("fichas").insert(
                    [fila_de_ficha(ficha) for ficha in fichas]
                ).execute()

            self._cliente.table("conferencias").update(
                {
                    "estado": "procesada",
                    "resumen": resumen,
                    "duracion_en_segundos": duracion_en_segundos,
                    "tiempos_estimados": tiempos_estimados,
                }
            ).eq("id", id_conferencia).execute()
        except Exception as fallo:  # noqa: BLE001
            raise traducir_fallo_de_datos(fallo) from fallo

    def registrar_temas_propuestos(
        self, id_evento: str | None, propuestas: Sequence[PropuestaDeTema]
    ) -> None:
        """
        Sin un evento del directorio al que colgarlas, la propuesta se descarta.

        `temas_propuestos.id_evento` es NOT NULL con FK a `eventos`, y la
        conferencia solo guarda el nombre del evento como texto. Se busca por
        nombre; si no hay coincidencia no se inventa un evento (crear filas en
        el directorio compartido del grupo desde un proceso automático es
        justo el tipo de crecimiento sin curaduría que la taxonomía existe
        para frenar). Perder la propuesta es recuperable: reprocesar la vuelve
        a generar.
        """
        if not propuestas:
            return

        id_evento_real = self._resolver_id_de_evento(id_evento)
        if id_evento_real is None:
            return

        try:
            self._cliente.table("temas_propuestos").insert(
                [
                    {
                        "nombre": propuesta.nombre,
                        "id_evento": id_evento_real,
                        "justificacion": propuesta.justificacion,
                    }
                    for propuesta in propuestas
                ]
            ).execute()
        except Exception as fallo:  # noqa: BLE001
            raise traducir_fallo_de_datos(fallo) from fallo

    def _resolver_id_de_evento(self, nombre: str | None) -> str | None:
        if not nombre:
            return None

        try:
            respuesta = (
                self._cliente.table("eventos")
                .select("id")
                .eq("nombre", nombre)
                .limit(1)
                .execute()
            )
        except Exception as fallo:  # noqa: BLE001
            raise traducir_fallo_de_datos(fallo) from fallo

        filas = getattr(respuesta, "data", None) or []

        return str(filas[0]["id"]) if filas else None

    def descargar_fuente(self, conferencia: Conferencia) -> tuple[str, bytes]:
        """
        Se lista la carpeta y se toma el archivo, en vez de armar la ruta.

        La política de Storage fija la carpeta —`{id_dueno}/{id_conferencia}/`—
        pero no el nombre del archivo, que lo pone quien sube. Listar es un
        viaje de red más y a cambio el backend no depende de una convención de
        nombres que vive en el frontend y que nadie obliga a respetar.
        """
        carpeta = f"{conferencia.id_dueno}/{conferencia.id}"

        try:
            almacen = self._cliente.storage.from_(BUCKET_DE_AUDIO)
            objetos = almacen.list(carpeta) or []
        except Exception as fallo:  # noqa: BLE001
            raise traducir_fallo_de_datos(fallo) from fallo

        """
        Las carpetas también vienen en el listado, con `metadata` en nulo: la
        de material de apoyo se llamaría "apoyo" y, ordenando por nombre,
        habría salido antes que el audio y se habría intentado transcribir
        una carpeta.
        """
        nombres = [
            str(objeto.get("name"))
            for objeto in objetos
            if isinstance(objeto, dict)
            and objeto.get("name")
            and objeto.get("name") != NOMBRE_DE_LA_TRANSCRIPCION_GUARDADA
            and objeto.get("metadata") is not None
        ]

        if not nombres:
            raise ErrorDeBitacora("PROC_AUDIO_NO_ENCONTRADO")

        nombre = sorted(nombres)[0]

        try:
            contenido = almacen.download(f"{carpeta}/{nombre}")
        except Exception as fallo:  # noqa: BLE001
            raise ErrorDeBitacora("PROC_AUDIO_NO_ENCONTRADO", type(fallo).__name__) from fallo

        if not contenido:
            raise ErrorDeBitacora("PROC_ARCHIVO_ILEGIBLE", "archivo vacío")

        return nombre, bytes(contenido)

    def listar_material_de_apoyo(self, conferencia: Conferencia) -> tuple[tuple[str, bytes], ...]:
        """
        Las diapositivas y documentos que acompañan a la charla, de
        `{dueño}/{conferencia}/apoyo/`. Cualquier fallo cuenta como que no hay
        material: es un extra, no puede impedir que se escriba la memoria.
        """
        carpeta = f"{conferencia.id_dueno}/{conferencia.id}/{CARPETA_DE_APOYO}"

        try:
            almacen = self._cliente.storage.from_(BUCKET_DE_AUDIO)
            objetos = almacen.list(carpeta) or []

            archivos: list[tuple[str, bytes]] = []

            for objeto in objetos:
                nombre = str(objeto.get("name")) if isinstance(objeto, dict) else ""

                if not nombre or objeto.get("metadata") is None:
                    continue

                archivos.append((nombre, bytes(almacen.download(f"{carpeta}/{nombre}"))))

            return tuple(archivos)
        except Exception:  # noqa: BLE001
            return ()

    def leer_transcripcion_guardada(self, conferencia: Conferencia) -> tuple[Segmento, ...] | None:
        """
        La transcripción de un análisis anterior de esta misma conferencia, si
        la hay. Cualquier problema al leerla cuenta como que no la hay: se
        vuelve a transcribir, que es lo que se hacía siempre.
        """
        ruta = f"{conferencia.id_dueno}/{conferencia.id}/{NOMBRE_DE_LA_TRANSCRIPCION_GUARDADA}"

        try:
            contenido = self._cliente.storage.from_(BUCKET_DE_AUDIO).download(ruta)
            crudos = json.loads(bytes(contenido).decode("utf-8"))
            return tuple(
                Segmento(
                    inicio=int(crudo["inicio"]),
                    fin=int(crudo["fin"]),
                    texto=str(crudo["texto"]),
                    hablante=crudo.get("hablante"),
                    estimado=bool(crudo.get("estimado", False)),
                )
                for crudo in crudos
            ) or None
        except Exception:  # noqa: BLE001
            return None

    def guardar_transcripcion(self, conferencia: Conferencia, segmentos: Sequence[Segmento]) -> None:
        """
        Se guarda junto al audio, en la carpeta del dueño. Si no se puede, no
        pasa nada: el análisis sigue, y el próximo reintento transcribirá otra
        vez, como antes.
        """
        ruta = f"{conferencia.id_dueno}/{conferencia.id}/{NOMBRE_DE_LA_TRANSCRIPCION_GUARDADA}"
        cuerpo = json.dumps(
            [
                {
                    "inicio": segmento.inicio,
                    "fin": segmento.fin,
                    "texto": segmento.texto,
                    "hablante": segmento.hablante,
                    "estimado": segmento.estimado,
                }
                for segmento in segmentos
            ],
            ensure_ascii=False,
        ).encode("utf-8")

        try:
            self._cliente.storage.from_(BUCKET_DE_AUDIO).upload(
                ruta, cuerpo, {"content-type": "application/json", "upsert": "true"}
            )
        except Exception:  # noqa: BLE001
            return
