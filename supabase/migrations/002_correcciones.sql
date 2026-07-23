-- =========================================================
-- MIGRACIÓN 002 - CORRECCIONES
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- Se puede correr una sola vez, sobre el mismo proyecto de siempre.
-- =========================================================

-- ---------------------------------------------------------
-- 1) Marca si una fila representa un CAMBIO real (posición,
--    estado o desgaste) respecto al reporte anterior. Se usa
--    para no ensuciar el historial de un neumático con
--    controles donde "no pasó nada".
-- ---------------------------------------------------------
alter table planilla_neumaticos
  add column if not exists hubo_cambio boolean not null default true;

-- ---------------------------------------------------------
-- 2) VISTA DE ESTADO ACTUAL: ahora toma la última fila de
--    cada posición SIN IMPORTAR la acción (antes ignoraba las
--    filas "sale", lo que hacía que una posición sin reemplazo
--    directamente desapareciera en vez de mostrar "sin neumático").
--    Se agrega la columna tiene_neumatico para que la app
--    distinga cuándo mostrar "Sin neumático".
--    (Se borra y se vuelve a crear porque Postgres no permite
--    cambiar el orden/nombre de columnas con CREATE OR REPLACE.)
-- ---------------------------------------------------------
drop view if exists vw_estado_actual;
create view vw_estado_actual as
select distinct on (pn.posicion, p.vehiculo_id)
  p.vehiculo_id,
  p.matricula,
  pn.posicion,
  (pn.accion <> 'sale') as tiene_neumatico,
  pn.marca,
  pn.modelo,
  pn.medida,
  pn.numero_serie,
  pn.dot,
  pn.sin_identificacion,
  pn.estado,
  pn.porcentaje_desgaste,
  pn.recapado,
  pn.destino,
  p.fecha as fecha_ultimo_reporte,
  p.id as planilla_id
from planilla_neumaticos pn
join planillas p on p.id = pn.planilla_id
where pn.posicion is not null
order by pn.posicion, p.vehiculo_id, p.fecha desc, pn.created_at desc;

-- ---------------------------------------------------------
-- 3) VISTA DE HISTORIAL DE UN NEUMÁTICO: ahora excluye las
--    filas sin cambios reales (hubo_cambio = false), para que
--    el trayecto solo muestre eventos relevantes.
-- ---------------------------------------------------------
drop view if exists vw_historial_neumatico;
create view vw_historial_neumatico as
select
  pn.id,
  coalesce(pn.numero_serie, pn.dot) as identificador,
  pn.numero_serie,
  pn.dot,
  p.matricula,
  p.vehiculo_id,
  pn.posicion,
  pn.accion,
  pn.marca,
  pn.modelo,
  pn.medida,
  pn.estado,
  pn.porcentaje_desgaste,
  pn.recapado,
  pn.reparacion,
  pn.procedencia,
  pn.destino,
  p.fecha,
  p.tipo as tipo_planilla,
  p.id as planilla_id
from planilla_neumaticos pn
join planillas p on p.id = pn.planilla_id
where (pn.numero_serie is not null or pn.dot is not null)
  and pn.hubo_cambio = true
order by p.fecha asc, pn.created_at asc;

-- ---------------------------------------------------------
-- 4) POLÍTICAS DE STORAGE: esto es lo que faltaba y causaba
--    el error "new row violates row-level security policy" al
--    subir un adjunto. El bucket existía pero no tenía permisos.
-- ---------------------------------------------------------
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

-- ---------------------------------------------------------
-- Fin de la migración 002
-- ---------------------------------------------------------
