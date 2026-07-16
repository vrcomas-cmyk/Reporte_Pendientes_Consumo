import { useMemo, useState } from 'react';
import type { HeatmapCell } from '@/core/types';
import { sequentialStep } from '@/lib/chartColors';
import { formatNumber } from '@/lib/utils';

/** Simple colored-grid heatmap — no charting library needed. Rows = sector,
 * columns = distribution center. Color encodes summed inventory (sequential
 * blue ramp per the dataviz skill's magnitude rule). */
export function Heatmap({ cells }: { cells: HeatmapCell[] }) {
  const [hover, setHover] = useState<HeatmapCell | null>(null);
  const { rows, cols, values, min, max } = useMemo(() => {
    const rowSet = [...new Set(cells.map((c) => c.rowKey))].sort();
    const colSet = [...new Set(cells.map((c) => c.colKey))].sort();
    const values = new Map<string, number>();
    for (const c of cells) values.set(`${c.rowKey}::${c.colKey}`, c.value);
    const all = cells.map((c) => c.value);
    return { rows: rowSet, cols: colSet, values, min: Math.min(0, ...all), max: Math.max(1, ...all) };
  }, [cells]);

  if (!rows.length || !cols.length) {
    return <p className="p-4 text-xs text-text-faint">Sin datos de inventario para mostrar.</p>;
  }

  return (
    <div className="overflow-auto">
      <table className="border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th className="w-28"></th>
            {cols.map((c) => (
              <th key={c} className="px-1 pb-1 font-mono text-[10px] font-normal text-text-faint">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r}>
              <td className="max-w-28 truncate pr-2 text-right text-[11px] text-text-muted" title={r}>
                {r}
              </td>
              {cols.map((c) => {
                const v = values.get(`${r}::${c}`) ?? 0;
                return (
                  <td key={c}>
                    <div
                      onMouseEnter={() => setHover({ rowKey: r, colKey: c, value: v })}
                      onMouseLeave={() => setHover(null)}
                      className="flex size-8 items-center justify-center rounded-sm text-[9px] font-mono text-black/70"
                      style={{ background: sequentialStep(v, min, max) }}
                      title={`${r} · Centro ${c}: ${formatNumber(v)}`}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 h-5 min-h-[1.25rem] text-[11px] text-text-faint">
        {hover ? `${hover.rowKey} · Centro ${hover.colKey}: ${formatNumber(hover.value)} unidades` : 'Pasa el cursor sobre una celda para ver el detalle.'}
      </div>
    </div>
  );
}
