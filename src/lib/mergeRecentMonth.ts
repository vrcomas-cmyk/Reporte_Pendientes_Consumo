import type { TabRows } from '@/workers/analysisWorker';

const RESUMEN_FAC_MONTH_COL = 'Mes y año';

/** Fusiona las filas del mes corriente (`fresh`) sobre la caché (`cached`)
 * alineando POR NOMBRE de columna: si la hoja cambió de esquema (p.ej. se
 * agregó "Centro" al inicio de Resumen_Fac), las filas de la caché se
 * reacomodan al orden de `fresh.headers` en vez de mezclarse por posición.
 * Descarta de la caché las filas del mes corriente y las que no traen un mes
 * "MM/AAAA" válido (basura de merges previos corridos). `null` si `fresh` no
 * trae la columna de mes. */
export function mergeRecentMonth(cached: TabRows, fresh: TabRows, monthVal: string): TabRows | null {
  const freshMonthIdx = fresh.headers.indexOf(RESUMEN_FAC_MONTH_COL);
  if (freshMonthIdx === -1) return null;
  const cachedMonthIdx = cached.headers.indexOf(RESUMEN_FAC_MONTH_COL);
  if (cachedMonthIdx === -1) return null;

  const sameSchema =
    cached.headers.length === fresh.headers.length && cached.headers.every((h, i) => h === fresh.headers[i]);
  const colMap = sameSchema ? null : fresh.headers.map((h) => cached.headers.indexOf(h));
  const aligned = colMap ? cached.rows.map((r) => colMap.map((ci) => (ci === -1 ? '' : r[ci] ?? ''))) : cached.rows;

  const mesValido = /^(0?[1-9]|1[0-2])\/\d{4}$/;
  const keptRows = aligned.filter((r) => {
    const m = String(r[freshMonthIdx] ?? '').trim();
    return m !== monthVal && mesValido.test(m);
  });
  const rows = [...keptRows, ...fresh.rows];
  return { headers: fresh.headers, rows, rowCount: rows.length };
}
