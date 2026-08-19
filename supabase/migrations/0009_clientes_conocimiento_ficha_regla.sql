-- Módulo Oportunidades — fusión ficha + reglas: a partir de aquí la ficha de
-- cliente (degasa_clientes_conocimiento) ES la regla global de aceptación, y
-- degasa_reglas_aceptacion solo guarda excepciones por material (material != '').
-- Añade a la ficha los campos que el repositorio ya persiste. Safe to re-run.
--
-- Nota: las reglas globales legacy (degasa_reglas_aceptacion con material = '')
-- NO se migran aquí: la app lo hace idempotentemente en `hydrate`
-- (conocimientoStore) fusionándolas en la ficha y borrándolas.

alter table degasa_clientes_conocimiento
  add column if not exists estado_material text not null default 'indistinto'
    check (estado_material in ('buen-estado', 'danado', 'indistinto')),
  add column if not exists activa boolean not null default true;

-- Las filas existentes heredan los defaults de la app ('indistinto' / activa = true).
-- No hace falta tocar RLS: 0004 ya abre la tabla entera a authenticated con `*`.