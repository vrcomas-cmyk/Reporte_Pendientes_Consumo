-- Precios: nunca más solicitudes duplicadas ni materiales «sin condición» en «Por autorizar».
--
--  1. La «base» del material (concepto = 'base', sin condición) ya no se manda a autorizar: no se publica a ningún reporte y solo ensuciaba la lista.
--     Se borran las que quedaron PENDIENTES.
--  2. Si por un doble clic o un reenvío quedó la misma solicitud pendiente varias veces (mismo material + concepto + condición), se conserva la más
--     reciente y se borran las demás. OJO: si exportaste un Excel para el director con el ID de una repetida que se borra, ese renglón dará «el ID no
--     corresponde a una propuesta pendiente» al cargarlo (el de la más reciente sí).
--  3. Índice único parcial: la base de datos rechaza una segunda solicitud PENDIENTE del mismo material + concepto + condición.
--
-- Run this once in the Supabase SQL editor for this project. Safe to re-run — every statement is idempotent.

delete from degasa_precio_propuesta where concepto = 'base' and estado = 'enviado';

delete from degasa_precio_propuesta p
using (
  select id, row_number() over (partition by material, concepto, condicion, lote order by solicitado_en desc, id) as n
  from degasa_precio_propuesta
  where estado = 'enviado'
) d
where p.id = d.id and d.n > 1;

create unique index if not exists degasa_precio_propuesta_pendiente_uq
  on degasa_precio_propuesta (material, concepto, condicion, lote)
  where estado = 'enviado';
