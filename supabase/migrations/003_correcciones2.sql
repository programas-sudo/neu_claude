-- =========================================================
-- MIGRACIÓN 003 - Recalcular datos ya cargados + reafirmar Storage
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- (abrí una consulta vacía, pegá esto solo, y Run)
-- =========================================================

-- ---------------------------------------------------------
-- 1) Recalcula hubo_cambio para TODAS las filas ya guardadas,
--    comparando cada una contra la fila anterior de la MISMA
--    posición en el MISMO vehículo, en orden cronológico. Esto
--    corrige los datos de prueba que quedaron con hubo_cambio
--    en true por defecto (antes de que existiera este cálculo).
-- ---------------------------------------------------------
with ordenado as (
  select
    pn.id,
    pn.accion,
    pn.numero_serie,
    pn.dot,
    pn.estado,
    pn.porcentaje_desgaste,
    pn.recapado,
    pn.reparacion,
    lag(pn.numero_serie) over w as prev_numero_serie,
    lag(pn.dot) over w as prev_dot,
    lag(pn.estado) over w as prev_estado,
    lag(pn.porcentaje_desgaste) over w as prev_desgaste,
    lag(pn.recapado) over w as prev_recapado,
    row_number() over w as orden
  from planilla_neumaticos pn
  join planillas p on p.id = pn.planilla_id
  where pn.posicion is not null
  window w as (
    partition by p.vehiculo_id, pn.posicion
    order by p.fecha, p.created_at, pn.created_at
  )
)
update planilla_neumaticos t
set hubo_cambio = (
  case
    when o.accion in ('entra', 'sale') then true
    when o.orden = 1 then true -- primer registro de esa posición
    when coalesce(o.numero_serie, '') <> coalesce(o.prev_numero_serie, '') then true
    when coalesce(o.dot, '') <> coalesce(o.prev_dot, '') then true
    when o.porcentaje_desgaste is not null and o.prev_desgaste is not null
         and o.porcentaje_desgaste <> o.prev_desgaste then true
    when o.estado is not null and o.estado <> '' and o.prev_estado is not null and o.prev_estado <> ''
         and o.estado <> o.prev_estado then true
    when coalesce(o.prev_recapado, false) = false and o.recapado = true then true
    when o.reparacion is not null and o.reparacion <> '' then true
    else false
  end
)
from ordenado o
where o.id = t.id;

-- ---------------------------------------------------------
-- 2) Reafirma que el bucket de adjuntos existe y es público,
--    y que las políticas de Storage están puestas (por si algo
--    no se aplicó bien la vez anterior). No hace daño correrlo
--    de nuevo.
-- ---------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('adjuntos', 'adjuntos', true)
on conflict (id) do update set public = true;

drop policy if exists "adjuntos_insert" on storage.objects;
create policy "adjuntos_insert" on storage.objects
  for insert
  with check (bucket_id = 'adjuntos');

drop policy if exists "adjuntos_select" on storage.objects;
create policy "adjuntos_select" on storage.objects
  for select
  using (bucket_id = 'adjuntos');

drop policy if exists "adjuntos_delete" on storage.objects;
create policy "adjuntos_delete" on storage.objects
  for delete
  using (bucket_id = 'adjuntos');

drop policy if exists "adjuntos_update" on storage.objects;
create policy "adjuntos_update" on storage.objects
  for update
  using (bucket_id = 'adjuntos');

-- ---------------------------------------------------------
-- Fin de la migración 003
-- ---------------------------------------------------------
