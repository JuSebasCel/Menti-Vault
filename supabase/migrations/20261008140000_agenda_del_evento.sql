-- La agenda del evento: cada ponencia es una sesión con su hora, su espacio,
-- su tipo y, si el evento los usa, su eje temático.
--
-- La estructura de un congreso no es una carpeta ("Día 1 · Mañana"): sale de
-- cuándo y dónde ocurre cada sesión. Por eso se guardan la hora y la sala, y
-- la jornada se deduce de ahí en vez de escribirse a mano. El eje es una
-- etiqueta opcional, no un nivel obligatorio: muchos eventos no tienen ejes.
alter table public.conferencias
  add column if not exists hora_inicio time,
  add column if not exists hora_fin time,
  add column if not exists sala text not null default '',
  add column if not exists tipo_de_sesion text not null default 'conferencia'
    check (tipo_de_sesion in ('conferencia', 'taller', 'panel', 'apertura', 'cierre')),
  add column if not exists eje text not null default '';
