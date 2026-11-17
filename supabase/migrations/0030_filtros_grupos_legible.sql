-- 1) La fila de «grupos de cliente excluidos por defecto» (migración 0013) no existía en este proyecto: sin ella, guardar desde /admin → Filtros no persistía.
--    La app ya la crea al guardar; esto solo la deja lista con el valor por omisión (18 = GOBIERNO). Seguro de repetir.
insert into degasa_connectors (key, label, value) values
  ('filtros_grupos_excluidos', 'Filtros · Grupos de cliente excluidos por defecto', '["18"]')
on conflict (key) do nothing;

-- 2) Desde la migración 0027 solo un administrador puede LEER degasa_connectors, así que el resto de los usuarios nunca veía los grupos excluidos que el admin
--    configuró (caían siempre en el valor por omisión). Esta fila no es secreta (códigos de grupo de cliente): se permite su lectura a cualquier usuario autenticado.
drop policy if exists degasa_connectors_read on degasa_connectors;
create policy degasa_connectors_read on degasa_connectors for select to authenticated
  using (degasa_is_admin() or key = 'filtros_grupos_excluidos');
