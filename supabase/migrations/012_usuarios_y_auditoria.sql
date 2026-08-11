-- =========================================================
-- MIGRACIÓN 012 - Usuarios, PIN, auditoría de borrado
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- =========================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------
-- 1) USUARIOS
-- ---------------------------------------------------------
create table if not exists usuarios (
  id uuid primary key default uuid_generate_v4(),
  nombre text not null unique,
  pin_hash text not null,
  es_admin boolean not null default false,
  activo boolean not null default true,
  created_at timestamptz default now()
);

alter table usuarios enable row level security;

drop policy if exists "usuarios_select" on usuarios;
create policy "usuarios_select" on usuarios for select using (true);

drop policy if exists "usuarios_insert" on usuarios;
create policy "usuarios_insert" on usuarios for insert with check (true);

drop policy if exists "usuarios_update" on usuarios;
create policy "usuarios_update" on usuarios for update using (true) with check (true);

drop policy if exists "usuarios_delete" on usuarios;
create policy "usuarios_delete" on usuarios for delete using (true);

-- El PIN nunca se lee directo desde la app: se compara con esta función
-- (corre con permisos propios, "security definer") para no tener que
-- exponer el hash en una consulta común.
revoke select (pin_hash) on usuarios from anon, authenticated;

create or replace function verificar_pin(p_usuario_id uuid, p_pin text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select pin_hash = crypt(p_pin, pin_hash)
  from usuarios
  where id = p_usuario_id and activo = true;
$$;

create or replace function crear_o_actualizar_pin(p_usuario_id uuid, p_pin text)
returns void
language sql
security definer
set search_path = public
as $$
  update usuarios set pin_hash = crypt(p_pin, gen_salt('bf')) where id = p_usuario_id;
$$;

-- ---------------------------------------------------------
-- 2) QUIÉN CREÓ CADA PLANILLA (a partir de ahora)
-- ---------------------------------------------------------
alter table planillas
  add column if not exists creado_por_usuario_id uuid references usuarios(id) on delete set null,
  add column if not exists creado_por_usuario_nombre text; -- copia fija: si el usuario se borra despues, el nombre queda igual

-- ---------------------------------------------------------
-- 3) AUDITORÍA DE PLANILLAS BORRADAS
--    Guarda una copia completa antes de borrar, para no perder rastro.
-- ---------------------------------------------------------
create table if not exists planillas_borradas (
  id uuid primary key default uuid_generate_v4(),
  planilla_id_original uuid,
  matricula text,
  tipo text,
  fecha date,
  chofer text,
  tipo_vehiculo text,
  km numeric,
  observaciones text,
  detalle jsonb,               -- copia de todas las filas de planilla_neumaticos
  creado_por_usuario_nombre text,
  borrado_por_usuario_id uuid references usuarios(id) on delete set null,
  borrado_por_usuario_nombre text,
  borrado_at timestamptz not null default now()
);

alter table planillas_borradas enable row level security;

drop policy if exists "planillas_borradas_all" on planillas_borradas;
create policy "planillas_borradas_all" on planillas_borradas for all using (true) with check (true);

-- ---------------------------------------------------------
-- Fin de la migración 012
-- ---------------------------------------------------------
