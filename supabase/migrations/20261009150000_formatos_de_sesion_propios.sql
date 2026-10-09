-- Formatos de sesión propios de cada evento ("Panel de expertos",
-- "Conversatorio"…), además de los cinco de siempre.
--
-- La restricción de cinco valores fijos se quita: un congreso nombra sus
-- sesiones a su manera, y obligarlo a llamar "panel" a su "panel de
-- expertos" le hace perder justo el matiz que quiere comunicar. La lista de
-- formatos añadidos vive en el evento, para ofrecerlos en el formulario.

alter table public.conferencias drop constraint if exists conferencias_tipo_de_sesion_check;

alter table public.eventos add column if not exists formatos_de_sesion jsonb not null default '[]'::jsonb;
