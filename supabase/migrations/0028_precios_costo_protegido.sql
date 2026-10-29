-- Cierra la fuga del costo: hasta ahora cualquier usuario invitado podía leer degasa_precio_propuesta.costo_al_enviar directo por la API de Supabase
-- (RLS using (true)), aunque su rol no viera costos en pantalla.
--
-- Después de esto:
--  * la columna costo_al_enviar ya no se puede leer con select directo (ni los admins);
--  * la lectura pasa por degasa_precio_propuestas(), que devuelve el costo SOLO a quien tiene permiso (admin, rol con ver_costo, o excepción del usuario)
--    y null a los demás. El resto de las columnas (precio autorizado, estado…) siguen visibles para todo invitado, como hasta hoy;
--  * insertar/actualizar propuestas sigue igual (el CHECK precio > costo se conserva).
-- APLICAR JUNTO CON la publicación de la app que usa degasa_precio_propuestas() (src/services/preciosService.ts). Requiere la 0026.
-- Seguro de re-ejecutar.

create or replace function degasa_ver_costo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case
      when r.id is null then true                       -- sin rol: sin restricciones (igual que el resto de la app)
      when r.is_admin then true
      when u.datos_override ? 'verCosto' then (u.datos_override ->> 'verCosto')::boolean
      else coalesce(r.ver_costo, true)
    end
    from degasa_allowed_users u
    left join degasa_roles r on r.id = u.role_id
    where lower(u.email) = lower(auth.jwt() ->> 'email')
    limit 1
  ), false);                                            -- no invitado: nada
$$;

create or replace function degasa_precio_propuestas()
returns setof degasa_precio_propuesta
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ver boolean := degasa_ver_costo();
  r degasa_precio_propuesta;
begin
  if not exists (select 1 from degasa_allowed_users where lower(email) = lower(auth.jwt() ->> 'email')) then
    return;
  end if;
  for r in select * from degasa_precio_propuesta order by solicitado_en desc loop
    if not ver then r.costo_al_enviar := null; end if;
    return next r;
  end loop;
end;
$$;

revoke all on function degasa_precio_propuestas() from public, anon;
grant execute on function degasa_precio_propuestas() to authenticated;
revoke all on function degasa_ver_costo() from public, anon;
grant execute on function degasa_ver_costo() to authenticated;

-- Select por columna: todas menos costo_al_enviar (la lista se arma sola para no olvidar columnas futuras).
revoke select on degasa_precio_propuesta from authenticated;
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'degasa_precio_propuesta' and column_name <> 'costo_al_enviar';
  execute format('grant select (%s) on degasa_precio_propuesta to authenticated', cols);
end $$;
