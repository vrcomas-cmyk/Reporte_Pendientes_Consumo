import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useDataStore } from '@/store/dataStore';
import { buildRF, type RFIndex } from '@/core/resumenFac';
import { buildBO, type BOItem } from '@/core/buildBO';
import { buildRSS, type RSSIndex } from '@/core/resumenSin';
import { buildEnrich, type EnrichIndex } from '@/core/enrich';
import { applyCatalogPriceFallback } from '@/core/analysis';
import type { AnalysisResult, InvConsolidadoRow, InvDetalleRow } from '@/core/types';

export interface Analytics {
  result: AnalysisResult | null;
  rf: RFIndex | null;
  bo: BOItem[];
  boByKey: Map<string, BOItem>;
  rss: RSSIndex | null;
  enrich: EnrichIndex;
  /** Inventory-by-condition rows for the current view: the daily "Inventario por
   * condición" sheet when present (else the catalog's InvConsolidado), with each
   * row's `precioOferta` back-filled per (material, condición) from the catalog. */
  invCondicion: InvConsolidadoRow[];
  lotes: InvDetalleRow[];
  curmes: string;
}

const AnalyticsCtx = createContext<Analytics | null>(null);

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const result = useDataStore((s) => s.activeAnalysis);
  const catalog = useDataStore((s) => s.catalog);

  const value = useMemo<Analytics>(() => {
    const enrich = buildEnrich(catalog);
    if (!result) {
      return { result: null, rf: null, bo: [], boByKey: new Map(), rss: null, enrich, invCondicion: [], lotes: [], curmes: '' };
    }
    const rf = result.resumenFac.length ? buildRF(result.resumenFac) : null;
    const bo = result.sugerencias.length ? buildBO(result.sugerencias, rf) : [];
    const boByKey = new Map(bo.map((it) => [it.k, it]));
    const rss = result.resumenSinSugerencias.length ? buildRSS(result.resumenSinSugerencias) : null;
    // Inventory pivot prefers the daily report's "Inventario por condicion";
    // lot detail merges catalog InvDetalle with the report's short-expiry lots.
    const invCondicionRaw = result.inventarioCondicion.length ? result.inventarioCondicion : catalog?.invConsolidado ?? [];
    const invCondicion = applyCatalogPriceFallback(invCondicionRaw, catalog);
    const lotes = [...(catalog?.invDetalle ?? []), ...result.lotesCortaCaducidad];
    return { result, rf, bo, boByKey, rss, enrich, invCondicion, lotes, curmes: rf?.curmes ?? '' };
  }, [result, catalog]);

  return <AnalyticsCtx.Provider value={value}>{children}</AnalyticsCtx.Provider>;
}

export function useAnalytics(): Analytics {
  const ctx = useContext(AnalyticsCtx);
  if (!ctx) throw new Error('useAnalytics must be used within AnalyticsProvider');
  return ctx;
}
