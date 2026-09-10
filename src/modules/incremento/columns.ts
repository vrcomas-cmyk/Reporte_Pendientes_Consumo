import type { ColDef } from '@/modules/analytics/ui';

/** Definición de columnas de la tabla "Impacto por SKU" del módulo
 * Incremento de costos — `useColumnVisibility('incremento_columnas')`. */
export const COLS_INCREMENTO: ColDef[] = [
  { key: 'material', label: 'Material' },
  { key: 'sector', label: 'Sector / Grupo' },
  { key: 'abc', label: 'ABC' },
  { key: 'costos', label: 'Costo ant. / nuevo' },
  { key: 'delta', label: 'Δ$ / Δ%' },
  { key: 'venta', label: 'Piezas / venta periodo' },
  { key: 'impacto', label: 'Impacto periodo / anualizado' },
  { key: 'margen', label: 'Margen ant. / nuevo' },
  { key: 'precioReq', label: 'Precio requerido' },
  { key: 'inventario', label: 'Cobertura inventario' },
  { key: 'pedidos', label: 'Riesgo pedidos pendientes' },
  { key: 'flags', label: 'Alertas' },
];
