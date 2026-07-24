-- =========================================================
-- MIGRACIÓN 008 - Agrega "reparación" al estado actual
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- =========================================================

-- Se agrega pn.reparacion al final de la lista de columnas — no cambia
-- ni reordena las columnas existentes, así que no hace falta borrar la
-- vista primero.
create or replace view vw_estado_actual as
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
  p.id as planilla_id,
  pn.reparacion
from planilla_neumaticos pn
join planillas p on p.id = pn.planilla_id
where pn.posicion is not null
order by
  pn.posicion,
  p.vehiculo_id,
  p.fecha desc,
  pn.created_at desc,
  pn.orden_en_planilla desc;

-- ---------------------------------------------------------
-- Fin de la migración 008
-- ---------------------------------------------------------
