# Ofertas y traslados

Módulo `/ofertas-traslados` (permiso `ofertas-traslados`, migración `supabase/migrations/0024_ofertas_traslados.sql`, que corre el usuario en el SQL editor).

## Flujo
1. **Generar ofertas**: filtra ejecutivos/zonas y «Considerar centros», pulsa *Generar ofertas*. Cada pedido pendiente (no bloqueado) con su material se cruza con lo ofertable (`modules/analytics/filasOfertables.ts`, la misma lógica de «Lotes, condiciones y materiales ofertables», con precio autorizado por condición). Una línea por pedido × lote. Un Excel por ejecutivo + zona (`lib/ofertaEjecutivoXlsx.ts`, contenido en `core/ofertaEjecutivoExcel.ts`). *Registrar* guarda las líneas como ofertas con estatus **Ofertado** (las ya registradas se omiten).
2. **Seguimiento de ofertas**: estatus manual Ofertado / Aceptado / Aceptado parcial / Rechazado, con cantidad y lote aceptados e historial (`degasa_ofertas.historial`). Alerta si el destinatario ya aceptó antes ese material (también en el detalle de pedido).
3. **Traslados**: desde una oferta aceptada se prepara el traslado (queda *Preparado*). *Preparar correo* muestra destinatarios, asunto y cuerpo para **copiar**; el correo NUNCA se envía desde la app. Solo «Ya envié este correo» + *Marcar como Solicitado* cambia el estatus y guarda la línea base de Disponibilidad. Los destinatarios predeterminados viven en `degasa_connectors` (`filtros_traslado_destinatarios`, solo escribe un admin).

## Seguimiento con Inventario · Disponibilidad (`core/seguimientoTraslado.ts`)
Se compara contra la línea base (libre en el centro/almacén destino + tránsito hacia el centro) guardada al marcar *Solicitado*, cada vez que se descarga un Disponibilidad **más nuevo** (`store/trasladosStore.ts`, suscripción a `usePedidosStore`):
- tránsito hacia el destino sube → **En curso** (piezas = diferencia);
- libre del destino sube ≥ lo solicitado → **Recibido** (cantidad detectada y fecha de la descarga);
- aumento menor, o el tránsito desaparece sin subir el libre → **Pendiente de revisión** (el usuario confirma a mano).

## Límites de los datos
Disponibilidad no trae lote, ni una columna «En curso» propia, ni historia, ni fecha propia (se usa la de descarga). El tránsito viene por centro (no por almacén) y el libre por centro/almacén. Un aumento de libre puede deberse a otros movimientos: por eso lo ambiguo no se marca recibido. Nunca se atribuye lote a la recepción.
