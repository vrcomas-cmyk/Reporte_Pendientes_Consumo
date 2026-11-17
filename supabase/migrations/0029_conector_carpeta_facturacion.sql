-- Carpeta de Drive de la que se lee la facturación (ventas + presupuesto). Se edita en /admin · Conectores
-- (acepta el ID de la carpeta o su URL completa). Vacío = el Apps Script usa su FAC_CARPETA_ID por omisión.
-- La función `datos` la lee en el servidor y se la pasa al Apps Script: el navegador nunca elige la carpeta.
insert into degasa_connectors (key, label, value) values
  ('fac_carpeta_id', 'Drive · Carpeta de Facturación (ID o URL)', null)
on conflict (key) do nothing;
