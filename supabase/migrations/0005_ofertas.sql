-- Módulo Oportunidades Comerciales — fase 3: registro de ofertas. Completa
-- 0003_oportunidades.sql (Oportunidad/Interacción) y 0004_conocimiento_cliente.sql
-- (ficha de cliente). Safe to re-run.

create table if not exists degasa_ofertas (
  id uuid primary key default gen_random_uuid(),
  local_id bigint generated always as identity,
  oportunidad_id bigint references degasa_oportunidades(local_id) on delete set null,
  dest text not null,
  razon_social text not null default '',
  material text not null,
  lote text,
  condicion text not null check (condicion in ('corta-caducidad', 'lento-movimiento', 'calidad', 'danado', 'normal')),
  fecha_caducidad date,
  cantidad_ofertada numeric not null default 0,
  cantidad_aceptada numeric,
  precio_ofertado numeric not null default 0,
  precio_lista numeric,
  fecha_oferta timestamptz not null default now(),
  fecha_respuesta timestamptz,
  resultado text not null default 'pendiente' check (resultado in ('aceptada', 'rechazada', 'pendiente', 'parcial')),
  motivo_rechazo text check (motivo_rechazo in ('precio', 'caducidad', 'condicion', 'sin-necesidad', 'inventario-propio', 'otro')),
  comentario text not null default '',
  creado_por text not null default ''
);
create unique index if not exists degasa_ofertas_local_id_key on degasa_ofertas(local_id);
create index if not exists degasa_ofertas_material_idx on degasa_ofertas(material);
create index if not exists degasa_ofertas_dest_idx on degasa_ofertas(dest);
create index if not exists degasa_ofertas_oportunidad_idx on degasa_ofertas(oportunidad_id);

alter table degasa_ofertas enable row level security;
drop policy if exists degasa_ofertas_rw on degasa_ofertas;
create policy degasa_ofertas_rw on degasa_ofertas for all to authenticated using (true) with check (true);
