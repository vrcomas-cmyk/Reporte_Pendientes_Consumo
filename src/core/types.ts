// ---------------------------------------------------------------------------
// Pure domain types. No React, no IndexedDB, no worker/DOM dependencies here.
// ---------------------------------------------------------------------------

/** A sales executive record, from the "Ejecutivos" sheet of the sync catalog. */
export interface Ejecutivo {
  zona: string;
  ejecutivo: string;
  canal: string;
  canalVentas: string;
  codOfVtas: string;
  oficinaVentas: string;
  gpoCte: string;
  grupoCliente: string;
  region: string;
  gerenciaVentas: string;
  gerenteVentas: string;
  directorVentas: string;
  estadoLocalidad: string;
  correoElectronico: string;
  celular: string;
}

/** A SKU record, from the "Materiales" sheet of the sync catalog. */
export interface Material {
  material: string;
  textoBreve: string;
  sector: string;
  descrSector: string;
  descrGrupoArt: string;
  grupoArticulos: string;
  um: string;
  tipoMaterial: string;
  costo: number;
  cajasPorPallet: number;
  piezasUmvPorCaja: number;
  piezasPorPallet: number;
  cajasXCama: number;
  camasPorTarima: number;
  altura: number;
  lista02: number;
  lista06: number;
  condicion: string;
}

/** Consolidated inventory by material, from "InvConsolidado". */
export interface InvConsolidadoRow {
  sector: string;
  grupo: string;
  condicion: string;
  material: string;
  textoBreve: string;
  disponible31_30: number;
  disponible31_32: number;
  invByCenter: Record<string, number>;
  transitoByCenter: Record<string, number>;
  invSuma: number;
  precioOferta: number;
  importeInventario: number;
}

/** Lot-level inventory detail, from "InvDetalle" (catalog) and
 *  "Detalle Lotes Corta Caducidad" (daily report) — same shape. */
export interface InvDetalleRow {
  material: string;
  textoBreve: string;
  centro: string;
  almacen: string;
  lote: string;
  fechaCaducidad: string | null;
  cantidadDisp: number;
  precioOferta?: number;
}

/** A row from "Todas las Sugerencias" — the core pending-order suggestion feed. */
export interface Sugerencia {
  gpoCte: string;
  fecha: string;
  oc: string;
  pedido: string;
  gpoVdor: string;
  solicitante: string;
  destinatario: string;
  razonSocial: string;
  centroPedido: string;
  almacen: string;
  materialSolicitado: string;
  materialBase: string;
  descripcionSolicitada: string;
  cantidadPedido: number;
  cantidadPendiente: number;
  cantidadOfertar: number;
  precio: number;
  consumoPromedio: number;
  fuente: string;
  materialSugerido: string;
  descripcionSugerida: string;
  centroSugerido: string;
  almacenSugerido: string;
  disponible: number;
  lote: string;
  fechaCaducidad: string;
  mesesVigenciaLote: number;
  centroInv: string;
  mesesInventario: number;
  promedioConsumo12M: number;
  cantTransito: number;
  bloqueado: string;
  invByCenter: Record<string, number>;
  raw: Record<string, unknown>;
}

/** A row from "Resumen Sin Sugerencias". */
export interface ResumenSinSugerenciaRow {
  centro: string;
  almacen: string;
  pedidos: string;
  material: string;
  descripcion: string;
  cantidadPendiente: number;
  importePendiente: number;
  promedioConsumo12M: number;
  mesesInventario: number;
  sumaInventario: number;
  sumaPendiente: number;
  statusRevision: string;
  fuente: string;
  raw: Record<string, unknown>;
}

/** A row from "Reporte de Consumo". */
export interface ConsumoRow {
  centro: string;
  grpCliente: string;
  gpoVdor: string;
  solicitante: string;
  destinatario: string;
  razonSocial: string;
  material: string;
  textoMaterial: string;
  consumoActual: number;
  consumoPromedioMensual: number;
  um: string;
  tendencia: string;
  ultimoMesFacturacion: string;
  cantidadUltima: number;
  importeUltima: number;
  precioMin: number;
  precioMax: number;
  precioProm: number;
  /** Precio unitario de la última factura de este cliente para este material
   * (`Precio_unitario_ultima`) — a diferencia de precioMin/Max/Prom, que son
   * el rango histórico de ESTE cliente, este es el precio vigente hoy. Es la
   * base de la dispersión de precios entre clientes (`core/precios.ts`). */
  precioUnitarioUltima: number;
  raw: Record<string, unknown>;
}

