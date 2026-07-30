-- =========================================================
-- MIGRACIÓN 011 - Conexión automática entre Stock y Planillas
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- =========================================================

-- Guarda qué fila de planilla fue la que retiró este neumático del
-- stock (si fue automático). Permite deshacer el retiro con seguridad
-- si esa planilla se edita o se borra esa fila después.
alter table stock_neumaticos
  add column if not exists retirado_por_planilla_neumatico_id uuid
    references planilla_neumaticos(id) on delete set null;

create index if not exists idx_stock_retirado_por
  on stock_neumaticos (retirado_por_planilla_neumatico_id);

-- ---------------------------------------------------------
-- Fin de la migración 011
-- ---------------------------------------------------------
