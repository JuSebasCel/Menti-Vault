-- Dos sesiones con el mismo título en el mismo evento, o dos ponentes con el
-- mismo nombre, no pueden existir: un duplicado de "Los Bootcamps" sin audio
-- se quedó fallando al lado de la buena, y cuál era cuál solo se sabía
-- abriendo la base. La interfaz lo avisa antes de guardar; esto es la red de
-- debajo, por si dos pestañas guardan a la vez.
--
-- Sin distinguir mayúsculas ni espacios de los extremos: "Panel de IA" y
-- "panel de ia " son la misma sesión.

create unique index if not exists conferencias_titulo_unico_por_evento
  on public.conferencias (id_dueno, evento, lower(trim(titulo)));

create unique index if not exists ponentes_nombre_unico_por_evento
  on public.ponentes (id_evento, lower(trim(nombre)));
