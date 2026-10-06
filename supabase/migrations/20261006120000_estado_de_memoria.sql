-- En qué punto va la redacción de una memoria.
--
-- Redactar se hacía en línea, dentro de la petición HTTP, y la interfaz se
-- quedaba esperando con todo quieto hasta que terminara. Eso tenía sentido
-- cuando era una sola llamada al modelo, que es lo que decía el encabezado de
-- `api/memorias.py`. Dejó de tenerlo: ahora antes de redactar se rastrea la
-- transcripción completa por ventanas (una llamada cada una, hasta treinta) y
-- se lee cada diapositiva adjuntada como imagen (una llamada por imagen). Son
-- minutos, no segundos, y una petición abierta tanto tiempo acaba en un
-- timeout del proxy que se ve como un fallo aunque el trabajo haya salido
-- bien.
--
-- Es el mismo canal que `conferencias.estado`: el backend responde 202,
-- trabaja en segundo plano y escribe aquí en qué va. La interfaz enseña la
-- tarjeta desde el primer momento y consulta este campo, así que cerrar el
-- panel o cambiar de pantalla no interrumpe nada.
--
-- Las memorias que ya existen nacen `lista`: su contenido está escrito y
-- guardado. `generando` solo lo pone quien arranca una redacción nueva.

alter table memorias
  add column estado text not null default 'lista'
    check (estado in ('generando', 'lista', 'fallida'));

-- Las que están a medias se consultan hasta que terminan; las listas, nunca.
create index memorias_estado_idx on memorias (estado) where estado = 'generando';
