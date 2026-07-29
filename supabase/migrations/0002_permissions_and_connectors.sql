-- Roles, per-module/column/detail permissions, and admin-editable connectors.
-- Extends the existing degasa_allowed_users invite list (see useAuth.ts) with
-- a role, and adds the tables the /admin module reads and writes.
--
-- Run this once in the Supabase SQL editor for this project
-- (fiplfsuhsqibzrpvjvbx). Safe to re-run — every statement is idempotent.

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
create table if not exists degasa_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  -- An admin role bypasses every module/column/detail restriction below —
  -- there's always at least one, seeded further down, so nobody can lock
  -- every admin out at once by misconfiguring degasa_permissions.
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

insert into degasa_roles (name, is_admin)
values ('Admin', true)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- degasa_allowed_users gains a role. Existing rows default to NULL (no role
-- assigned yet = full/unrestricted access, see permissionsService.ts) so
-- turning this on never silently locks out someone already invited.
-- ---------------------------------------------------------------------------
alter table degasa_allowed_users add column if not exists role_id uuid references degasa_roles(id);
alter table degasa_allowed_users add column if not exists display_name text;

-- Seed: whoever is running this migration keeps full admin access. Adjust the
-- email below if you're applying this for a different account.
update degasa_allowed_users
set role_id = (select id from degasa_roles where name = 'Admin')
where email = 'vrcomas@gmail.com' and role_id is null;

-- ---------------------------------------------------------------------------
-- Module registry — keys match the app's route paths (see Sidebar.tsx NAV /
-- src/core/permissionsRegistry.ts). The admin UI lists whatever's in here.
-- ---------------------------------------------------------------------------
create table if not exists degasa_modules (
  key text primary key,
  label text not null,
  sort_order int not null default 0
);

insert into degasa_modules (key, label, sort_order) values
  ('dashboard', 'Panel', 0),
  ('carga', 'Carga', 1),
  ('generar', 'Generar reporte', 2),
  ('procesamiento', 'Procesamiento', 3),
  ('resultados', 'Resultados', 4),
  ('sugerencias', 'Pedidos', 5),
  ('consumo', 'Consumo', 6),
  ('resumen-sin', 'Inventario', 7),
  ('inventario', 'Inv Condición', 8),
  ('analisis', 'Análisis', 9),
  ('comodato', 'Comodato vs. Fac.', 10),
  ('solicitudes', 'Solicitudes DRP', 11),
  ('historial', 'Historial', 12),
  ('registros', 'Registros', 13),
  ('ajustes', 'Ajustes', 14)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Permission grants/denials. `subject` is either a role (subject_type='role',
-- subject_id = role id as text) or a single user override
-- (subject_type='user', subject_id = email) — an override always wins over
-- the subject's role for the same (module_key, scope, item_key).
--
-- scope='module': whole-module visibility. Opt-in — a role sees NOTHING
--   until a row grants it a module (allowed=true). This is deliberate: it's
--   much easier to reason about "which modules can Vendedor see" as a short
--   allow-list than as "everything except these".
-- scope='column' / scope='detail': opt-OUT within an already-allowed module —
--   item_key identifies a specific column (e.g. 'fuente' in Sugerencias) or a
--   specific drill-down/detail field. Default is visible; a row with
--   allowed=false hides it. See src/core/permissionsRegistry.ts for the set
--   of column/detail keys each module currently exposes.
-- ---------------------------------------------------------------------------
create table if not exists degasa_permissions (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('role', 'user')),
  subject_id text not null,
  module_key text not null references degasa_modules(key) on delete cascade,
  scope text not null check (scope in ('module', 'column', 'detail')),
  item_key text not null default '',
  allowed boolean not null default true,
  created_at timestamptz not null default now(),
  unique (subject_type, subject_id, module_key, scope, item_key)
);

