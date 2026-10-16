import { createContext, useContext } from 'react';
import type { Fila, Filtros, MetricaSerie, PuntoSerie } from '@/core/comodatoTablero';

/** Lo que se puede abrir en la ventana de detalle. */
export type Detalle =
  | { tipo: 'cliente'; razon: string }
  | { tipo: 'canister'; desc: string; cod: string }
  | { tipo: 'mes'; periodo: string; cliCod?: string; equipoCod?: string; metric: MetricaSerie };

export interface TableroCtx {
  /** Todas las filas de v_seguimiento_360. */
  dataAll: Fila[];
  /** Filas con el periodo elegido aplicado (ver `aplicarPeriodo`). */
  data: Fila[];
  /** Filas con periodo y filtros aplicados: lo que muestran KPIs, gráficas y tablas. */
  rows: Fila[];
  serie: PuntoSerie[];
  bolsas: Fila[];
  filtros: Filtros;
  /** Pone un filtro; si ya tenía ese valor lo quita (clic otra vez = quitar). */
  alternar: (k: keyof Filtros, v: string) => void;
  /** Cambia varios filtros y/o la vista a la vez (p. ej. desde el detalle de un cliente). */
  aplicar: (cambios: Partial<Filtros>, vista?: 'dir' | 'ger' | 'com') => void;
  abrir: (d: Detalle) => void;
  codToRazon: Map<string, string>;
  razonToCod: Map<string, string>;
  trend: { cli: string; metric: MetricaSerie };
  setTrend: (t: Partial<{ cli: string; metric: MetricaSerie }>) => void;
  /** Orden de la tabla comercial. */
  orden: { sort: string; dir: 1 | -1 };
  setOrden: (o: { sort: string; dir: 1 | -1 }) => void;
}

export const TableroContext = createContext<TableroCtx | null>(null);
export function useTablero(): TableroCtx {
  const c = useContext(TableroContext);
  if (!c) throw new Error('useTablero fuera de <TableroComodato>');
  return c;
}
