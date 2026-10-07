import { useMemo } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { EvolChart, TrendBadge } from '../ui';
import { Section, SugTable, ConsumoTable, LotesTable, PrecioCondicionBox } from './_shared';
import { CostoTile } from './CostoMaterial';
import { InventarioCentrosPanel } from './InventarioCentrosPanel';
import { formatNumber, formatCurrency } from '@/lib/utils';
import { serieMaterial, tendenciaTexto, mesKey } from '@/core/resumenFac';
import { sugFor, consFor, norm } from '../helpers';
import type { Panel } from '@/store/panelStore';
import type { Analytics } from '../AnalyticsContext';

/** Panel — Detalle de un material: tendencia, lotes, sugerencias y consumo por cliente. */
export function MaterialPanel({ panel, a, push }: { panel: Extract<Panel, { type: 'material' }>; a: Analytics; push: (p: Panel) => void }) {
  const { bo, enrich, lotes, rf, result } = a;
  const mat = panel.material;
  const filtro = panel.filtro;
  const { lotesF, totalUni, sug, cons, serie } = useMemo(() => {
    const lotesF = lotes.filter((l) => norm(l.material) === norm(mat));
    const totalUni = lotesF.reduce((s, l) => s + l.cantidadDisp, 0);
    const sug = sugFor(bo, mat);
    let cons = consFor(result?.consumo ?? [], mat);
    let serie = serieMaterial(rf, mat);
    // Abierto desde el ranking de Consumo: solo los pares cliente-material que pasan sus filtros.
    if (filtro && rf) {
      const pares = new Set(filtro.pares);
      cons = cons.filter((r) => pares.has(norm(r.destinatario) + '||' + norm(r.material)));
      const bucket = new Map<string, { mes: string; cant: number; imp: number }>();
      for (const par of pares) {
        for (const p of rf.matDest.get(par) ?? []) {
          const c = bucket.get(p.mes) ?? { mes: p.mes, cant: 0, imp: 0 };
          c.cant += p.cant; c.imp += p.imp; bucket.set(p.mes, c);
        }
      }
      serie = [...bucket.values()].sort((x, y) => mesKey(x.mes) - mesKey(y.mes));
    }
    return { lotesF, totalUni, sug, cons, serie };
  }, [lotes, mat, bo, result, rf, filtro]);
  const ventanaTotal = useMemo(() => {
    if (!filtro) return 0;
    return serie.reduce((s, p) => { const k = mesKey(p.mes); return k >= filtro.lo && k <= filtro.hi ? s + p.imp : s; }, 0);
  }, [serie, filtro]);
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <aside className="shrink-0 lg:sticky lg:top-0 lg:w-60">
        <InventarioCentrosPanel a={a} material={mat} push={push} />
      </aside>
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-lg font-semibold">{mat}</h2>
        <p className="mt-1 text-sm text-text-muted">{enrich.matTexto(mat) ? `${enrich.matTexto(mat)} · ` : ''}{lotesF.length} lote(s) · {formatNumber(totalUni)} unidades</p>
        {filtro && (
          <p className="mt-1 text-xs text-text-faint">
            Filtrado desde Consumo ({filtro.pares.length} cliente(s)) · ventana {filtro.etiqueta}: {formatCurrency(ventanaTotal)} ÷ {filtro.nMeses} = <b>{formatCurrency(ventanaTotal / filtro.nMeses)}</b>/mes
          </p>
        )}
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4"><CostoTile a={a} material={mat} /></div>
        <PrecioCondicionBox a={a} material={mat} />
        <Section title="Tendencia del material">
          <div className="mb-2"><TrendBadge t={tendenciaTexto(serie)} /></div>
          <EvolChart serie={serie} onMonth={(mes) => push({ type: 'clientesMes', material: mat, mes })} />
        </Section>
        {lotesF.length > 0 && (
          <Section title="Lotes">
            <LotesTable lotes={lotesF} a={a} material={mat} />
          </Section>
        )}
        <Section title="Sugerencias / Consumo">
          <Tabs defaultValue="sug">
            <TabsList><TabsTrigger value="sug">Sugerencias ({sug.length})</TabsTrigger><TabsTrigger value="cons">Consumo ({cons.length})</TabsTrigger></TabsList>
            <TabsContent value="sug"><SugTable list={sug} a={a} push={push} /></TabsContent>
            <TabsContent value="cons"><ConsumoTable list={cons} a={a} push={push} /></TabsContent>
          </Tabs>
        </Section>
      </div>
    </div>
  );
}
