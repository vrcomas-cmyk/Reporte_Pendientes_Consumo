-- Módulo Oportunidades Comerciales (Centro de Inteligencia Comercial) — fase 1.
-- Persiste la entidad "Oportunidad" (material + lote + condición + inventario
-- disponible) y su bitácora de interacciones. El conocimiento de cliente
-- (fichas, ofertas) llega en fases 2-3 con su propia migración.
--
-- Run this once in the Supabase SQL editor for this project. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Registro de módulo — sin esta fila, ningún rol no-admin verá "Oportunidades"
-- en el sidebar (scope='module' es opt-in, ver 0002_permissions_and_connectors.sql).
-- ---------------------------------------------------------------------------
insert into degasa_modules (key, label, sort_order) values
  ('oportunidades', 'Oportunidades', 10)
on conflict (key) do nothing;

-- Reordena lo que venía después de "Análisis" (10) para dejar hueco.
update degasa_modules set sort_order = sort_order + 1
where key in ('comodato', 'solicitudes', 'historial', 'registros', 'ajustes') and sort_order >= 10;

-- ---------------------------------------------------------------------------
-- degasa_oportunidades — la unidad de trabajo de la bandeja. `local_id` es un
-- bigint autoincremental además del uuid `id`, porque el repositorio local
-- (Dexie, fallback offline) usa claves numéricas — mismo patrón que
-- degasa_history/degasa_logs no necesitan pero aquí sí, por el espejo local.
-- ---------------------------------------------------------------------------
create table if not exists degasa_oportunidades (
  id uuid primary key default gen_random_uuid(),
  local_id bigint generated always as identity,
  material text not null,
  descripcion text not null default '',
  lote text,
  centro text,
  condicion text not null check (condicion in ('corta-caducidad', 'lento-movimiento', 'calidad', 'danado', 'normal')),
  cantidad_disponible numeric not null default 0,
  fecha_caducidad date,
  precio_oferta numeric not null default 0,
  estado text not null default 'nueva' check (estado in (
    'nueva', 'en-analisis', 'contactando', 'negociacion',
    'colocada-parcial', 'colocada-total', 'sin-interesados', 'campana-agresiva'
  )),
  responsable text not null default '',
  prioridad text not null default 'media' check (prioridad in ('alta', 'media', 'baja')),
  creada_en timestamptz not null default now(),
  actualizada_en timestamptz not null default now(),
  cerrada_en timestamptz,
  cantidad_colocada numeric not null default 0,
  notas text not null default ''
);
create unique index if not exists degasa_oportunidades_local_id_key on degasa_oportunidades(local_id);
create index if not exists degasa_oportunidades_material_idx on degasa_oportunidades(material);
create index if not exists degasa_oportunidades_estado_idx on degasa_oportunidades(estado);

-- ---------------------------------------------------------------------------
-- degasa_interacciones — bitácora de conocimiento (req. 10): cada cambio de
-- estado de una Oportunidad, y a futuro cada llamada/oferta, queda aquí.
-- ---------------------------------------------------------------------------
create table if not exists degasa_interacciones (
  id uuid primary key default gen_random_uuid(),
  local_id bigint generated always as identity,
  dest text not null default '',
  oportunidad_id bigint references degasa_oportunidades(local_id) on delete cascade,
  material text,
  tipo text not null check (tipo in ('llamada', 'correo', 'whatsapp', 'visita', 'oferta', 'nota', 'cambio-estado')),
  resumen text not null default '',
  fecha timestamptz not null default now(),
  creado_por text not null default ''
);
create unique index if not exists degasa_interacciones_local_id_key on degasa_interacciones(local_id);
create index if not exists degasa_interacciones_dest_fecha_idx on degasa_interacciones(dest, fecha desc);
create index if not exists degasa_interacciones_oportunidad_idx on degasa_interacciones(oportunidad_id);

-- ---------------------------------------------------------------------------
-- RLS — el conocimiento es del equipo: cualquier usuario invitado
-- (degasa_allowed_users, ver 0002) puede leer y escribir, igual que
-- degasa_connectors. No hay aislamiento por usuario: es intencional.
-- ---------------------------------------------------------------------------
alter table degasa_oportunidades enable row level security;
drop policy if exists degasa_oportunidades_rw on degasa_oportunidades;
create policy degasa_oportunidades_rw on degasa_oportunidades for all to authenticated using (true) with check (true);

alter table degasa_interacciones enable row level security;
drop policy if exists degasa_interacciones_rw on degasa_interacciones;
create policy degasa_interacciones_rw on degasa_interacciones for all to authenticated using (true) with check (true);
