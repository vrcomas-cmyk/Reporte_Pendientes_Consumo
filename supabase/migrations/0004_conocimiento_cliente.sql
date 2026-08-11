-- Módulo Oportunidades Comerciales — fase 2: mini-CRM interno (ficha de
-- conocimiento por cliente + observaciones libres). Complementa
-- 0003_oportunidades.sql (Oportunidad/Interacción). Safe to re-run.

-- ---------------------------------------------------------------------------
-- degasa_clientes_conocimiento — una fila por destinatario. `dest` es la
-- clave natural (unique) porque el repositorio hace upsert por ella, no por
-- el uuid `id` (el usuario nunca conoce el uuid).
-- ---------------------------------------------------------------------------
create table if not exists degasa_clientes_conocimiento (
  id uuid primary key default gen_random_uuid(),
  local_id bigint generated always as identity,
  dest text not null unique,
  razon_social text not null default '',
  condiciones_aceptadas text[] not null default '{}',
  caducidad_minima_dias int,
  descuento_habitual_pct numeric,
  contacto_nombre text not null default '',
  contacto_telefono text not null default '',
  contacto_correo text not null default '',
  canal_preferido text not null default '',
  notas_comerciales text not null default '',
  actualizado_en timestamptz not null default now(),
  actualizado_por text not null default ''
);
create unique index if not exists degasa_clientes_conocimiento_local_id_key on degasa_clientes_conocimiento(local_id);

-- ---------------------------------------------------------------------------
-- degasa_observaciones — bitácora append-only, opcionalmente ligada a un
-- material (nota de un cliente sobre un SKU concreto).
-- ---------------------------------------------------------------------------
create table if not exists degasa_observaciones (
  id uuid primary key default gen_random_uuid(),
  local_id bigint generated always as identity,
  dest text not null,
  material text,
  texto text not null default '',
  creado_en timestamptz not null default now(),
  creado_por text not null default ''
);
create unique index if not exists degasa_observaciones_local_id_key on degasa_observaciones(local_id);
create index if not exists degasa_observaciones_dest_idx on degasa_observaciones(dest);
create index if not exists degasa_observaciones_material_idx on degasa_observaciones(material);

-- ---------------------------------------------------------------------------
-- RLS — mismo criterio que 0003: conocimiento del equipo, sin aislamiento por
-- usuario, cualquier invitado (degasa_allowed_users) lee y escribe.
-- ---------------------------------------------------------------------------
alter table degasa_clientes_conocimiento enable row level security;
drop policy if exists degasa_clientes_conocimiento_rw on degasa_clientes_conocimiento;
create policy degasa_clientes_conocimiento_rw on degasa_clientes_conocimiento for all to authenticated using (true) with check (true);

alter table degasa_observaciones enable row level security;
drop policy if exists degasa_observaciones_rw on degasa_observaciones;
create policy degasa_observaciones_rw on degasa_observaciones for all to authenticated using (true) with check (true);
