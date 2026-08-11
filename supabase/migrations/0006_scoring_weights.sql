-- Módulo Oportunidades Comerciales — fase 5: pesos configurables del motor
-- de compatibilidad (core/scoring.ts). Reutiliza `degasa_connectors` (mismo
-- patrón key/value genérico que las URLs de Apps Script, ver 0002) en vez de
-- una tabla nueva — /admin → Compatibilidad los edita con
-- services/scoringWeightsService.ts. Safe to re-run.

insert into degasa_connectors (key, label, value) values
  ('scoring_weight_compro-material',     'Score · Ya compró este material',               '20'),
  ('scoring_weight_acepto-condicionado', 'Score · Ya aceptó material condicionado',        '18'),
  ('scoring_weight_compra-frecuente',    'Score · Compra con frecuencia',                  '12'),
  ('scoring_weight_alta-rotacion',       'Score · Alta rotación (clase ABC)',              '10'),
  ('scoring_weight_pedido-abierto',      'Score · Tiene pedidos abiertos',                 '12'),
  ('scoring_weight_acepta-caducidad',    'Score · Acepta esta caducidad',                  '12'),
  ('scoring_weight_acepta-condicion',    'Score · Acepta este tipo de condición',          '10'),
  ('scoring_weight_descuento-viable',    'Score · Descuento habitual alcanzable',          '8'),
  ('scoring_weight_rechazo-reciente',    'Score · Rechazó este material hace < 30 días',   '-15'),
  ('scoring_weight_sin-comprar',         'Score · Inactivo (sin comprar nada) > 6 meses',  '-10')
on conflict (key) do nothing;
