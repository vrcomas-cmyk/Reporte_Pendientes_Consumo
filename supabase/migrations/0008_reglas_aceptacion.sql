-- Módulo "Ofertas por Cliente": reglas de aceptación de material por
-- Destinatario (regla global cuando material es null, override cuando trae
-- un material específico). Completa 0003/0004/0005 (Oportunidad, ficha de
-- cliente, Oferta). Safe to re-run.

create table if not exists degasa_reglas_aceptacion (
  id uuid primary key default gen_random_uuid(),
  local_id bigint generated always as identity,
  dest text not null,
  -- '' = regla global del destinatario (aplica a cualquier material sin
  -- override propio). No nullable a propósito: un unique constraint plano
  -- (dest, material) no detecta duplicados con NULL (NULL <> NULL en
  -- Postgres), y necesitamos ON CONFLICT (dest, material) para el upsert.
  material text not null default '',
  condiciones text[] not null default '{}',
  estado_material text not null default 'indistinto' check (estado_material in ('buen-estado', 'danado', 'indistinto')),
  caducidad_minima_meses numeric,
  activa boolean not null default true,
  notas text not null default '',
  actualizado_en timestamptz not null default now(),
  actualizado_por text not null default '',
  unique (dest, material)
);
create unique index if not exists degasa_reglas_aceptacion_local_id_key on degasa_reglas_aceptacion(local_id);
create index if not exists degasa_reglas_aceptacion_dest_idx on degasa_reglas_aceptacion(dest);
create index if not exists degasa_reglas_aceptacion_material_idx on degasa_reglas_aceptacion(material);

alter table degasa_reglas_aceptacion enable row level security;
drop policy if exists degasa_reglas_aceptacion_rw on degasa_reglas_aceptacion;
create policy degasa_reglas_aceptacion_rw on degasa_reglas_aceptacion for all to authenticated using (true) with check (true);