/** A row from "Resumen_Fac" — monthly invoicing. */
export interface ResumenFacRow {
  solicitante: string;
  razonSocial: string;
  destinatario: string;
  material: string;
  textoMaterial: string;
  mesAno: string;
  cantidadFacturada: number;
  importeFacturado: number;
  gpoCte: string;
  gpoVdor: string;
  centro: string;
}

/** Sheet "roles" the app knows how to auto-detect by header signature. */
export type SheetRole =
  | 'ejecutivos'
  | 'materiales'
  | 'invConsolidado'
  | 'invDetalle'
  | 'sugerencias'
  | 'resumenSinSugerencias'
  | 'reporteConsumo'
  | 'resumenFac'
  | 'inventarioCondicion'
  | 'lotesCortaCaducidad';

export interface DetectedSheet {
  name: string;
  role: SheetRole | null;
  rowCount: number;
  headers: string[];
  /** Whether this sheet was actually parsed/loaded (may be false when the user
   * deselected it at upload time). Optional for backward compatibility. */
  loaded?: boolean;
}

/** Persisted catalog snapshot (IndexedDB). */
export interface CatalogSnapshot {
  id: 'current';
  fileName: string;
  loadedAt: string;
  ejecutivos: Ejecutivo[];
  materiales: Material[];
  invConsolidado: InvConsolidadoRow[];
  invDetalle: InvDetalleRow[];
}

/** Importe pendiente bloqueado agrupado por el motivo real de la hoja
 * ("Detenido", "Crédito", "Detenido por ambos", …) — no colapsado a un
 * booleano como hacían `HoyPage`/`comercial.ts` antes de esto. */
export interface BloqueadoMotivo {
  motivo: string;
  count: number;
  importePendiente: number;
}

/** Computed KPIs shown on the dashboard for one analysis run. */
export interface DashboardKpis {
  materialesAnalizados: number;
  ejecutivosCount: number;
  productosSinConsumo: number;
  productosCortaCaducidad: number;
  productosLentoMovimiento: number;
  inventarioTotal: number;
  valorEconomico: number;
  /** Suma de `cantidadPendiente * precio` sobre toda sugerencia con `bloqueado` no vacío. */
  bloqueadosImportePendiente: number;
  bloqueadosCount: number;
  bloqueadosPorMotivo: BloqueadoMotivo[];
}

export interface TopMaterial {
  material: string;
  descripcion: string;
  cantidadPendiente: number;
  importePendiente: number;
}

export interface TopEjecutivo {
  ejecutivo: string;
  cantidadPendiente: number;
  importePendiente: number;
  pedidos: number;
}

export interface MonthlyInvoicing {
  mes: string;
  importe: number;
  cantidad: number;
}

export interface HeatmapCell {
  rowKey: string;
  colKey: string;
  value: number;
}

export interface Inconsistency {
  type: 'material-sin-catalogo' | 'ejecutivo-sin-catalogo' | 'inventario-negativo' | 'precio-cero';
  material?: string;
  ejecutivo?: string;
  detail: string;
}

/** Full result of crossing a daily report against the cached catalog. */
export interface AnalysisResult {
  id?: number;
  fileName: string;
  processedAt: string;
  durationMs: number;
  rowCount: number;
  sheetsDetected: DetectedSheet[];
  sugerencias: Sugerencia[];
  resumenSinSugerencias: ResumenSinSugerenciaRow[];
  consumo: ConsumoRow[];
  resumenFac: ResumenFacRow[];
  inventarioCondicion: InvConsolidadoRow[];
  lotesCortaCaducidad: InvDetalleRow[];
  kpis: DashboardKpis;
  topMateriales: TopMaterial[];
  topEjecutivos: TopEjecutivo[];
  monthlyInvoicing: MonthlyInvoicing[];
  heatmap: HeatmapCell[];
  inconsistencies: Inconsistency[];
}

export interface HistoryEntry {
  id?: number;
  fileName: string;
  processedAt: string;
  durationMs: number;
  rowCount: number;
  kpis: DashboardKpis;
  /** Object key in R2 for the original xlsx, if the upload (fase 2) succeeded. */
  r2Key?: string;
}

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  id?: number;
  at: string;
  level: LogLevel;
  event: string;
  detail?: string;
}

export interface AppSettings {
  id: 'current';
  shortExpiryDays: number;
  lowStockThreshold: number;
}

/** Single source of truth for the default app settings — previously redefined
 *  verbatim in dataStore.ts, LocalReportRepository.ts and
 *  SupabaseReportRepository.ts. Keep the shape here, next to the type. */
export const DEFAULT_SETTINGS: AppSettings = { id: 'current', shortExpiryDays: 90, lowStockThreshold: 5 };

