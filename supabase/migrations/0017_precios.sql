-- Módulo "Precios": política de precio base + markdown por condición de lote, con flujo de autorización — ver src/core/politicaPrecios.ts.
-- Todo precio (base, tiers y oferta por condición) nace como borrador/enviado y SOLO un admin lo autoriza; los autorizados sustituyen al
-- "Precio oferta" de los demás reportes (core/enrich.ts::preciosPorCondicion). El precio siempre debe ser > costo (CHECK).
--
-- Run this once in the Supabase SQL editor for this project. Safe to re-run — every statement is idempotent.

insert into degasa_modules (key, label, sort_order) values
  ('precios', 'Precios', 18)
on conflict (key) do nothing;

-- Parámetros por sector ('*' = global): margen mínimo y objetivo sobre precio (0–1).
create table if not exists degasa_precio_politica (
  sector text primary key,
  margen_min numeric not null check (margen_min >= 0 and margen_min < 1),
  margen_objetivo numeric not null check (margen_objetivo >= 0 and margen_objetivo < 1),
  updated_by text,
  updated_at timestamptz not null default now()
);

-- Matriz de markdown por combinación de condiciones (y tramo de meses para corta caducidad).
create table if not exists degasa_precio_markdown (
  sector text not null default '*',
  tramo_cc text not null default '' check (tramo_cc in ('','<=3','<=6','<=12')),
  pct_descuento numeric not null check (pct_descuento >= 0 and pct_descuento < 1),
  -- Sobreprecio mínimo sobre costo: SIEMPRE > 0 (nunca se vende a costo o menos).
  sobre_costo_min numeric not null check (sobre_costo_min > 0),
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (sector, combinacion, tramo_cc)
);

-- Propuestas de precio. Vigente = la última con estado 'autorizado' por (material, concepto, condicion, lote).
create table if not exists degasa_precio_propuesta (
  id uuid primary key default gen_random_uuid(),
  material text not null,
  concepto text not null check (concepto in ('base','tierA','tierC','oferta')),
  condicion text not null default '',
  lote text not null default '',
  costo_al_enviar numeric not null check (costo_al_enviar > 0),
  precio_calculado numeric not null,
  precio_propuesto numeric not null,
  estado text not null default 'borrador' check (estado in ('borrador','enviado','autorizado','rechazado')),
  solicitado_por text,
  solicitado_en timestamptz not null default now(),
  autorizado_por text,
  autorizado_en timestamptz,
  comentario text,
  -- Regla inviolable: el precio ofertable es siempre mayor que el costo.
  constraint degasa_precio_propuesta_sobre_costo check (precio_propuesto > costo_al_enviar)
);
create index if not exists degasa_precio_propuesta_material_idx on degasa_precio_propuesta (material, estado);

alter table degasa_precio_politica enable row level security;
alter table degasa_precio_markdown enable row level security;
alter table degasa_precio_propuesta enable row level security;

drop policy if exists degasa_precio_politica_read on degasa_precio_politica;
create policy degasa_precio_politica_read on degasa_precio_politica for select to authenticated using (true);
drop policy if exists degasa_precio_politica_admin on degasa_precio_politica;
create policy degasa_precio_politica_admin on degasa_precio_politica for all to authenticated using (degasa_is_admin()) with check (degasa_is_admin());

drop policy if exists degasa_precio_markdown_read on degasa_precio_markdown;
create policy degasa_precio_markdown_read on degasa_precio_markdown for select to authenticated using (true);
drop policy if exists degasa_precio_markdown_admin on degasa_precio_markdown;
create policy degasa_precio_markdown_admin on degasa_precio_markdown for all to authenticated using (degasa_is_admin()) with check (degasa_is_admin());

drop policy if exists degasa_precio_propuesta_read on degasa_precio_propuesta;
create policy degasa_precio_propuesta_read on degasa_precio_propuesta for select to authenticated using (true);
-- Cualquier usuario crea/edita SUS propuestas mientras no estén autorizadas; autorizar/rechazar es solo de admin.
drop policy if exists degasa_precio_propuesta_insert on degasa_precio_propuesta;
create policy degasa_precio_propuesta_insert on degasa_precio_propuesta for insert to authenticated
  with check (estado in ('borrador','enviado') and solicitado_por = (auth.jwt() ->> 'email'));
drop policy if exists degasa_precio_propuesta_update_own on degasa_precio_propuesta;
create policy degasa_precio_propuesta_update_own on degasa_precio_propuesta for update to authenticated
  using (estado in ('borrador','enviado') and solicitado_por = (auth.jwt() ->> 'email'))
  with check (estado in ('borrador','enviado') and solicitado_por = (auth.jwt() ->> 'email'));
drop policy if exists degasa_precio_propuesta_admin on degasa_precio_propuesta;
create policy degasa_precio_propuesta_admin on degasa_precio_propuesta for all to authenticated using (degasa_is_admin()) with check (degasa_is_admin());

-- Semilla de política (mismos valores que POLITICA_DEFECTO en src/core/politicaPrecios.ts).
insert into degasa_precio_politica (sector, margen_min, margen_objetivo) values ('*', 0.15, 0.30) on conflict (sector) do nothing;
insert into degasa_precio_markdown (sector, combinacion, tramo_cc, pct_descuento, sobre_costo_min) values
  ('*','CC','',0.10,0.05), ('*','CC','<=12',0.10,0.05), ('*','CC','<=6',0.20,0.03), ('*','CC','<=3',0.30,0.02),
  ('*','PNC','',0.15,0.03),
  ('*','CC + PNC','',0.25,0.02), ('*','CC + PNC','<=6',0.32,0.02), ('*','CC + PNC','<=3',0.40,0.02)
on conflict (sector, combinacion, tramo_cc) do nothing;
