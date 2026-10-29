-- Módulo «Ofertas y traslados»: ofertas por ejecutivo ligadas al pedido (estatus + historial) y solicitudes de traslado con envío manual.
-- Completa 0005_ofertas.sql (degasa_ofertas). Run this once in the Supabase SQL editor. Safe to re-run — every statement is idempotent.

-- ---------------------------------------------------------------------------
-- Ofertas: relación explícita con el pedido, ejecutivo/zona, estatus comercial, lote aceptado e historial de cambios.
-- `resultado` se conserva (lo lee el scoring de Oportunidades) y la app lo mantiene sincronizado con `estatus`.
-- ---------------------------------------------------------------------------
alter table degasa_ofertas add column if not exists estatus text;
alter table degasa_ofertas add column if not exists pedido text;
alter table degasa_ofertas add column if not exists solicitante text;
alter table degasa_ofertas add column if not exists centro_pedido text;
alter table degasa_ofertas add column if not exists almacen_pedido text;
alter table degasa_ofertas add column if not exists material_solicitado text;
alter table degasa_ofertas add column if not exists centro_origen text;
alter table degasa_ofertas add column if not exists almacen_origen text;
alter table degasa_ofertas add column if not exists condicion_texto text;
alter table degasa_ofertas add column if not exists ejecutivo text;
alter table degasa_ofertas add column if not exists zona text;
alter table degasa_ofertas add column if not exists lote_aceptado text;
alter table degasa_ofertas add column if not exists historial jsonb not null default '[]'::jsonb;
alter table degasa_ofertas add column if not exists updated_at timestamptz not null default now();

alter table degasa_ofertas drop constraint if exists degasa_ofertas_estatus_check;
alter table degasa_ofertas add constraint degasa_ofertas_estatus_check
  check (estatus is null or estatus in ('ofertado', 'aceptado', 'aceptado-parcial', 'rechazado'));

create index if not exists degasa_ofertas_pedido_idx on degasa_ofertas(pedido);
create index if not exists degasa_ofertas_estatus_idx on degasa_ofertas(estatus);

-- ---------------------------------------------------------------------------
-- Traslados: se preparan en la app, el usuario envía el correo A MANO y lo marca «solicitado». El seguimiento (en curso / recibido) sale de
-- Inventario · Disponibilidad contra la línea base guardada al solicitar. Nada se envía automáticamente.
-- ---------------------------------------------------------------------------
create table if not exists degasa_traslados (
  id uuid primary key default gen_random_uuid(),
  local_id bigint generated always as identity,
  oferta_id bigint,
  pedido text not null default '',
  destinatario text not null default '',
  razon_social text not null default '',
  ejecutivo text not null default '',
  zona text not null default '',
  material text not null,
  descripcion text not null default '',
  cantidad numeric not null default 0,
  um text not null default '',
  centro_origen text not null default '',
  almacen_origen text not null default '',
  centro_destino text not null default '',
  almacen_destino text not null default '',
  condicion text not null default '',
  lote text not null default '',
  comentarios text not null default '',
  destinatarios_correo jsonb not null default '[]'::jsonb,
  estatus text not null default 'preparado' check (estatus in ('preparado', 'solicitado', 'en-curso', 'recibido', 'revision', 'cancelado')),
  creado_en timestamptz not null default now(),
  creado_por text not null default '',
  solicitado_en timestamptz,
  solicitado_por text,
  base_libre numeric,
  base_transito numeric,
  base_leido_en text,
  en_curso_cant numeric,
  en_curso_leido_en text,
  recibido_cant numeric,
  recibido_leido_en text,
  nota_revision text,
  updated_at timestamptz not null default now()
);
create unique index if not exists degasa_traslados_local_id_key on degasa_traslados(local_id);
create index if not exists degasa_traslados_pedido_idx on degasa_traslados(pedido);
create index if not exists degasa_traslados_material_idx on degasa_traslados(material);
create index if not exists degasa_traslados_estatus_idx on degasa_traslados(estatus);

alter table degasa_traslados enable row level security;
drop policy if exists degasa_traslados_rw on degasa_traslados;
create policy degasa_traslados_rw on degasa_traslados for all to authenticated using (true) with check (true);

-- Destinatarios del correo de traslado (lista JSON de correos, editable desde el diálogo del correo (escribe solo un admin)). Vacío al inicio.
insert into degasa_connectors (key, label, value)
values ('filtros_traslado_destinatarios', 'Correos para solicitudes de traslado (JSON)', '[]')
on conflict (key) do nothing;

-- Módulo nuevo (el permiso por rol se asigna en Admin → Roles).
insert into degasa_modules (key, label, sort_order)
values ('ofertas-traslados', 'Ofertas y traslados', 21)
on conflict (key) do nothing;
