-- Módulo "Análisis Directivo" (Fase 1): venta/margen aproximado y clientes
-- (altas/recuperación/penetración/deterioro), comparando dos periodos
-- mm/aaaa, filtrable por Gerente de marca — ver src/core/analisisDirectivo.ts.
-- Solo registra el módulo (degasa_modules, ver 0002_permissions_and_connectors.sql)
-- — sin tablas nuevas: todo el cálculo es en memoria sobre Resumen_Fac +
-- catálogo, ya cargados por los módulos existentes. Opt-in por rol, igual que
-- Incremento de costos (0010_incremento_costos.sql).
--
-- Run this once in the Supabase SQL editor for this project. Safe to re-run
-- — every statement is idempotent.

insert into degasa_modules (key, label, sort_order) values
  ('analisis-directivo', 'Análisis Directivo', 16)
on conflict (key) do nothing;
