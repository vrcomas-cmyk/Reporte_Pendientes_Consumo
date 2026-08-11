import type { ColDef } from '@/modules/analytics/ui';

/** Definición de columnas de la tabla completa de Consumo — usada por
 * `ConsumoPage.tsx` (tabla completa) Y por el panel de material
 * (`ConsumoTable` en `analytics/panels/_shared.tsx`), ambos leyendo el mismo
 * `useColumnVisibility('consumo_columnas')`. */
export const COLS_CONSUMO: ColDef[] = [
  { key: 'cliente', label: 'Cliente' },
  { key: 'ejecutivo', label: 'Ejecutivo / Grupo cli.' },
  { key: 'centro', label: 'Centro' },
  { key: 'material', label: 'Material' },
  { key: 'abc', label: 'ABC' },
  { key: 'sector', label: 'Sector/Grupo' },
  { key: 'consumo', label: 'Consumo' },
  { key: 'ultima', label: 'Última' },
  { key: 'penultima', label: 'Penúltima' },
  { key: 'impultima', label: 'Imp. últ.' },
  { key: 'estado', label: 'Estado' },
  { key: 'tendencia', label: 'Tendencia' },
];
