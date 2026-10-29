-- Precios: vigencia de un precio autorizado (concursos / promociones temporales).
--
-- Un precio autorizado sin fechas rige hasta que se autorice otro (comportamiento de siempre). Con `vigente_hasta`, al pasar esa fecha el precio
-- deja de usarse y vuelve a regir el autorizado anterior de la misma combinación. Con `vigente_desde` en el futuro el precio queda programado.
-- Nada se borra: todas las autorizaciones quedan como histórico para compararlas.
--
-- Run this once in the Supabase SQL editor. Safe to re-run. Después: notify pgrst, 'reload schema';

alter table degasa_precio_propuesta add column if not exists vigente_desde date;
alter table degasa_precio_propuesta add column if not exists vigente_hasta date;
