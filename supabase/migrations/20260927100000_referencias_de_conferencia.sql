-- Las fuentes que cada charla cita: lo que el ponente nombró y lo que estaba
-- escrito en sus diapositivas.
--
-- En una columna `jsonb` de la conferencia y no en una tabla propia: una
-- referencia no se busca, ni se filtra, ni se comparte por su cuenta —se lee
-- junto a la charla que la citó— y una tabla habría traído su clave foránea,
-- su política de RLS y su índice para la misma lectura que ya hace la
-- conferencia. Si algún día se quiere una bibliografía del archivo entero,
-- ahí sí valdrá la pena la tabla.
--
-- Forma de cada elemento:
--   {"cita": "...", "autores": "...", "anio": "...", "titulo": "...",
--    "fuente": "...", "origen": "dicha|diapositiva|inferida", "evidencia": "..."}
alter table public.conferencias
  add column if not exists referencias jsonb not null default '[]'::jsonb;
