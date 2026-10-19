-- Precios: lotes (centro|almacén|lote) que tenía cada renglón cuando se mandó a autorizar. Con eso la Calculadora avisa cuando aparece un LOTE NUEVO
-- en una combinación material+condición que ya se mandó o se autorizó (ver src/core/estatusPrecios.ts). Las propuestas anteriores quedan en null
-- (sin ese dato no se puede saber qué lotes ya se conocían, así que no generan aviso de lote nuevo).
--
-- Run this once in the Supabase SQL editor for this project. Safe to re-run — every statement is idempotent.

alter table degasa_precio_propuesta add column if not exists lotes_enviados jsonb;
