-- =========================================================
-- MIGRACIÓN 006 - Permiso de lectura sobre el bucket de Storage
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- =========================================================

-- Reafirma que el bucket existe y es público (no hace daño repetirlo).
insert into storage.buckets (id, name, public)
values ('adjuntos', 'adjuntos', true)
on conflict (id) do update set public = true;

-- Permite consultar la información del bucket (antes solo se podía
-- leer/escribir/borrar los ARCHIVOS de adentro, pero no consultar el
-- bucket en sí — esto hacía que un chequeo previo del sistema diera
-- un falso "no existe" aunque el bucket estuviera bien creado).
drop policy if exists "adjuntos_bucket_select" on storage.buckets;
create policy "adjuntos_bucket_select" on storage.buckets
  for select
  using (id = 'adjuntos');

-- ---------------------------------------------------------
-- Fin de la migración 006
-- ---------------------------------------------------------
