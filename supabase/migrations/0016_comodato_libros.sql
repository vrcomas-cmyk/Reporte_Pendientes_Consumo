-- Módulo "Comodato (libros)": el mismo análisis de Comodato vs. Facturación alimentado por los libros nuevos (YBFD/ZBRE de Google Sheets +
-- facturación de los libros de Drive, por mes) — ver src/modules/comodato/ComodatoLibrosPage.tsx. Convive con "Comodato vs. Fac." para comparar.
-- Solo registra el módulo (degasa_modules, ver 0002_permissions_and_connectors.sql): sin tablas nuevas. Opt-in por rol.
--
-- Run this once in the Supabase SQL editor for this project. Safe to re-run — every statement is idempotent.

insert into degasa_modules (key, label, sort_order) values
  ('comodato-libros', 'Comodato (libros)', 18)
on conflict (key) do nothing;
