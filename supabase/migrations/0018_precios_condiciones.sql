-- Precios: las condiciones "de archivo" ya no son un código fijo (LM) sino cada Status de la pestaña Revision del libro Inv_Condicion.
-- El usuario elige cuáles entran y su descuento; la combinación de condiciones es texto libre ('CC + Lento mov + PNC').
--
-- Run this once in the Supabase SQL editor for this project. Safe to re-run — every statement is idempotent.

alter table degasa_precio_markdown drop constraint if exists degasa_precio_markdown_combinacion_check;
-- Reglas de la versión anterior (LM fijo) y la combinación 'CC+PNC' sin espacios: se reemplazan por el apilado de descuentos.
delete from degasa_precio_markdown where combinacion like '%LM%';
update degasa_precio_markdown set combinacion = 'CC + PNC' where combinacion = 'CC+PNC';

create table if not exists degasa_precio_condicion (
  status text primary key,
  incluida boolean not null default false,
  pct_descuento numeric not null default 0.08 check (pct_descuento >= 0 and pct_descuento < 1),
  -- Sobreprecio mínimo sobre costo: SIEMPRE > 0 (nunca se vende a costo o menos).
  sobre_costo_min numeric not null default 0.08 check (sobre_costo_min > 0),
  updated_by text,
  updated_at timestamptz not null default now()
);

alter table degasa_precio_condicion enable row level security;
drop policy if exists degasa_precio_condicion_read on degasa_precio_condicion;
create policy degasa_precio_condicion_read on degasa_precio_condicion for select to authenticated using (true);
drop policy if exists degasa_precio_condicion_admin on degasa_precio_condicion;
create policy degasa_precio_condicion_admin on degasa_precio_condicion for all to authenticated using (degasa_is_admin()) with check (degasa_is_admin());
