import { useMemo } from 'react';
import { Select } from '@/components/ui/select';
import { SegmentedControl } from '@/components/layout/report';
import { alcanceDe, lblMes, serieAgg, type MetricaSerie } from '@/core/comodatoTablero';
import { EvolucionChart } from './graficas';
import { Seccion } from './piezas';
import { useTablero } from './contexto';

/** Serie mensual lista para la gráfica. `respetaFiltros`: solo la vista General (sin cliente ni equipo) sigue los filtros del tablero. */
export function useSerieEvol(o: { cliCod?: string; equipoCod?: string; metric: MetricaSerie }) {
  const { serie, rows, filtros } = useTablero();
  return useMemo(() => {
    const general = !o.cliCod && !o.equipoCod;
    const a = serieAgg(serie, { cliCod: o.cliCod, equipoCod: o.equipoCod, metric: o.metric, alcance: general ? alcanceDe(rows) : null, pDesde: filtros.pDesde, pHasta: filtros.pHasta });
    return a.labels.map((p, i) => ({ periodo: p, label: lblMes(p), fac: a.fac[i]!, com: a.com[i]! }));
  }, [serie, rows, filtros.pDesde, filtros.pHasta, o.cliCod, o.equipoCod, o.metric]);
}

/** Tarjeta "Evolución mensual — Facturación vs Comodato": selector de cliente, $ / bolsas y clic en un mes → detalle por cliente. */
export function EvolucionCard() {
  const { trend, setTrend, abrir, data, razonToCod } = useTablero();
  const datos = useSerieEvol({ cliCod: trend.cli, metric: trend.metric });
  const clientes = useMemo(() => [...new Set(data.map((d) => String(d.razon_social ?? '')).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')), [data]);
  const razonActual = [...razonToCod.entries()].find(([, cod]) => cod === trend.cli)?.[0] ?? '';
  return (
    <Seccion
      titulo="📈 Evolución mensual — Facturación vs Comodato"
      derecha={(
        <div className="flex flex-wrap items-center gap-2">
          <Select value={razonActual} onChange={(ev) => setTrend({ cli: ev.target.value ? razonToCod.get(ev.target.value) ?? '' : '' })} className="w-auto max-w-64" aria-label="Cliente de la gráfica">
            <option value="">General (todos los clientes)</option>
            {clientes.map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>
          <SegmentedControl<MetricaSerie> ariaLabel="Métrica" value={trend.metric} onChange={(metric) => setTrend({ metric })} options={[{ value: 'importe', label: '$ Importe' }, { value: 'bolsas', label: 'Bolsas' }]} />
        </div>
      )}
    >
      <EvolucionChart datos={datos} metric={trend.metric} onMes={(periodo) => abrir({ tipo: 'mes', periodo, cliCod: trend.cli || undefined, metric: trend.metric })} />
      <p className="mt-1 text-[11px] text-text-faint">💡 Haz clic en un punto de la gráfica para ver qué clientes componen ese mes.</p>
    </Seccion>
  );
}

/** Gráfica de evolución de un cliente o de un canister (dentro de la ventana de detalle). */
export function EvolucionMini({ cliCod, equipoCod, alto = 240 }: { cliCod?: string; equipoCod?: string; alto?: number }) {
  const { trend } = useTablero();
  const datos = useSerieEvol({ cliCod, equipoCod, metric: trend.metric });
  return <EvolucionChart datos={datos} metric={trend.metric} alto={alto} />;
}
