-- =========================================================
-- MIGRACIÓN 005
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- =========================================================

-- ---------------------------------------------------------
-- 1) Nueva columna: guarda el orden real en que se cargó cada
--    fila DENTRO de su planilla (de arriba hacia abajo, tal como
--    se completó el formulario). Reemplaza al criterio anterior
--    (que adivinaba por tipo de acción) por el orden real que vos
--    cargaste: primero lo que permanece/sale, después lo que entra.
-- ---------------------------------------------------------
alter table planilla_neumaticos
  add column if not exists orden_en_planilla integer not null default 0;

-- ---------------------------------------------------------
-- 2) VISTA DE ESTADO ACTUAL: el desempate ahora usa el orden real
--    de carga en vez de un supuesto por tipo de acción. Esto
--    corrige el bug donde, al comparar contra el estado anterior,
--    a veces se tomaba la fila incorrecta cuando dos filas de la
--    misma posición se guardaron en el mismo instante.
-- ---------------------------------------------------------
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
  pn.orden_en_planilla desc;

-- ---------------------------------------------------------
-- 3) IDENTIDAD COMPUESTA DE UN NEUMÁTICO: la marca + la medida +
--    (número de serie O dot) es lo que identifica a un neumático,
--    no el número de serie/DOT solo. Antes, dos neumáticos
--    distintos que por casualidad compartían el mismo valor (uno
--    en "número de serie" y otro en "DOT", o de marcas distintas)
--    quedaban mezclados en un solo trayecto. Se corrige acá.
-- ---------------------------------------------------------
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
  p.id as planilla_id
from planilla_neumaticos pn
join planillas p on p.id = pn.planilla_id
where (pn.numero_serie is not null or pn.dot is not null)
  and pn.hubo_cambio = true
order by p.fecha asc, pn.created_at asc, pn.orden_en_planilla asc;

-- ---------------------------------------------------------
-- Fin de la migración 005
-- ---------------------------------------------------------
