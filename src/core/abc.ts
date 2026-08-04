// ---------------------------------------------------------------------------
// abc.ts · Clasificación ABC/Pareto de materiales y clientes por importe
// facturado en los últimos 12 meses completos (Resumen_Fac). Mismo mes de
// referencia (R = mesAnterior(hoy)) y ventana que usa comercial.ts, para que
// "últimos 12 meses" signifique lo mismo en toda la app.
// ---------------------------------------------------------------------------
import { mesKey, mesAnterior, hoyMes, type RFIndex, type Serie } from './resumenFac';

export type AbcClass = 'A' | 'B' | 'C';

export interface AbcEntry {
  key: string;
  label: string;
  importe12m: number;
  cantidad12m: number;
  /** Fracción (0-1) del importe total que representa esta entrada sola. */
  share: number;
  /** Fracción (0-1) acumulada hasta e incluyendo esta entrada, en el orden
   * ya ordenado por importe descendente — es lo que decide la clase. */
  cumShare: number;
  /** Posición 1-based en el ranking por importe. */
  rank: number;
  clase: AbcClass;
}

export interface AbcResult {
  materiales: AbcEntry[];
  clientes: AbcEntry[];
  totalImporteMateriales: number;
  totalImporteClientes: number;
  /** Lookup directo clase por código de material/cliente (código de
   * solicitante para clientes — mismo eje que `comercial.ts`'s ClienteAna),
   * para pintar un badge sin recorrer el arreglo ordenado. */
  classByMaterial: Map<string, AbcClass>;
  classByCliente: Map<string, AbcClass>;
}

/** Corte estándar 80/20: A acumula hasta 80% del importe, B hasta 95%, C es
 * la cola. Contra un reporte real (`Reporte_Completo_20260803`, ventana de
 * 12 meses anclada en `mesAnterior(hoyMes())` — la misma que usa
 * `comercial.ts`) dio 173 materiales A / 245 B / 696 C. */
export const ABC_THRESHOLDS = { a: 0.8, b: 0.95 } as const;

const EMPTY: AbcResult = {
  materiales: [],
  clientes: [],
  totalImporteMateriales: 0,
  totalImporteClientes: 0,
  classByMaterial: new Map(),
  classByCliente: new Map(),
};

function sum12m(serie: Serie, refK: number): { cant: number; imp: number } {
  let cant = 0;
  let imp = 0;
  for (const p of serie || []) {
    const k = mesKey(p.mes);
    if (k >= refK - 11 && k <= refK) {
      cant += p.cant;
      imp += p.imp;
    }
  }
  return { cant, imp };
}

function classify(raw: { key: string; label: string; imp: number; cant: number }[]): { entries: AbcEntry[]; total: number } {
  const sorted = raw.filter((e) => e.imp > 0).sort((a, b) => b.imp - a.imp);
  const total = sorted.reduce((acc, e) => acc + e.imp, 0);
  let cumBefore = 0;
  const entries = sorted.map((e, i) => {
    // La clase se decide por el acumulado ANTES de sumar esta entrada, no
    // después: así el ítem que hace cruzar el 80%/95% queda del lado que
    // completa (A o B), en vez de empujarse al siguiente. Con esta regla un
    // solo material que por sí solo valga, digamos, 83% del importe total
    // sigue siendo A (cumBefore = 0 < 80%) en lugar de caer en B por su
    // propio cumShare posterior — mismo criterio con el que se validaron los
    // números de `ABC_THRESHOLDS` arriba contra un reporte real.
    const cumBeforeShare = total ? cumBefore / total : 0;
    cumBefore += e.imp;
    const cumShare = total ? cumBefore / total : 0;
    const share = total ? e.imp / total : 0;
    const clase: AbcClass =
      cumBeforeShare < ABC_THRESHOLDS.a ? 'A' : cumBeforeShare < ABC_THRESHOLDS.b ? 'B' : 'C';
    return { key: e.key, label: e.label, importe12m: e.imp, cantidad12m: e.cant, share, cumShare, rank: i + 1, clase };
  });
  return { entries, total };
}

/**
 * Clasifica materiales y clientes (por código de solicitante — el mismo eje
 * de negocio que usa `analisisVentas` para clientes, no destinatario/punto
 * de entrega) según el importe facturado en los últimos 12 meses completos.
 * Pura — no I/O — para poder correr en un `useMemo` o en un test.
 */
export function buildAbc(rf: RFIndex | null): AbcResult {
  if (!rf) return EMPTY;

  const refK = mesKey(mesAnterior(hoyMes()));

  const matRaw: { key: string; label: string; imp: number; cant: number }[] = [];
  rf.mat.forEach((serie, material) => {
    const { cant, imp } = sum12m(serie, refK);
    if (imp > 0) matRaw.push({ key: material, label: rf.matTexto.get(material) || material, imp, cant });
  });

  const clienteRaw: { key: string; label: string; imp: number; cant: number }[] = [];
  rf.solic.forEach((serie, solicitante) => {
    const { cant, imp } = sum12m(serie, refK);
    if (imp > 0) clienteRaw.push({ key: solicitante, label: rf.solicRazon.get(solicitante) || solicitante, imp, cant });
  });

  const { entries: materiales, total: totalImporteMateriales } = classify(matRaw);
  const { entries: clientes, total: totalImporteClientes } = classify(clienteRaw);

  return {
    materiales,
    clientes,
    totalImporteMateriales,
    totalImporteClientes,
    classByMaterial: new Map(materiales.map((e) => [e.key, e.clase])),
    classByCliente: new Map(clientes.map((e) => [e.key, e.clase])),
  };
}

/** Resumen por clase — conteo, importe y % del total — para las 3 filas de
 * una tabla A/B/C (materiales o clientes, según qué `entries` se pase). */
export interface AbcClassSummary {
  clase: AbcClass;
  count: number;
  importe: number;
  shareOfTotal: number;
}
export function summarizeAbc(entries: AbcEntry[]): AbcClassSummary[] {
  const total = entries.reduce((acc, e) => acc + e.importe12m, 0);
  return (['A', 'B', 'C'] as const).map((clase) => {
    const inClass = entries.filter((e) => e.clase === clase);
    const importe = inClass.reduce((acc, e) => acc + e.importe12m, 0);
    return { clase, count: inClass.length, importe, shareOfTotal: total ? importe / total : 0 };
  });
}
