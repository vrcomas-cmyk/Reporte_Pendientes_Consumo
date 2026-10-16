-- Módulo "Comparativo de periodos": periodo A vs B (mes, trimestre, año o rango) por Gerencia, Sector, Grupo de artículo y Material, con precios
-- mínimo / máximo / promedio por material — ver src/core/comparativoPeriodos.ts.
-- Solo registra el módulo (degasa_modules, ver 0002_permissions_and_connectors.sql): sin tablas nuevas, todo el cálculo es en memoria sobre la
-- facturación de los libros de Drive + el catálogo. Opt-in por rol, igual que Análisis Directivo (0011_analisis_directivo.sql).
--
-- Run this once in the Supabase SQL editor for this project. Safe to re-run — every statement is idempotent.

insert into degasa_modules (key, label, sort_order) values
  ('comparativo', 'Comparativo de periodos', 17)
on conflict (key) do nothing;
