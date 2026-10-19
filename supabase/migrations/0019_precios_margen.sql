-- Precios v2: el descuento deja de ser % del precio y pasa a ser "% del MARGEN que se cede" (precio = costo + (base − costo) × (1 − cede)), y el
-- piso deja de ser un sobreprecio sobre costo para ser un MARGEN MÍNIMO sobre precio (piso = costo / (1 − margen mínimo)) que se puede decidir
-- por material, grupo de artículos, sector o condición. Ver src/core/politicaPrecios.ts.
--
-- OJO: los valores anteriores significaban otra cosa (% del precio / sobreprecio), así que las reglas y las condiciones se REINICIAN a los nuevos
-- valores de arranque. Los Status incluidos se conservan.
-- Run this once in the Supabase SQL editor for this project. Safe to re-run — every statement is idempotent.

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'degasa_precio_markdown' and column_name = 'pct_descuento') then
    alter table degasa_precio_markdown rename column pct_descuento to pct_cede;
    alter table degasa_precio_markdown rename column sobre_costo_min to margen_min;
    delete from degasa_precio_markdown;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'degasa_precio_condicion' and column_name = 'pct_descuento') then
    alter table degasa_precio_condicion rename column pct_descuento to pct_cede;
    alter table degasa_precio_condicion rename column sobre_costo_min to margen_min;
    update degasa_precio_condicion set pct_cede = 0.30, margen_min = 0.05;
  end if;
end $$;

insert into degasa_precio_markdown (sector, combinacion, tramo_cc, pct_cede, margen_min) values
  ('*','CC','',0.25,0.05), ('*','CC','<=12',0.25,0.05), ('*','CC','<=6',0.50,0.03), ('*','CC','<=3',0.75,0.02),
  ('*','PNC','',0.40,0.03)
on conflict (sector, combinacion, tramo_cc) do nothing;

-- Base y precio que se mandó a autorizar: permite mostrar (y recalcular al revés) descuento, % del margen cedido y margen.
alter table degasa_precio_propuesta add column if not exists base_al_enviar numeric;

-- Margen mínimo que se quiere ganar, por material, grupo de artículos o sector (y opcionalmente solo para una condición: '' = cualquiera).
create table if not exists degasa_precio_margen_min (
  ambito text not null check (ambito in ('material','grupo','sector')),
  clave text not null,
  condicion text not null default '',
  -- SIEMPRE > 0: nunca se vende a costo o menos.
  margen_min numeric not null check (margen_min > 0 and margen_min < 1),
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (ambito, clave, condicion)
);
alter table degasa_precio_margen_min enable row level security;
drop policy if exists degasa_precio_margen_min_read on degasa_precio_margen_min;
create policy degasa_precio_margen_min_read on degasa_precio_margen_min for select to authenticated using (true);
drop policy if exists degasa_precio_margen_min_admin on degasa_precio_margen_min;
create policy degasa_precio_margen_min_admin on degasa_precio_margen_min for all to authenticated using (degasa_is_admin()) with check (degasa_is_admin());
