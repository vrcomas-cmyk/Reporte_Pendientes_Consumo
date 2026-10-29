-- Acceso por roles a los DATOS (no solo a la interfaz): zona, precio de otras zonas, costo, condiciones, caducidad y regla 1032.
-- Lo aplica la Edge Function `datos` en el servidor (supabase/functions/datos) antes de responder al navegador.
-- Todas las columnas nuevas son OPCIONALES y su valor por omisión NO restringe nada: un rol sin configurar sigue viendo lo mismo que hoy.
-- Seguro de re-ejecutar.

alter table degasa_roles add column if not exists restringir_zona boolean not null default false;
alter table degasa_roles add column if not exists ver_costo boolean not null default true;
alter table degasa_roles add column if not exists ver_precio_otras_zonas boolean not null default true;
-- null = todas las condiciones; si no, solo las listadas (p. ej. {'Corta caducidad','Lento mov'}).
alter table degasa_roles add column if not exists condiciones_permitidas text[];
-- null = sin tope; si no, {"Corta caducidad": 12} = solo lotes que vencen en menos de 12 meses.
alter table degasa_roles add column if not exists caducidad_max_meses jsonb;
-- La regla «almacén 1032 con más de 12 meses = Corta caducidad» solo la ve quien tenga esto en true.
alter table degasa_roles add column if not exists ver_regla_cc_1032 boolean not null default true;

-- Por usuario: zonas asignadas a mano (tienen prioridad sobre las del catálogo de ejecutivos por correo) y excepciones a su rol.
-- datos_override: { "restringirZona": bool, "verCosto": bool, "verPrecioOtrasZonas": bool, "condicionesPermitidas": [..]|null,
--                   "caducidadMaxMeses": {..}|null, "verReglaCC1032": bool }
alter table degasa_allowed_users add column if not exists zonas_manual text[];
alter table degasa_allowed_users add column if not exists datos_override jsonb;
