-- Lo que configura el evento y no una ponencia: sus ejes temáticos y cómo se
-- redactan sus memorias.
--
-- `ejes` es una lista en el evento y no una tabla: se leen siempre junto al
-- evento y una sesión los nombra por texto (`conferencias.eje`), así que una
-- tabla aparte solo añadiría una clave foránea que nadie consulta sola.
--
-- `indicaciones_de_memoria` son las reglas en lenguaje natural que acompañan
-- al formato ("si el ponente no tiene teléfono, omite ese campo"). Viven en
-- el evento porque el formato es uno por evento: así se escriben una vez y
-- valen para todas las memorias.
alter table public.eventos
  add column if not exists ejes jsonb not null default '[]'::jsonb,
  add column if not exists formato_de_memoria text,
  add column if not exists indicaciones_de_memoria text not null default '';
