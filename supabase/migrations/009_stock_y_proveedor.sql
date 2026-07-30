-- =========================================================
-- MIGRACIÓN 009 - Stock de neumáticos + Proveedor
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- =========================================================

-- ---------------------------------------------------------
-- 1) Columna "proveedor" en el detalle de planillas. Es un dato
--    más de esa fila puntual (igual que estado, recapado, etc.):
--    no se interpreta como "fecha de compra", solo queda registrado
--    tal cual se cargó, en la fecha en que se cargó esa planilla.
-- ---------------------------------------------------------
alter table planilla_neumaticos
  add column if not exists proveedor text;

-- La vista de trayecto de un neumático también tiene que exponer el
-- proveedor de cada fila (se agrega al final, no reordena columnas).
create or replace view vw_historial_neumatico as
select
  pn.id,
  (
    coalesce(pn.marca, '') || '|' || coalesce(pn.medida, '') || '|' ||
    case
      when pn.numero_serie is not null then 'S:' || pn.numero_serie
      else 'D:' || pn.dot
    end
  ) as identificador,
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
  p.id as planilla_id,
  pn.proveedor
from planilla_neumaticos pn
join planillas p on p.id = pn.planilla_id
where (pn.numero_serie is not null or pn.dot is not null)
  and pn.hubo_cambio = true
order by p.fecha asc, pn.created_at asc, pn.orden_en_planilla asc;

-- ---------------------------------------------------------
-- 2) STOCK DE NEUMÁTICOS EN ALMACÉN
--    Es independiente de vehiculos/planillas: acá se registran los
--    neumáticos que están guardados, sin instalar en ningún equipo
--    todavía. No se relaciona automáticamente con las planillas —
--    cuando uno se instala, se "retira" del stock a mano.
-- ---------------------------------------------------------
create table if not exists stock_neumaticos (
  id uuid primary key default uuid_generate_v4(),
  marca text,
  modelo text,
  medida text,
  numero_serie text,
  dot text,
  sin_identificacion boolean default false,
  estado text,
  proveedor text,
  fecha_compra date not null default current_date,
  observaciones text,
  fecha_salida date,               -- null = todavía en stock
  destino_salida text,             -- nota libre de a dónde fue al retirarlo
  created_at timestamptz default now()
);

create index if not exists idx_stock_vigente
  on stock_neumaticos (marca, modelo, medida)
  where fecha_salida is null;

alter table stock_neumaticos enable row level security;

drop policy if exists "auth_all_stock" on stock_neumaticos;
create policy "auth_all_stock" on stock_neumaticos for all using (true) with check (true);

-- ---------------------------------------------------------
-- Fin de la migración 009
-- ---------------------------------------------------------
