-- =========================================================
-- MIGRACIÓN 004 - Corrige el "empate" entre sale y entra
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- =========================================================

-- Cuando en la MISMA planilla se registran "sale" y "entra" para la
-- misma posición, ambas filas quedan con el mismo instante exacto de
-- guardado (created_at), porque se insertan juntas en una sola
-- operación. Antes, ante ese empate, la vista podía terminar eligiendo
-- cualquiera de las dos al azar — a veces "sale", mostrando la
-- posición como vacía aunque en realidad había entrado un neumático
-- nuevo. Ahora se agrega un criterio de desempate explícito:
-- "entra" siempre gana por sobre "permanece", que gana por sobre
-- "sale", cuando hay coincidencia exacta de fecha y hora.
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
  p.id as planilla_id
from planilla_neumaticos pn
join planillas p on p.id = pn.planilla_id
where pn.posicion is not null
order by
  pn.posicion,
  p.vehiculo_id,
  p.fecha desc,
  pn.created_at desc,
  case pn.accion
    when 'entra' then 2
    when 'permanece' then 1
    when 'sale' then 0
    else -1
  end desc;

-- ---------------------------------------------------------
-- Fin de la migración 004
-- ---------------------------------------------------------
