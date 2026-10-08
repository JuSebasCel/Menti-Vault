-- El producto pasa a ser el ciclo editorial de un evento: el ponente consiente
-- el uso de sus datos, aprueba su texto, y con lo aprobado se arman la memoria
-- del evento, la producción académica y las publicaciones.
--
-- Solo añade. Las tablas del modelo anterior (fichas, temas, chat) se borran
-- aparte, cuando la interfaz que ya no las lee esté desplegada: borrarlas antes
-- rompería la versión que está en producción.

-- El evento deja de ser solo un nombre.
alter table public.eventos
  add column if not exists descripcion text not null default '',
  add column if not exists lugar text not null default '',
  add column if not exists fecha_inicio date,
  add column if not exists fecha_fin date;

-- El ponente: a quién escribirle y qué autorizó.
--
-- `consentimiento_usos` lleva una clave por uso (grabacion, transcripcion,
-- memoria, produccion_academica, ia_de_terceros, redes) en vez de un único
-- "acepto": publicar una cita en redes es un uso distinto a la memoria, y quien
-- acepta uno puede no aceptar el otro. `consentimiento_version` guarda qué
-- texto exacto aceptó: si el texto cambia, lo aceptado antes sigue siendo
-- comprobable.
alter table public.ponentes
  add column if not exists correo text,
  add column if not exists institucion text not null default '',
  add column if not exists consentimiento text not null default 'sin-enviar'
    check (consentimiento in ('sin-enviar', 'enviado', 'aceptado', 'rechazado')),
  add column if not exists consentimiento_usos jsonb not null default '{}'::jsonb,
  add column if not exists consentimiento_version text,
  add column if not exists consentimiento_enviado_el timestamptz,
  add column if not exists consentimiento_respondido_el timestamptz;

-- La ponencia: dónde va dentro del evento y si su ponente aprobó el texto.
--
-- `agrupacion` es texto libre ("Día 1 · Mañana", "Eje 2", "Mesa de ética"):
-- cada congreso agrupa a su manera, o no agrupa, y una tabla de ejes impondría
-- una estructura que muchos eventos no tienen.
alter table public.conferencias
  add column if not exists agrupacion text not null default '',
  add column if not exists orden_en_el_evento integer not null default 0,
  add column if not exists aprobacion text not null default 'sin-enviar'
    check (aprobacion in ('sin-enviar', 'enviada', 'aprobada', 'con-cambios')),
  add column if not exists aprobacion_respondida_el timestamptz,
  add column if not exists comentario_del_ponente text not null default '';

-- La memoria guarda sus archivos y su alcance. Una memoria del evento entero
-- no es de una conferencia, así que la columna deja de ser obligatoria.
alter table public.memorias
  alter column id_conferencia drop not null,
  alter column id_plantilla drop not null,
  add column if not exists alcance text not null default 'ponencia'
    check (alcance in ('ponencia', 'agrupacion', 'evento')),
  add column if not exists evento text,
  add column if not exists archivo_pdf text,
  add column if not exists archivo_docx text;

-- Producción académica: un artículo con su recorrido entero.
--
-- `evidencias` guarda cada cita con la conferencia, el segundo y el texto
-- literal tal como está en la transcripción: es lo que permite verificar el
-- artículo sin volver a llamar al modelo. `enfoques` son las opciones que se
-- propusieron antes de escribir, con cuánto material respaldaba cada una.
create table if not exists public.producciones (
  id uuid primary key default gen_random_uuid(),
  id_dueno uuid not null references auth.users (id) on delete cascade,
  evento text not null,
  titulo text not null,
  tipo text not null default 'reflexion',
  idea text not null default '',
  enfoques jsonb not null default '[]'::jsonb,
  esquema jsonb not null default '[]'::jsonb,
  secciones jsonb not null default '[]'::jsonb,
  evidencias jsonb not null default '[]'::jsonb,
  estado text not null default 'borrador' check (estado in ('borrador', 'lista')),
  creada_el timestamptz not null default now()
);

alter table public.producciones enable row level security;

create policy "el dueño administra sus producciones"
  on public.producciones for all
  using (id_dueno = auth.uid())
  with check (id_dueno = auth.uid());

-- Publicaciones para las redes del evento, una por pieza.
create table if not exists public.publicaciones (
  id uuid primary key default gen_random_uuid(),
  id_dueno uuid not null references auth.users (id) on delete cascade,
  evento text not null,
  id_conferencia uuid references public.conferencias (id) on delete set null,
  red text not null check (red in ('linkedin', 'instagram', 'x', 'facebook')),
  formato text not null default 'cita' check (formato in ('cita', 'resumen', 'carrusel', 'anuncio')),
  texto text not null,
  cita text not null default '',
  ponente text not null default '',
  programada_para timestamptz,
  estado text not null default 'propuesta' check (estado in ('propuesta', 'aprobada', 'programada', 'publicada')),
  creada_el timestamptz not null default now()
);

alter table public.publicaciones enable row level security;

create policy "el dueño administra sus publicaciones"
  on public.publicaciones for all
  using (id_dueno = auth.uid())
  with check (id_dueno = auth.uid());
