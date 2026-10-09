-- Cuándo se agregó cada ponente, para poder ordenar el directorio por los
-- más recientes. Los que ya existían toman la fecha en que se les envió la
-- autorización, que es lo más cercano a su alta que hay; si nunca se envió,
-- quedan con la fecha de esta migración.

alter table public.ponentes add column creado_el timestamptz not null default now();

update public.ponentes
set creado_el = consentimiento_enviado_el
where consentimiento_enviado_el is not null;
