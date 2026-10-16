-- Módulo "Seg. de pedidos": registra el módulo y su conector de Apps Script en las tablas ya existentes
-- (degasa_modules / degasa_connectors, ver 0002_permissions_and_connectors.sql) — sin tablas nuevas: los
-- libros de Google Sheets (Seg pedidos, Disponibilidad, Inv_Condicion) viven locales (Dexie `pedidosCache`),
-- no en Supabase.
--
-- NO se ha aplicado. Run this once in the Supabase SQL editor for this project cuando se decida publicar
-- el módulo. Safe to re-run — every statement is idempotent. Mientras tanto el admin ve todos los módulos y
-- la URL puede venir de VITE_PEDIDOS_URL (respaldo de `getConnector`).

insert into degasa_modules (key, label, sort_order) values
  ('seg-pedidos', 'Seg. de pedidos', 6),
  ('inv-disponibilidad', 'Inventario · Disponibilidad', 7),
  ('inv-con-condicion', 'Inv con Condición', 8),
  ('facturacion', 'Facturación', 9)
on conflict (key) do nothing;

insert into degasa_connectors (key, label, value) values
  ('pedidos_sheets_url', 'Apps Script · Seg. de pedidos', null)
on conflict (key) do nothing;
