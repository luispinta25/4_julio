-- Permite definir valores por tipo de pago (monto base) y tarifas por año.
--
-- IMPORTANTE:
-- - Ejecuta esto en Supabase SQL Editor.
-- - Si tienes RLS habilitado, crea políticas para esta nueva tabla similares a las de unoric_tipos_pago.

-- 1) Agregar columnas opcionales al catálogo de tipos
alter table public.unoric_tipos_pago
  add column if not exists monto_base numeric(12,2) null;

-- 2) Tarifa por año (útil para MENSUALIDAD, etc.)
create table if not exists public.unoric_tipos_pago_tarifas (
  id bigserial primary key,
  tipo_pago_id bigint not null references public.unoric_tipos_pago(id) on delete cascade,
  anio integer not null,
  monto numeric(12,2) not null,
  activo boolean not null default true,
  created_by uuid not null default auth.uid(),
  created_at timestamp with time zone not null default now(),
  constraint unoric_tipos_pago_tarifas_anio_chk check (anio >= 1900 and anio <= 2200),
  constraint unoric_tipos_pago_tarifas_monto_chk check (monto > 0)
);

create unique index if not exists unoric_tipos_pago_tarifas_tipo_anio_ux
  on public.unoric_tipos_pago_tarifas (tipo_pago_id, anio);

create index if not exists unoric_tipos_pago_tarifas_tipo_idx
  on public.unoric_tipos_pago_tarifas (tipo_pago_id);

-- 2.1) Si NO existe el tipo MENSUALIDAD, créalo.
-- Nota: en el SQL Editor, `auth.uid()` suele ser NULL, por eso debes setear `created_by`.
-- 1) Busca el UUID de tu usuario admin:
--    select id, email from auth.users order by created_at desc;
-- 2) Reemplaza TU_UUID_ADMIN abajo.
-- insert into public.unoric_tipos_pago (codigo, descripcion, afecta_obligaciones, es_regularizacion, created_by)
-- values ('MENSUALIDAD', 'Mensualidad', true, false, 'TU_UUID_ADMIN')
-- on conflict (codigo) do nothing;

-- 3) Tarifas sugeridas para MENSUALIDAD (USD por lote por mes)
-- 2019-2024: 4 USD
-- 2025: 5 USD
-- Nota importante: en el SQL Editor, `auth.uid()` suele ser NULL.
-- Por eso, al insertar tarifas debes enviar `created_by` explícitamente.
-- Reemplaza TU_UUID_ADMIN por el UUID de tu usuario admin (ej: el mismo que usaste al crear MENSUALIDAD).
--
-- Alternativa por email (si tienes permisos):
--   with admin as (select id from auth.users where email = 'admin@tu-dominio.com' limit 1)
--   ... select ..., admin.id as created_by ...

insert into public.unoric_tipos_pago_tarifas (tipo_pago_id, anio, monto, activo, created_by)
select tp.id, y.anio, y.monto, true, 'TU_UUID_ADMIN'::uuid
from public.unoric_tipos_pago tp
cross join (
  values
    (2019, 4.00::numeric),
    (2020, 4.00::numeric),
    (2021, 4.00::numeric),
    (2022, 4.00::numeric),
    (2023, 4.00::numeric),
    (2024, 4.00::numeric),
    (2025, 5.00::numeric)
) as y(anio, monto)
where upper(trim(tp.codigo)) = 'MENSUALIDAD'
on conflict (tipo_pago_id, anio)
do update set
  monto = excluded.monto,
  activo = excluded.activo;

-- Verificación rápida (si esto devuelve 0 filas, no existe el tipo MENSUALIDAD en unoric_tipos_pago)
select id, codigo, descripcion, monto_base
from public.unoric_tipos_pago
where upper(trim(codigo)) = 'MENSUALIDAD';

-- Verificación de tarifas insertadas
select t.anio, t.monto, t.activo
from public.unoric_tipos_pago_tarifas t
join public.unoric_tipos_pago tp on tp.id = t.tipo_pago_id
where upper(trim(tp.codigo)) = 'MENSUALIDAD'
order by t.anio;
