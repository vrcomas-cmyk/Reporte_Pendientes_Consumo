-- Administración → Roles y permisos: el módulo «Hoy» está en el menú pero NUNCA se registró en degasa_modules, así que a un rol con módulos
-- limitados no se le podía dar acceso (la casilla ni existía). Se registra aquí, y de paso se ordena toda la lista igual que el menú lateral.
--
-- Run this once in the Supabase SQL editor for this project. Safe to re-run — every statement is idempotent.

insert into degasa_modules (key, label, sort_order) values
  ('hoy', 'Hoy', 1)
on conflict (key) do nothing;

update degasa_modules m set sort_order = v.orden
from (values
  ('dashboard', 0), ('hoy', 1), ('carga', 2), ('resultados', 3), ('sugerencias', 4), ('seg-pedidos', 5),
  ('consumo', 6), ('facturacion', 7), ('resumen-sin', 8), ('inv-disponibilidad', 9), ('inventario', 10), ('inv-con-condicion', 11),
  ('analisis', 12), ('incremento', 13), ('precios', 14), ('comparativo', 15), ('analisis-directivo', 16), ('oportunidades', 17),
  ('comodato-libros', 18), ('comodato', 19), ('solicitudes', 20), ('historial', 21), ('registros', 22), ('ajustes', 23)
) as v(key, orden)
where m.key = v.key;
