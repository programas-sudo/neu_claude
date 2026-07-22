-- =========================================================
-- SISTEMA DE TRAZABILIDAD DE NEUMÁTICOS
-- Esquema Supabase (Postgres)
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- Es seguro volver a correr fragmentos nuevos más adelante
-- (migraciones incrementales) sin crear un proyecto nuevo.
-- =========================================================

create extension if not exists "uuid-ossp";
create extension if not exists pg_trgm;

-- ---------------------------------------------------------
-- VEHÍCULOS / EQUIPOS
-- ---------------------------------------------------------
create table if not exists vehiculos (
  id uuid primary key default uuid_generate_v4(),
  matricula text not null unique,
  tipo_vehiculo text,              -- último tipo conocido (informativo, no obligatorio)
  num_posiciones int default 4,    -- 4, 6, 10, 12... referencia, no bloquea nada
  created_at timestamptz default now()
);

create index if not exists idx_vehiculos_matricula on vehiculos using gin (matricula gin_trgm_ops);

-- ---------------------------------------------------------
-- PLANILLAS (cabecera: relevamiento o movimiento)
-- ---------------------------------------------------------
create table if not exists planillas (
  id uuid primary key default uuid_generate_v4(),
  vehiculo_id uuid not null references vehiculos(id),
  matricula text not null,          -- desnormalizado para búsquedas rápidas
  tipo text not null check (tipo in ('relevamiento','movimiento')),
  fecha date not null default current_date,
  chofer text,
  tipo_vehiculo text,               -- opcional, puede pisar el de "vehiculos"
  km numeric,
  modo_carga text default 'completa' check (modo_carga in ('completa','parcial')),
  informe_automatico text,          -- generado por comparación con planilla anterior
  observaciones text,               -- texto libre del usuario
  created_at timestamptz default now(),
  created_by text
);

create index if not exists idx_planillas_matricula on planillas (matricula, fecha);
create index if not exists idx_planillas_vehiculo on planillas (vehiculo_id, fecha);

-- ---------------------------------------------------------
-- DETALLE DE NEUMÁTICOS POR PLANILLA (una fila por posición reportada)
-- ---------------------------------------------------------
create table if not exists planilla_neumaticos (
  id uuid primary key default uuid_generate_v4(),
  planilla_id uuid not null references planillas(id) on delete cascade,
  posicion text,                    -- ej "1","2","POS-3"... null si es un "sale" sin posición propia
  accion text not null check (accion in ('permanece','entra','sale')),
  marca text,
  modelo text,
  medida text,
  numero_serie text,                -- puede ser null
  dot text,                         -- puede ser null
  sin_identificacion boolean default false, -- true si no tiene ni serie ni DOT (no trazable)
  estado text,                      -- ej: bueno, regular, a cambiar, cubierta de auxilio, etc.
  porcentaje_desgaste numeric,
  recapado boolean default false,
  reparacion text,
  procedencia text,                 -- de dónde viene (si accion='entra'): "Nuevo", "Comprado usado",
                                     -- "Vehículo ABC123 - Posición 2", "Stock/Depósito"...
  destino text,                     -- a dónde va (si accion='sale'): "Vehículo XYZ - Posición 4",
                                     -- "Depósito", "Descarte/Rotura", "Recapado (taller X)"...
  created_at timestamptz default now()
);

create index if not exists idx_pn_planilla on planilla_neumaticos (planilla_id);
create index if not exists idx_pn_serie on planilla_neumaticos (numero_serie);
create index if not exists idx_pn_dot on planilla_neumaticos (dot);

-- índice de búsqueda por coincidencia (no exacta) en número de serie / dot
create index if not exists idx_pn_serie_trgm on planilla_neumaticos using gin (numero_serie gin_trgm_ops);
create index if not exists idx_pn_dot_trgm on planilla_neumaticos using gin (dot gin_trgm_ops);

-- ---------------------------------------------------------
-- ADJUNTOS (PDF, Excel, fotos) ligados a una planilla
-- Los archivos en sí se guardan en Supabase Storage (bucket "adjuntos")
-- ---------------------------------------------------------
create table if not exists adjuntos (
  id uuid primary key default uuid_generate_v4(),
  planilla_id uuid not null references planillas(id) on delete cascade,
  nombre_archivo text not null,
  storage_path text not null,       -- path dentro del bucket
  url text,                         -- URL pública para descarga directa
  tipo_archivo text,                -- pdf / excel / imagen
  created_at timestamptz default now()
);

-- ---------------------------------------------------------
-- VISTA: ESTADO ACTUAL POR VEHÍCULO Y POSICIÓN
-- Regla: para cada (vehiculo, posicion), el estado vigente es la fila
-- NO "sale" más reciente en el tiempo. Esto funciona tanto con
-- planillas completas como con movimientos parciales.
-- ---------------------------------------------------------
create or replace view vw_estado_actual as
select distinct on (pn.posicion, p.vehiculo_id)
  p.vehiculo_id,
  p.matricula,
  pn.posicion,
  pn.marca,
  pn.modelo,
  pn.medida,
  pn.numero_serie,
  pn.dot,
  pn.sin_identificacion,
  pn.estado,
  pn.porcentaje_desgaste,
  pn.recapado,
  p.fecha as fecha_ultimo_reporte,
  p.id as planilla_id
from planilla_neumaticos pn
join planillas p on p.id = pn.planilla_id
where pn.posicion is not null
  and pn.accion <> 'sale'
order by pn.posicion, p.vehiculo_id, p.fecha desc, pn.created_at desc;

-- ---------------------------------------------------------
-- VISTA: HISTORIAL COMPLETO DE UN NEUMÁTICO POR NÚMERO DE SERIE / DOT
-- ---------------------------------------------------------
create or replace view vw_historial_neumatico as
select
  pn.id,
  coalesce(pn.numero_serie, pn.dot) as identificador,
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
where pn.numero_serie is not null or pn.dot is not null
order by p.fecha asc, pn.created_at asc;

-- ---------------------------------------------------------
-- RLS (Row Level Security) básico
-- Ajustar según cómo autentiques usuarios (Supabase Auth).
-- Por ahora: acceso de lectura/escritura para usuarios autenticados.
-- Si vas a usar la app sin login, podés dejar estas políticas
-- comentadas y usar la clave "anon" (menos seguro, solo para uso interno).
-- ---------------------------------------------------------
alter table vehiculos enable row level security;
alter table planillas enable row level security;
alter table planilla_neumaticos enable row level security;
alter table adjuntos enable row level security;

drop policy if exists "auth_all_vehiculos" on vehiculos;
create policy "auth_all_vehiculos" on vehiculos for all using (true) with check (true);

drop policy if exists "auth_all_planillas" on planillas;
create policy "auth_all_planillas" on planillas for all using (true) with check (true);

drop policy if exists "auth_all_pn" on planilla_neumaticos;
create policy "auth_all_pn" on planilla_neumaticos for all using (true) with check (true);

drop policy if exists "auth_all_adjuntos" on adjuntos;
create policy "auth_all_adjuntos" on adjuntos for all using (true) with check (true);

-- NOTA: estas policies son permisivas (para arrancar rápido). Cuando quieras
-- restringir por usuario/rol, las reemplazás por nuevas sentencias "create policy"
-- en el mismo SQL Editor, sin tocar el resto del esquema.

-- ---------------------------------------------------------
-- BUCKET DE STORAGE PARA ADJUNTOS
-- (correr una sola vez; si ya existe, da error inofensivo)
-- ---------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('adjuntos', 'adjuntos', true)
on conflict (id) do nothing;