/** Canonical SAP centro codes used as the row axis of the pivot tables
 *  (Resumen_Sin and Inventario). Previously duplicated (and divergently) in
 *  mappers.ts and InventarioPage.tsx — consolidate here. */
export const CENTERS = ['1001', '1003', '1004', '1017', '1018', '1022', '1036'] as const;
export type CentroCode = (typeof CENTERS)[number];

export type ProcessingPhase = 'idle' | 'parsing' | 'detecting' | 'crossing' | 'kpis' | 'done' | 'error' | 'cancelled';

export interface ProcessingProgress {
  phase: ProcessingPhase;
  percent: number;
  message: string;
}

/** Which report page originated a DRP request — drives dedupe/badges and how
 * the request-building form is prefilled. */
export type SolicitudOrigen = 'sugerencias' | 'inventario' | 'resumenSin' | 'consumo';

/** Local sync state of a request against the Google Sheet "DRP" tab. The
 * Sheet itself (via its own formulas) fills Estatus/No. UD/Delivery — the
 * portal never writes those three columns. */
export type SolicitudSync = 'pendiente' | 'enviada' | 'error';

// ---------------------------------------------------------------------------
// Módulo Oportunidades Comerciales — entidades de conocimiento propio del
// portal (no provienen de ningún reporte). Viven aquí, junto al resto del
// dominio, porque `core/scoring.ts` y `core/oportunidad.ts` las consumen y
// `core/` no debe importar de `modules/`. Persistencia: ver
// repositories/OportunidadRepository.ts + store/conocimientoStore.ts.
// ---------------------------------------------------------------------------

export type CondicionEspecial = 'corta-caducidad' | 'lento-movimiento' | 'calidad' | 'danado' | 'normal';

export type EstadoOportunidad =
  | 'nueva' | 'en-analisis' | 'contactando' | 'negociacion'
  | 'colocada-parcial' | 'colocada-total' | 'sin-interesados' | 'campana-agresiva';

export const ESTADOS_OPORTUNIDAD: { key: EstadoOportunidad; label: string }[] = [
  { key: 'nueva', label: 'Nueva' },
  { key: 'en-analisis', label: 'En análisis' },
  { key: 'contactando', label: 'Contactando clientes' },
  { key: 'negociacion', label: 'En negociación' },
  { key: 'colocada-parcial', label: 'Colocada parcialmente' },
  { key: 'colocada-total', label: 'Colocada totalmente' },
  { key: 'sin-interesados', label: 'Sin interesados' },
  { key: 'campana-agresiva', label: 'En campaña agresiva' },
];

/** "Oportunidad Comercial": la unidad de trabajo del módulo — material + lote
 * + condición + inventario disponible, con un estado que avanza a medida que
 * se contacta a clientes. Ver bandeja en modules/oportunidades. */
export interface Oportunidad {
  id?: number;
  material: string;
  descripcion: string;
  lote?: string;
  centro?: string;
  condicion: CondicionEspecial;
  /** Snapshot al crear — permite medir cuánto se movió realmente. */
  cantidadDisponible: number;
  fechaCaducidad: string | null;
  precioOferta: number;
  estado: EstadoOportunidad;
  responsable: string;
  prioridad: 'alta' | 'media' | 'baja';
  creadaEn: string;
  actualizadaEn: string;
  cerradaEn?: string;
  cantidadColocada: number;
  notas: string;
}

export type TipoInteraccion = 'llamada' | 'correo' | 'whatsapp' | 'visita' | 'oferta' | 'nota' | 'cambio-estado';

/** Registro de conocimiento (req. 10): toda interacción con un cliente en el
 * contexto de una oportunidad queda aquí, para que el sistema "aprenda" sin
 * depender de que el usuario lo anote en su libreta. */
export interface Interaccion {
  id?: number;
  dest: string;
  oportunidadId?: number;
  material?: string;
  tipo: TipoInteraccion;
  resumen: string;
  fecha: string;
  creadoPor: string;
}

// ---------------------------------------------------------------------------
// Fase 2 del módulo Oportunidades: mini-CRM interno. La ficha de un cliente
// convierte en dato estructurado lo que hoy vive en la libreta del analista
// (qué condiciones acepta, caducidad mínima, descuento habitual, contacto).
// Clave natural = `dest` (destinatario), mismo eje que ConsumoRow/Oportunidad.
// ---------------------------------------------------------------------------

/** Ficha de conocimiento de un cliente — editable por el usuario, salvo los
 * dos campos derivados (tiempoRespuestaPromDias/tasaAceptacion), que se
 * recalculan de Oferta/Interaccion en fase 3 y aquí solo se muestran. */
