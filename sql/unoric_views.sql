-- UNORIC - Vistas recomendadas para frontend
-- Nota: ajusta RLS/permisos según tu configuración.

-- 1) Historial de lotes
create or replace view public.vw_historial_lotes as
select
  hl.id,
  hl.id_lote,
  l.lote,
  l.etapa,
  hl.cedula_socio,
  s.socio as socio_nombre,
  hl.fecha_desde,
  hl.fecha_hasta,
  hl.activo,
  hl.created_by,
  hl.created_at
from public.unoric_historial_lotes hl
join public.unoric_lotes l on l.id_lote = hl.id_lote
join public.unoric_socios s on s.cedula = hl.cedula_socio;

-- 2) Pagos por socio (con estado calculado y monto abonado)
create or replace view public.vw_pagos_por_socio as
select
  p.id,
  p.cedula_socio,
  s.socio as socio_nombre,
  p.id_lote,
  l.lote,
  l.etapa,
  p.tipo_pago_id,
  tp.codigo as tipo_codigo,
  tp.descripcion as tipo_descripcion,
  p.descripcion,
  p.monto_esperado,
  p.periodo_desde,
  p.periodo_hasta,
  p.created_at,
  p.created_by,
  coalesce(sum(r.monto), 0)::numeric(10,2) as monto_abonado,
  case
    when coalesce(sum(r.monto), 0) = 0 then 'PENDIENTE'
    when coalesce(sum(r.monto), 0) < p.monto_esperado then 'PARCIAL'
    else 'PAGADO'
  end as estado_calculado
from public.unoric_pagos p
join public.unoric_socios s on s.cedula = p.cedula_socio
join public.unoric_tipos_pago tp on tp.id = p.tipo_pago_id
left join public.unoric_lotes l on l.id_lote = p.id_lote
left join public.unoric_pagos_registros r on r.pago_id = p.id
group by
  p.id,
  p.cedula_socio,
  s.socio,
  p.id_lote,
  l.lote,
  l.etapa,
  p.tipo_pago_id,
  tp.codigo,
  tp.descripcion,
  p.descripcion,
  p.monto_esperado,
  p.periodo_desde,
  p.periodo_hasta,
  p.created_at,
  p.created_by;

-- 3) Pagos pendientes
create or replace view public.vw_pagos_pendientes as
select *
from public.vw_pagos_por_socio
where estado_calculado <> 'PAGADO';

-- 4) Estado actual del socio (regularización + corte)
create or replace view public.vw_estado_actual_socio as
select
  s.cedula,
  s.socio as socio_nombre,
  s.celular,
  s.correo,
  s.socio_desde,
  s.estado,
  re.regularizado_hasta_anio,
  re.regularizado_hasta_fecha,
  (coalesce(re.regularizado_hasta_fecha, '1900-01-01'::date) >= '2025-11-30'::date) as regularizado_hasta_corte
from public.unoric_socios s
left join public.unoric_regularizacion_estado re
  on re.cedula_socio = s.cedula;

-- 5) Auditoría simple de pagos y registros
create or replace view public.vw_auditoria_pagos as
select
  'PAGO'::text as entidad,
  p.id as entidad_id,
  p.cedula_socio,
  p.created_at as fecha_evento,
  p.created_by,
  p.descripcion,
  p.monto_esperado::numeric(10,2) as monto
from public.unoric_pagos p
union all
select
  'REGISTRO'::text as entidad,
  r.id as entidad_id,
  p.cedula_socio,
  r.created_at as fecha_evento,
  r.created_by,
  coalesce(r.observaciones, r.referencia) as descripcion,
  r.monto::numeric(10,2) as monto
from public.unoric_pagos_registros r
join public.unoric_pagos p on p.id = r.pago_id;
