-- Reversa de 0031_rls_solo_invitados.sql: vuelve a las políticas abiertas anteriores (`using (true)`). Úsala solo si algo falla tras aplicar 0031.
begin;

do $$
declare t text;
begin
  foreach t in array array[
    'degasa_clientes_conocimiento', 'degasa_interacciones', 'degasa_observaciones', 'degasa_ofertas',
    'degasa_oportunidades', 'degasa_reglas_aceptacion', 'degasa_traslados'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_rw', t);
    execute format('create policy %I on public.%I for all using (true) with check (true)', t || '_rw', t);
  end loop;
end $$;

do $$
declare par text[];
begin
  foreach par slice 1 in array array[
    ['degasa_modules', 'degasa_modules_read'], ['degasa_permissions', 'degasa_permissions_read'], ['degasa_roles', 'degasa_roles_read'],
    ['degasa_precio_condicion', 'degasa_precio_condicion_read'], ['degasa_precio_margen_min', 'degasa_precio_margen_min_read'],
    ['degasa_precio_markdown', 'degasa_precio_markdown_read'], ['degasa_precio_politica', 'degasa_precio_politica_read'],
    ['degasa_precio_propuesta', 'degasa_precio_propuesta_read']
  ] loop
    execute format('drop policy if exists %I on public.%I', par[2], par[1]);
    execute format('create policy %I on public.%I for select using (true)', par[2], par[1]);
  end loop;
end $$;

drop policy if exists degasa_allowed_users_read on public.degasa_allowed_users;
create policy degasa_allowed_users_read on public.degasa_allowed_users for select using (true);

drop policy if exists degasa_precio_propuesta_insert on public.degasa_precio_propuesta;
create policy degasa_precio_propuesta_insert on public.degasa_precio_propuesta for insert
  with check (estado = any (array['borrador', 'enviado']) and solicitado_por = (auth.jwt() ->> 'email'));
drop policy if exists degasa_precio_propuesta_update_own on public.degasa_precio_propuesta;
create policy degasa_precio_propuesta_update_own on public.degasa_precio_propuesta for update
  using (estado = any (array['borrador', 'enviado']) and solicitado_por = (auth.jwt() ->> 'email'))
  with check (estado = any (array['borrador', 'enviado']) and solicitado_por = (auth.jwt() ->> 'email'));

drop function if exists public.degasa_is_allowed();
commit;
