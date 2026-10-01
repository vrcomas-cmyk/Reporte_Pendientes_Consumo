-- Nombres amigables de centros y almacenes (p. ej. 1001 = Tijuana, 1030 =
-- Multicanal). Reutiliza `degasa_connectors` (key/value genérico, ver 0002):
-- cada fila guarda un JSON {"codigo":"nombre"}. /admin → Nombres los edita
-- con services/nombresService.ts. Safe to re-run.

insert into degasa_connectors (key, label, value) values
  ('nombres_centros',   'Nombres · Centros',   '{}'),
  ('nombres_almacenes', 'Nombres · Almacenes', '{}')
on conflict (key) do nothing;
