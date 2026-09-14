-- =========================================================
-- MIGRACIÓN 013 - Desambiguación de neumáticos con serie/DOT repetido
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- =========================================================

-- Cuando dos neumáticos FÍSICOS DISTINTOS comparten marca + medida +
-- número de serie/DOT (pasa con varias marcas), "instancia" los separa:
-- el primero que se carga es la instancia 1, si se confirma que otro
-- es "distinto" pasa a ser la instancia 2, etc. Nunca lo escribe el
-- usuario a mano: el sistema lo asigna solo, a partir de la respuesta
-- a la pregunta "¿es el mismo que ya tenés cargado, o uno distinto?".
alter table planilla_neumaticos
  add column if not exists instancia integer not null default 1;

alter table stock_neumaticos
  add column if not exists instancia integer not null default 1;

-- La identidad completa de un neumático pasa a ser marca + medida +
-- serie/DOT + instancia. Se agrega "instancia" al final para no romper
-- el orden de columnas existente.
create or replace view vw_historial_neumatico as
select
  pn.id,
  (
    coalesce(pn.marca, '') || '|' || coalesce(pn.medida, '') || '|' ||
    case
      when pn.numero_serie is not null then 'S:' || pn.numero_serie
      else 'D:' || pn.dot
    end || '|' || pn.instancia::text
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
  pn.proveedor,
  pn.instancia
from planilla_neumaticos pn
join planillas p on p.id = pn.planilla_id
where (pn.numero_serie is not null or pn.dot is not null)
  and pn.hubo_cambio = true
order by p.fecha asc, pn.created_at asc, pn.orden_en_planilla asc;

-- El proveedor también se busca por instancia (para no mezclar el
-- proveedor de una unidad con el de otra que comparte serie/DOT).
create or replace view vw_proveedor_neumatico as
select distinct on (marca, medida, numero_serie, dot, instancia)
  marca, medida, numero_serie, dot, instancia, proveedor
from (
  select
    pn.marca, pn.medida, pn.numero_serie, pn.dot, pn.instancia, pn.proveedor,
    p.fecha, p.created_at, pn.created_at as pn_created_at
  from planilla_neumaticos pn
  join planillas p on p.id = pn.planilla_id
  where pn.proveedor is not null and pn.proveedor <> ''
) x
order by marca, medida, numero_serie, dot, instancia, fecha asc, created_at asc, pn_created_at asc;

-- El estado actual también expone la instancia y busca el proveedor
-- por instancia (antes solo cruzaba por marca+medida+serie/dot).
create or replace view vw_estado_actual as
select
  base.*,
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
    pn.reparacion,
    pn.destino,
    p.fecha as fecha_ultimo_reporte,
    p.id as planilla_id,
    pn.instancia
  from planilla_neumaticos pn
  join planillas p on p.id = pn.planilla_id
  where pn.posicion is not null
  order by pn.posicion, p.vehiculo_id, p.fecha desc, pn.created_at desc, pn.orden_en_planilla desc
) base
left join vw_proveedor_neumatico vp
  on vp.marca is not distinct from base.marca
  and vp.medida is not distinct from base.medida
  and vp.numero_serie is not distinct from base.numero_serie
  and vp.dot is not distinct from base.dot
  and vp.instancia is not distinct from base.instancia;

-- ---------------------------------------------------------
-- Fin de la migración 013
-- ---------------------------------------------------------
