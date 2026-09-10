-- Módulo "Incremento de costos": registra el módulo y su conector de Apps
-- Script en las tablas ya existentes (degasa_modules / degasa_connectors,
-- ver 0002_permissions_and_connectors.sql) — sin tablas nuevas, el dataset
-- en sí vive local (Dexie), no en Supabase.
--
-- Run this once in the Supabase SQL editor for this project
-- (fiplfsuhsqibzrpvjvbx). Safe to re-run — every statement is idempotent.

insert into degasa_modules (key, label, sort_order) values
  ('incremento', 'Incremento de costos', 15)
on conflict (key) do nothing;

insert into degasa_connectors (key, label, value) values
  ('incremento_costos_url', 'Apps Script · Incremento de costos', null)
on conflict (key) do nothing;
