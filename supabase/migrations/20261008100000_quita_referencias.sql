-- Las fuentes citadas salen del producto. Nunca se probaron de verdad, y la
-- bibliografía de un artículo la va a armar la producción académica con las
-- evidencias que el propio artículo use, no una lista previa por charla.
alter table public.conferencias
  drop column if exists referencias;