-- ---------------------------------------------------------------------------
-- Connectors: the Apps Script URLs / tokens the app currently reads from
-- .env (VITE_APPSCRIPT_URL, VITE_REPORT_SHEETS_URL, ...). Admin-editable from
-- /admin so they no longer require a redeploy to change. Same trust model as
-- the rest of this client-only app — the anon key already exposes whatever
-- RLS lets it, and these values must be readable client-side anyway (the
-- browser is what calls the Apps Script endpoint directly). `value` is NOT a
-- secret store; don't put anything here you wouldn't put in a public .env.
-- ---------------------------------------------------------------------------
create table if not exists degasa_connectors (
  key text primary key,
  label text not null,
  value text,
  updated_at timestamptz not null default now(),
  updated_by text
);

insert into degasa_connectors (key, label, value) values
  ('appscript_catalog_url', 'Apps Script · Catálogo (Ejecutivos/Materiales/Inventario)', null),
  ('report_sheets_url', 'Apps Script · Reporte diario (Sugerencias/Consumo/Resumen)', null)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- degasa_is_admin(): true when the calling JWT's email belongs to a user
-- whose role has is_admin = true. SECURITY DEFINER so it can read
-- degasa_allowed_users/degasa_roles regardless of the caller's own RLS grants.
-- ---------------------------------------------------------------------------
create or replace function degasa_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from degasa_allowed_users u
    join degasa_roles r on r.id = u.role_id
    where u.email = auth.jwt() ->> 'email' and r.is_admin = true
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS: every invited (degasa_allowed_users) signed-in user can READ roles/
-- modules/permissions/connectors (small, non-secret tables — needed so the
-- app can compute its own effective access and so connector values are
-- actually usable client-side). Only admins can WRITE.
-- ---------------------------------------------------------------------------
alter table degasa_roles enable row level security;
alter table degasa_modules enable row level security;
alter table degasa_permissions enable row level security;
alter table degasa_connectors enable row level security;

drop policy if exists degasa_roles_read on degasa_roles;
create policy degasa_roles_read on degasa_roles for select to authenticated using (true);
drop policy if exists degasa_roles_admin_write on degasa_roles;
create policy degasa_roles_admin_write on degasa_roles for all to authenticated using (degasa_is_admin()) with check (degasa_is_admin());

drop policy if exists degasa_modules_read on degasa_modules;
create policy degasa_modules_read on degasa_modules for select to authenticated using (true);
drop policy if exists degasa_modules_admin_write on degasa_modules;
create policy degasa_modules_admin_write on degasa_modules for all to authenticated using (degasa_is_admin()) with check (degasa_is_admin());

drop policy if exists degasa_permissions_read on degasa_permissions;
create policy degasa_permissions_read on degasa_permissions for select to authenticated using (true);
drop policy if exists degasa_permissions_admin_write on degasa_permissions;
create policy degasa_permissions_admin_write on degasa_permissions for all to authenticated using (degasa_is_admin()) with check (degasa_is_admin());

drop policy if exists degasa_connectors_read on degasa_connectors;
create policy degasa_connectors_read on degasa_connectors for select to authenticated using (true);
drop policy if exists degasa_connectors_admin_write on degasa_connectors;
create policy degasa_connectors_admin_write on degasa_connectors for all to authenticated using (degasa_is_admin()) with check (degasa_is_admin());

-- degasa_allowed_users itself: everyone authenticated can read the list (the
-- admin Usuarios tab needs to list it, and useAuth.ts already reads a single
-- row of it pre-login-gate) but only admins can invite/edit/remove.
alter table degasa_allowed_users enable row level security;
drop policy if exists degasa_allowed_users_read on degasa_allowed_users;
create policy degasa_allowed_users_read on degasa_allowed_users for select to authenticated using (true);
drop policy if exists degasa_allowed_users_admin_write on degasa_allowed_users;
create policy degasa_allowed_users_admin_write on degasa_allowed_users for insert to authenticated with check (degasa_is_admin());
drop policy if exists degasa_allowed_users_admin_update on degasa_allowed_users;
create policy degasa_allowed_users_admin_update on degasa_allowed_users for update to authenticated using (degasa_is_admin()) with check (degasa_is_admin());
drop policy if exists degasa_allowed_users_admin_delete on degasa_allowed_users;
create policy degasa_allowed_users_admin_delete on degasa_allowed_users for delete to authenticated using (degasa_is_admin());
