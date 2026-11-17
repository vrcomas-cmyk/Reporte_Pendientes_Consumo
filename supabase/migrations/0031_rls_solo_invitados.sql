-- =====================================================================================================================================================
-- 0031 · RLS: solo los usuarios INVITADOS (degasa_allowed_users) pueden leer / escribir las tablas del portal.
--
-- Problema: este proyecto de Supabase es COMPARTIDO con otras apps (crm_*, pdt_*, pnp_*, msc_*, portal_*...). Varias tablas degasa_* tienen políticas
-- `using (true)` para cualquier usuario autenticado, así que cualquier cuenta de otra app (hoy hay 12 de 24 que no están invitadas) puede leer y ESCRIBIR
-- oportunidades, ofertas, traslados, interacciones, precios y permisos con solo la clave anon. La lista de invitados solo se aplicaba en el navegador.
--
-- Qué hace:
--   1. Crea degasa_is_allowed(): ¿el correo del JWT está en degasa_allowed_users? (sin distinguir mayúsculas; SECURITY DEFINER para no depender de RLS).
--   2. Las 7 tablas `*_rw using (true)` pasan a exigir degasa_is_allowed() (lectura y escritura).
--   3. Las políticas de LECTURA `using (true)` (módulos, permisos, roles, precios) pasan a exigir degasa_is_allowed().
--   4. degasa_allowed_users: un invitado solo lee SU fila (ya existía «can check own email only»); la lista completa queda solo para administradores.
--   5. Las políticas de propuestas de precio también exigen ser invitado.
--
-- Qué NO toca: las funciones Edge (usan service role y ya validan la lista), las tablas de otras apps, ni degasa_connectors (ver 0030).
-- Probado contra los datos actuales: ningún usuario con datos en el portal queda fuera (todos están invitados).
-- Reversa: supabase/rollback/0031_rollback.sql
-- =====================================================================================================================================================
begin;

-- 1) ¿Está invitado quien hace la consulta?
create or replace function public.degasa_is_allowed()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from degasa_allowed_users u
    where lower(u.email) = lower(auth.jwt() ->> 'email')
  );
$$;
revoke all on function public.degasa_is_allowed() from public, anon;
grant execute on function public.degasa_is_allowed() to authenticated;

-- 2) Tablas de trabajo: lectura y escritura solo para invitados.
do $$
declare t text;
begin
  foreach t in array array[
    'degasa_clientes_conocimiento', 'degasa_interacciones', 'degasa_observaciones', 'degasa_ofertas',
    'degasa_oportunidades', 'degasa_reglas_aceptacion', 'degasa_traslados'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_rw', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select public.degasa_is_allowed())) with check ((select public.degasa_is_allowed()))',
      t || '_rw', t);
  end loop;
end $$;

-- 3) Catálogos / políticas de precio / permisos: lectura solo para invitados (la escritura de admin no cambia).
do $$
declare par text[];
begin
  foreach par slice 1 in array array[
    ['degasa_modules', 'degasa_modules_read'],
    ['degasa_permissions', 'degasa_permissions_read'],
    ['degasa_roles', 'degasa_roles_read'],
    ['degasa_precio_condicion', 'degasa_precio_condicion_read'],
    ['degasa_precio_margen_min', 'degasa_precio_margen_min_read'],
    ['degasa_precio_markdown', 'degasa_precio_markdown_read'],
    ['degasa_precio_politica', 'degasa_precio_politica_read'],
    ['degasa_precio_propuesta', 'degasa_precio_propuesta_read']
  ] loop
    execute format('drop policy if exists %I on public.%I', par[2], par[1]);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.degasa_is_allowed()))', par[2], par[1]);
  end loop;
end $$;

-- 4) Lista de invitados: cada quien lee SU fila (política existente «can check own email only»); la lista completa, solo administradores.
drop policy if exists degasa_allowed_users_read on public.degasa_allowed_users;
create policy degasa_allowed_users_read on public.degasa_allowed_users for select to authenticated using (public.degasa_is_admin());

-- 5) Propuestas de precio: además de ser el solicitante, hay que estar invitado.
drop policy if exists degasa_precio_propuesta_insert on public.degasa_precio_propuesta;
create policy degasa_precio_propuesta_insert on public.degasa_precio_propuesta for insert to authenticated
  with check ((select public.degasa_is_allowed()) and estado = any (array['borrador', 'enviado']) and solicitado_por = (auth.jwt() ->> 'email'));
drop policy if exists degasa_precio_propuesta_update_own on public.degasa_precio_propuesta;
create policy degasa_precio_propuesta_update_own on public.degasa_precio_propuesta for update to authenticated
  using ((select public.degasa_is_allowed()) and estado = any (array['borrador', 'enviado']) and solicitado_por = (auth.jwt() ->> 'email'))
  with check ((select public.degasa_is_allowed()) and estado = any (array['borrador', 'enviado']) and solicitado_por = (auth.jwt() ->> 'email'));

commit;
