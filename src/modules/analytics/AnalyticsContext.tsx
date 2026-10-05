import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useDataStore } from '@/store/dataStore';
import { buildRF, mesesDisponibles, type RFIndex } from '@/core/resumenFac';
import { buildBO, type BOItem } from '@/core/buildBO';
import { buildRSS, type RSSIndex } from '@/core/resumenSin';
import { buildFacMensual, type FacMensualIndex } from '@/core/facMensual';
import { buildEnrich, type EnrichIndex } from '@/core/enrich';
import { applyCatalogPriceFallback } from '@/core/analysis';
import { buildAbc, type AbcResult } from '@/core/abc';
import { buildPrecioDispersion, type PrecioDispersionEntry } from '@/core/precios';
import type { AnalysisResult, InvConsolidadoRow, InvDetalleRow, IncrementoCostoRow } from '@/core/types';

export interface Analytics {
  result: AnalysisResult | null;
  rf: RFIndex | null;
  bo: BOItem[];
  boByKey: Map<string, BOItem>;
  rss: RSSIndex | null;
  /** Facturación mensual por Centro/Almacén/Material (pestaña "Fac_Mensual_CAM")
   * — base del promedio por periodo en el detalle de Inventario. `null` si no
   * se ha sincronizado. */
  facMensual: FacMensualIndex | null;
  enrich: EnrichIndex;
  /** Inventory-by-condition rows for the current view: the daily "Inventario por
   * condición" sheet when present (else the catalog's InvConsolidado), with each
   * row's `precioOferta` back-filled per (material, condición) from the catalog. */
  invCondicion: InvConsolidadoRow[];
  /** Raw catalog InvConsolidado rows (real per-condición precioOferta, no
   * fallback merge) — used to prefer catalog prices over invCondicion's. */
  invConsolidadoCatalog: InvConsolidadoRow[];
  lotes: InvDetalleRow[];
  curmes: string;
  /** Clasificación ABC/Pareto de materiales y clientes por importe facturado
   * en los últimos 12 meses (ver `core/abc.ts`). Vacía sin Resumen_Fac. */
  abc: AbcResult;
  /** Dispersión de precio unitario vigente entre clientes distintos, por
   * material (ver `core/precios.ts`). Vacía sin Reporte de Consumo. */
  precioDispersion: PrecioDispersionEntry[];
  /** Filas crudas del Sheet "Incremento de costos" (módulo `/incremento`).
   * El cálculo de impacto (`buildIncrementoImpacto`) NO vive aquí porque
   * depende del periodo/filtros elegidos por el usuario en esa página —
   * mismo patrón que `analisisVentas` en AnalisisPage. */
  incrementoRows: IncrementoCostoRow[];
  /** Meses distintos presentes en `rf.rows`, ordenados cronológicamente —
   * alimenta el selector de periodo antes de que exista un `PeriodoAnalisis`. */
  mesesDisponibles: string[];
}

const AnalyticsCtx = createContext<Analytics | null>(null);

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const result = useDataStore((s) => s.activeAnalysis);
  const catalog = useDataStore((s) => s.catalog);
  const incremento = useDataStore((s) => s.incremento);

  // Memos separados por insumo: `buildRF` (~488k filas) solo se recalcula si
  // cambia `resumenFac`, no cuando cambia el catálogo/incremento o cualquier
  // otro campo del análisis (`pick()` conserva la referencia de los arreglos
  // que no se refrescaron).
  const resumenFac = result?.resumenFac;
  const sugerencias = result?.sugerencias;
  const resumenSin = result?.resumenSinSugerencias;
  const facMensualCam = result?.facMensualCam;
  const consumo = result?.consumo;
  const inventarioCondicion = result?.inventarioCondicion;
  const lotesCortaCaducidad = result?.lotesCortaCaducidad;

  const enrich = useMemo(() => buildEnrich(catalog), [catalog]);
  const rf = useMemo(() => (resumenFac?.length ? buildRF(resumenFac) : null), [resumenFac]);
  const bo = useMemo(() => (sugerencias?.length ? buildBO(sugerencias, rf) : []), [sugerencias, rf]);
  const boByKey = useMemo(() => new Map(bo.map((it) => [it.k, it])), [bo]);
  const rss = useMemo(() => (resumenSin?.length ? buildRSS(resumenSin) : null), [resumenSin]);
  const facMensual = useMemo(() => (facMensualCam?.length ? buildFacMensual(facMensualCam) : null), [facMensualCam]);
  const abc = useMemo(() => buildAbc(rf), [rf]);
  const precioDispersion = useMemo(() => (consumo?.length ? buildPrecioDispersion(consumo) : []), [consumo]);
  const mesesDisp = useMemo(() => mesesDisponibles(rf), [rf]);
  const invConsolidadoCatalog = useMemo(() => catalog?.invConsolidado ?? [], [catalog]);
  // Inventory pivot prefers the daily report's "Inventario por condicion";
  // lot detail merges catalog InvDetalle with the report's short-expiry lots.
  const invCondicion = useMemo(
    () => applyCatalogPriceFallback(inventarioCondicion?.length ? inventarioCondicion : invConsolidadoCatalog, catalog),
    [inventarioCondicion, invConsolidadoCatalog, catalog],
  );
  const lotes = useMemo(() => [...(catalog?.invDetalle ?? []), ...(lotesCortaCaducidad ?? [])], [catalog, lotesCortaCaducidad]);
  const incrementoRows = useMemo(() => incremento?.rows ?? [], [incremento]);

  const value = useMemo<Analytics>(() => {
    if (!result) {
      return {
        result: null, rf: null, bo: [], boByKey: new Map(), rss: null, facMensual: null, enrich,
        invCondicion: [], invConsolidadoCatalog, lotes: [], curmes: '', abc: buildAbc(null), precioDispersion: [],
        incrementoRows, mesesDisponibles: [],
      };
    }
    return {
      result, rf, bo, boByKey, rss, facMensual, enrich, invCondicion, invConsolidadoCatalog, lotes, curmes: rf?.curmes ?? '', abc, precioDispersion,
      incrementoRows, mesesDisponibles: mesesDisp,
    };
  }, [result, rf, bo, boByKey, rss, facMensual, enrich, invCondicion, invConsolidadoCatalog, lotes, abc, precioDispersion, incrementoRows, mesesDisp]);

  return <AnalyticsCtx.Provider value={value}>{children}</AnalyticsCtx.Provider>;
}

export function useAnalytics(): Analytics {
  const ctx = useContext(AnalyticsCtx);
  if (!ctx) throw new Error('useAnalytics must be used within AnalyticsProvider');
  return ctx;
}
