-- Una memoria puede ser de un eje (o de cualquier agrupación que el evento
-- use). El nombre de la agrupación se guarda en la memoria porque es el
-- mismo texto con que las sesiones nombran su eje.
alter table public.memorias
  add column if not exists agrupacion text;
