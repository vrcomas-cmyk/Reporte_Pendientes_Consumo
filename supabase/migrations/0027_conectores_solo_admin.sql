-- APLICAR AL FINAL, cuando ya esté desplegada la función `datos`, el Apps Script exija el token y la app nueva esté publicada:
-- después de esto solo los admins pueden leer las URLs de los conectores (hasta hoy las leía cualquier usuario invitado, y con la URL
-- se podía pedir TODO el libro sin pasar por ninguna regla). La función `datos` las lee con la service role.
-- Los admins las siguen viendo y editando desde Administración › Conectores.
drop policy if exists degasa_connectors_read on degasa_connectors;
create policy degasa_connectors_read on degasa_connectors for select to authenticated using (degasa_is_admin());
