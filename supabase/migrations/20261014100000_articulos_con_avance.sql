-- Los artículos dejan de ser una demostración: cada paso lo hace el modelo
-- en segundo plano y deja su avance en la fila, como las memorias.
--
-- `estado` gana los pasos intermedios. Los de trabajo (`buscando`,
-- `esquematizando`, `redactando`) son los que la interfaz consulta hasta que
-- cambian; los de espera (`eligiendo`, `esquema`) son los que piden una
-- decisión a quien escribe. `borrador` se queda por las filas de ejemplo que
-- ya existen.
alter table public.producciones drop constraint if exists producciones_estado_check;

alter table public.producciones
  add constraint producciones_estado_check check (
    estado in ('borrador', 'buscando', 'eligiendo', 'esquematizando', 'esquema', 'redactando', 'lista', 'fallida')
  );

-- Las ponencias que entran, con la clave (P1, P2…) con que el modelo las
-- llamó al proponer los enfoques: los pasos siguientes tienen que llamarlas
-- igual. El enfoque elegido se guarda entero porque guía el esquema y la
-- redacción. `fallo` es el mensaje ya redactado de por qué un paso no salió.
alter table public.producciones
  add column if not exists ponencias jsonb not null default '[]'::jsonb,
  add column if not exists enfoque jsonb,
  add column if not exists fallo text not null default '';
