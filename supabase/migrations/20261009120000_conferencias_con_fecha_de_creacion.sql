-- Cuándo se creó cada sesión, aparte de cuándo se le subió la grabación.
--
-- `cargada_el` dice cuándo llegó el archivo, y una sesión de la agenda puede
-- no tenerlo todavía: usarla para ordenar dejaba las sesiones nuevas sin
-- fecha, y usar `fuente` para saber si ya se subió algo no sirve, porque
-- toda sesión nace con `fuente = 'audio'`.

alter table public.conferencias add column creada_el timestamptz not null default now();

update public.conferencias
set creada_el = cargada_el
where cargada_el is not null;
