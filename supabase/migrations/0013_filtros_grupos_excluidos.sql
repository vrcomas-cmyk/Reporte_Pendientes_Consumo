-- Grupos de cliente que los reportes excluyen por defecto en su filtro de
-- Grupo cliente (Consumo, Análisis, Análisis Directivo, Incremento). Se edita
-- en /admin → Filtros; guarda un arreglo JSON de códigos Gpo. Cte. Por
-- defecto 18 = GOBIERNO. Ver services/gruposExcluidosService.ts. Safe to re-run.

insert into degasa_connectors (key, label, value) values
  ('filtros_grupos_excluidos', 'Filtros · Grupos de cliente excluidos por defecto', '["18"]')
on conflict (key) do nothing;