export interface ClienteConocimiento {
  id?: number;
  dest: string;
  razonSocial: string;
  condicionesAceptadas: CondicionEspecial[];
  caducidadMinimaDias: number | null;
  descuentoHabitualPct: number | null;
  contactoNombre: string;
  contactoTelefono: string;
  contactoCorreo: string;
  canalPreferido: string;
  notasComerciales: string;
  tiempoRespuestaPromDias?: number;
  tasaAceptacion?: number;
  actualizadoEn: string;
  actualizadoPor: string;
}

/** Nota libre sobre un cliente, opcionalmente ligada a un material. Vive
 * separada de `notasComerciales` (la ficha) porque es una bitácora append-only,
 * no un campo que se sobrescribe. */
export interface Observacion {
  id?: number;
  dest: string;
  material?: string;
  texto: string;
  creadoEn: string;
  creadoPor: string;
}

// ---------------------------------------------------------------------------
// Fase 3 del módulo Oportunidades: registro de ofertas + timeline. Cada
// contacto real con un cliente para colocar inventario queda aquí — es la
// fuente de la que se derivan `tiempoRespuestaPromDias`/`tasaAceptacion` en
// ClienteConocimiento y de la que se alimentan los criterios de score
// `acepto-condicionado`/`rechazo-reciente` (ver core/scoring.ts).
// ---------------------------------------------------------------------------

export type ResultadoOferta = 'aceptada' | 'rechazada' | 'pendiente' | 'parcial';
export type MotivoRechazo = 'precio' | 'caducidad' | 'condicion' | 'sin-necesidad' | 'inventario-propio' | 'otro';

export const MOTIVOS_RECHAZO: { key: MotivoRechazo; label: string }[] = [
  { key: 'precio', label: 'Precio' },
  { key: 'caducidad', label: 'Caducidad insuficiente' },
  { key: 'condicion', label: 'No acepta la condición' },
  { key: 'sin-necesidad', label: 'Sin necesidad actual' },
  { key: 'inventario-propio', label: 'Tiene inventario propio' },
  { key: 'otro', label: 'Otro' },
];

export interface Oferta {
  id?: number;
  oportunidadId?: number;
  dest: string;
  razonSocial: string;
  material: string;
  lote?: string;
  condicion: CondicionEspecial;
  fechaCaducidad: string | null;
  cantidadOfertada: number;
  cantidadAceptada?: number;
  precioOfertado: number;
  /** Snapshot del precio de lista al momento de ofertar — permite calcular el
   * descuento real después, aunque el precio de lista cambie más tarde. */
  precioLista?: number;
  fechaOferta: string;
  fechaRespuesta?: string;
  resultado: ResultadoOferta;
  motivoRechazo?: MotivoRechazo;
  comentario: string;
  creadoPor: string;
}

export type EstadoMaterialAceptado = 'buen-estado' | 'danado' | 'indistinto';

export const ESTADOS_MATERIAL_ACEPTADO: { key: EstadoMaterialAceptado; label: string }[] = [
  { key: 'buen-estado', label: 'Solo buen estado' },
  { key: 'danado', label: 'Acepta dañado' },
  { key: 'indistinto', label: 'Indistinto' },
];

/** Regla de aceptación de un Destinatario — módulo "Ofertas por Cliente".
 * `material === null` es la regla global del destinatario (aplica a
 * cualquier material que no tenga un override propio); una regla con
 * `material` fijo la sobrescribe. Ver `src/core/matchingOfertas.ts` para la
 * precedencia y el matching contra un lote/material real. */
export interface ReglaAceptacion {
  id?: number;
  dest: string;
  material: string | null;
  condiciones: CondicionEspecial[];
  estadoMaterial: EstadoMaterialAceptado;
  caducidadMinimaMeses: number | null;
  activa: boolean;
  notas: string;
  actualizadoEn: string;
  actualizadoPor: string;
}

/** One row of the "DRP" Google Sheet the portal is allowed to write:
 * the 13 data columns, always sent, plus local tracking metadata.
 * Estatus, No. UD and Delivery are intentionally absent — they are filled
 * by formulas the other user maintains in the Sheet. */
export interface SolicitudDRP {
  id?: number;
  fechaSolicitud: string;
  centroOrigen: string;
  almacenOrigen: string;
  centroDestino: string;
  almacenDestino: string;
  codigo: string;
  descripcion: string;
  cantidad: number;
  um: string;
  lote: string;
  fechaCaducidad: string;
  comentarios: string;
  pedidos: string;
  /** Where in the app this request was created, and a dedupe key so the
   * originating row can show an "ya solicitada" badge. */
  origen: SolicitudOrigen;
  sourceKey: string;
  sync: SolicitudSync;
  sentAt?: string;
  error?: string;
}
