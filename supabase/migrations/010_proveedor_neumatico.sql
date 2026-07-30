-- =========================================================
-- MIGRACIÓN 010 - Proveedor como atributo del NEUMÁTICO
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- =========================================================

-- El campo "proveedor" se sigue escribiendo en una fila puntual (es el
-- único lugar donde se puede cargar un dato), pero se interpreta como
-- un atributo del neumático en sí — su origen — sin importar en qué
-- fecha se haya efectivamente anotado. Esta vista busca, para cada
-- neumático (identificado por marca+medida+serie/DOT), el proveedor
-- que se haya registrado en CUALQUIER momento de su historia.
create or replace view vw_proveedor_neumatico as
select distinct on (marca, medida, numero_serie, dot)
  marca, medida, numero_serie, dot, proveedor
from (
  select
    pn.marca,
    pn.medida,
    pn.numero_serie,
    pn.dot,
    pn.proveedor,
    p.fecha,
    p.created_at,
    pn.created_at as pn_created_at
  from planilla_neumaticos pn
  join planillas p on p.id = pn.planilla_id
  where pn.proveedor is not null and pn.proveedor <> ''
) x
order by marca, medida, numero_serie, dot, fecha asc, created_at asc, pn_created_at asc;

-- Se agrega "proveedor_origen" al estado actual: no es el proveedor de
-- la última fila (que casi siempre va a estar vacío), sino el que se
-- haya registrado en cualquier momento de la vida de ese neumático.
create or replace view vw_estado_actual as
select
  base.vehiculo_id,
  base.matricula,
  base.posicion,
  base.tiene_neumatico,
  base.marca,
  base.modelo,
  base.medida,
  base.numero_serie,
  base.dot,
  base.sin_identificacion,
  base.estado,
  base.porcentaje_desgaste,
  base.recapado,
  base.destino,
  base.fecha_ultimo_reporte,
  base.planilla_id,
  base.reparacion,
  vp.proveedor as proveedor_origen
from (
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
  order by pn.posicion, p.vehiculo_id, p.fecha desc, pn.created_at desc, pn.orden_en_planilla desc
) base
left join vw_proveedor_neumatico vp
  on vp.marca is not distinct from base.marca
  and vp.medida is not distinct from base.medida
  and vp.numero_serie is not distinct from base.numero_serie
  and vp.dot is not distinct from base.dot;

-- ---------------------------------------------------------
-- Fin de la migración 010
-- ---------------------------------------------------------
