-- Precios: autorización del director por Excel. Se exporta lo pendiente, el director regresa el archivo con «Precio autorizado» y se carga en la app
-- (ver src/core/autorizacionExcel.ts). Para saber qué cambió el director se conserva el precio que SE MANDÓ a autorizar y el archivo del que salió.
--
-- Run this once in the Supabase SQL editor for this project. Safe to re-run — every statement is idempotent.

-- Precio con el que se mandó a autorizar (al autorizar, `precio_propuesto` pasa a ser el precio AUTORIZADO).
alter table degasa_precio_propuesta add column if not exists precio_enviado numeric;
-- Nombre del archivo del director con el que se autorizó o rechazó (null = se resolvió dentro de la app).
alter table degasa_precio_propuesta add column if not exists archivo_autorizacion text;
