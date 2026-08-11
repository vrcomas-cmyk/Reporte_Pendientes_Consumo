-- Retira los módulos "Generar reporte" y "Procesamiento" (flujo manual de
-- xlsx, reemplazado por la sincronización en vivo de reportSheetsService.ts —
-- ver AppShell.tsx). Las rutas y el nav ya se quitaron del front; esto limpia
-- el catálogo de permisos para que /admin no muestre módulos fantasma.
-- Safe to re-run.

delete from degasa_permissions where module_key in ('generar', 'procesamiento');
delete from degasa_modules where key in ('generar', 'procesamiento');
