-- Cuentas de demostración: las que se usan para enseñar el producto en vivo.
--
-- Entran aunque la app esté cerrada para los demás —se presentan justo
-- cuando está cerrada— pero no son administración: no pueden abrirla ni
-- cerrarla, ni apagar el modo demostración. Por eso es una tabla aparte y no
-- una fila más en `administradores`, que daría los dos poderes juntos.
--
-- Las filas se siembran a mano (los ids de auth cambian entre proyectos);
-- nadie se puede añadir a sí mismo porque no hay política de escritura.

create table public.cuentas_de_demostracion (
  id_usuario uuid primary key references auth.users (id) on delete cascade
);

alter table public.cuentas_de_demostracion enable row level security;

create policy "cada quien ve si su cuenta es de demostración" on public.cuentas_de_demostracion
  for select to authenticated
  using (id_usuario = auth.uid());
