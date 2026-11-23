-- Fase 1 de «Envíos» en el portal: Transmisión dentro de Seg. de pedidos.
--
-- 1) Módulo `transmision`: lo ven solo los roles a los que un admin se lo conceda en Administración → Roles (un rol restringido no entra a lo que no se le concede
--    explícitamente; administradores y usuarios sin rol no tienen restricción). La función `envios` aplica la misma regla en el servidor.
-- 2) Conector `envios_apps_url`: URL /exec del Apps Script de Envíos (docs/apps-script-envios.md). Solo un admin lo lee (política degasa_connectors_read); la función `envios` lo
--    consulta con la clave de servicio y el navegador nunca lo ve.
-- Seguro de repetir.

insert into degasa_modules (key, label, sort_order) values
  ('transmision', 'Transmisión (en Seg. de pedidos)', 50)
on conflict (key) do nothing;

insert into degasa_connectors (key, label, value) values
  ('envios_apps_url', 'Apps Script · Envíos (Transmisión, DRP y mercancía sin cargo)', null)
on conflict (key) do nothing;
