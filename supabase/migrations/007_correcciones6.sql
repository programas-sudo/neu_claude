-- =========================================================
-- MIGRACIÓN 007 - Marca explícita de filas generadas automáticamente
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- =========================================================

-- Antes, una fila "salida automática" se reconocía por el texto del
-- campo destino. Ahora queda marcada con esta columna, para poder
-- recalcularla con seguridad sin confundirla con una fila real
-- cargada por el usuario.
alter table planilla_neumaticos
  add column if not exists generado_automaticamente boolean not null default false;

-- ---------------------------------------------------------
-- Fin de la migración 007
-- ---------------------------------------------------------
