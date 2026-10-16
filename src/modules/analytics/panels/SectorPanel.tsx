import { useMemo } from 'react';
import { KpiBand } from '@/components/layout/report';
import { Section } from './_shared';
import { ControlesAB, TablaAB, usePeriodosAB } from './ComparaPeriodos';
import { formatCurrency } from '@/lib/utils';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { analisisVentas } from '@/core/comercial';
import { mesKey, mesAnterior, hoyMes, type Serie } from '@/core/resumenFac';
import type { Panel } from '@/store/panelStore';
import type { Analytics } from '../AnalyticsContext';

function pct(a: number, b: number) {
  const p = b ? (a / b - 1) * 100 : a ? 100 : 0;
  return <span className={p >= 0 ? 'text-success' : 'text-danger'}>{p >= 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span>;
}

interface GrupoFila { grupo: string; p3: number; a3: number; i12: number }

/** Panel — Grupos de artículo de un sector, misma ventana 3m previos / últ. 3m / 12m que la tabla de sectores.
 * Si se abrió desde los rankings de Consumo (`panel.filtro`), solo suma los pares destinatario+material que
 * pasan los filtros de esa pantalla y usa su misma ventana, así el total cuadra con el ranking. */
export function SectorPanel({ panel, a, push }: { panel: Extract<Panel, { type: 'sector' }>; a: Analytics; push: (p: Panel) => void }) {
  const filtro = panel.filtro;
  const A = useMemo(() => (filtro ? null : analisisVentas(a.rf, a.bo, a.enrich)), [a.rf, a.bo, a.enrich, filtro]);
  const list = useMemo<GrupoFila[]>(() => {
    if (filtro) {
      if (!a.rf) return [];
      const R = mesKey(mesAnterior(hoyMes()));
      const acc = new Map<string, GrupoFila>();
      for (const par of filtro.pares) {
        const mat = par.slice(par.indexOf('||') + 2);
        const grupo = a.enrich.matGrupo(mat) || '(sin grupo)';
        const o = acc.get(grupo) ?? { grupo, p3: 0, a3: 0, i12: 0 };
        for (const p of a.rf.matDest.get(par) ?? []) {
          const k = mesKey(p.mes);
          if (k >= filtro.lo && k <= filtro.hi) o.i12 += p.imp;
          if (k >= R - 2 && k <= R) o.a3 += p.imp;
          else if (k >= R - 5 && k <= R - 3) o.p3 += p.imp;
        }
        acc.set(grupo, o);
      }
      return [...acc.values()].filter((g) => g.i12 || g.a3 || g.p3).sort((x, y) => y.i12 - x.i12);
    }
    const sectorData = A?.sectores.find((s) => s.sector === panel.sector);
    return sectorData ? [...sectorData.grupos.values()].sort((x, y) => y.i12 - x.i12) : [];
  }, [filtro, A, a.rf, a.enrich, panel.sector]);
  const ab = usePeriodosAB();
  // Series mensuales por grupo y por material del sector (con filtro: solo los pares que pasan los filtros de Consumo).
  const { gruposS, matsS } = useMemo(() => {
    const gAcc = new Map<string, Map<string, { mes: string; imp: number; cant: number }>>();
    const mAcc = new Map<string, Map<string, { mes: string; imp: number; cant: number }>>();
    const sumar = (m: Map<string, Map<string, { mes: string; imp: number; cant: number }>>, k: string, serie: Serie) => {
      const b = m.get(k) ?? new Map();
      for (const p of serie) { const c = b.get(p.mes) ?? { mes: p.mes, imp: 0, cant: 0 }; c.imp += p.imp; c.cant += p.cant; b.set(p.mes, c); }
      m.set(k, b);
    };
    if (a.rf) {
      if (filtro) {
        for (const par of filtro.pares) {
          const mat = par.slice(par.indexOf('||') + 2);
          const serie = a.rf.matDest.get(par) ?? [];
          sumar(gAcc, a.enrich.matGrupo(mat) || '(sin grupo)', serie);
          sumar(mAcc, mat, serie);
        }
      } else {
        a.rf.mat.forEach((serie, mat) => {
          if (a.enrich.matSector(mat) !== panel.sector) return;
          sumar(gAcc, a.enrich.matGrupo(mat) || '(sin grupo)', serie);
          sumar(mAcc, mat, serie);
        });
      }
    }
    const aFilas = (m: Map<string, Map<string, { mes: string; imp: number; cant: number }>>) => [...m].map(([k, b]) => ({ k, serie: [...b.values()] }));
    return { gruposS: aFilas(gAcc), matsS: aFilas(mAcc) };
  }, [a.rf, a.enrich, filtro, panel.sector]);
  if (!filtro && !A) return <p>Sin datos.</p>;
  const total = list.reduce((s, g) => s + g.i12, 0);
  return (
    <div>
      <h2 className="font-display text-lg font-semibold">Sector · {panel.sector}</h2>
      <p className="mt-1 text-sm text-text-muted">Grupos de artículo del sector · 3m previos vs últ. 3m completos</p>
      {filtro && (
        <p className="mt-1 text-xs text-text-faint">
          Filtrado desde Consumo ({filtro.pares.length} par(es) cliente-material) · ventana {filtro.etiqueta}: total {formatCurrency(total)} ÷ {filtro.nMeses} = <b>{formatCurrency(total / filtro.nMeses)}</b>/mes
        </p>
      )}
      <KpiBand
        className="mt-3"
        titulo="Sector · resumen"
        principal={{ etiqueta: filtro ? 'Importe de la ventana' : 'Importe 12m', valor: formatCurrency(total) }}
        metricas={[
          { etiqueta: 'Últ. 3m', valor: formatCurrency(list.reduce((s, g) => s + g.a3, 0)) },
          { etiqueta: '3m previos', valor: formatCurrency(list.reduce((s, g) => s + g.p3, 0)) },
          { etiqueta: 'Grupos', valor: String(list.length) },
        ]}
      />
      <Section title={`${list.length} grupo(s) · doble clic en un grupo para bajar al detalle`}>
        <div>
          <Table wrapperClassName="max-h-96 rounded-lg border border-border">
            <TableHeader>
              <TableRow>
                <TableHead>Grupo de artículo</TableHead>
                <TableHead className="text-right">3m previos</TableHead>
                <TableHead className="text-right">Últ. 3m</TableHead>
                <TableHead className="text-right">{filtro ? 'Imp. ventana' : 'Imp. 12m'}</TableHead>
                {filtro && <TableHead className="text-right">Prom. mes</TableHead>}
                <TableHead>Var.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((g) => (
                <TableRow key={g.grupo} className="cursor-pointer" title="Doble clic: ver los materiales y clientes de este grupo" onDoubleClick={() => push({ type: 'grupo', grupo: g.grupo })}>
                  <TableCell>{g.grupo}</TableCell>
                  <TableCell className="text-right">{formatCurrency(g.p3)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(g.a3)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(g.i12)}</TableCell>
                  {filtro && <TableCell className="text-right">{formatCurrency(g.i12 / filtro.nMeses)}</TableCell>}
                  <TableCell>{pct(g.a3, g.p3)}</TableCell>
                </TableRow>
              ))}
              {filtro && list.length > 0 && (
                <TableRow className="font-semibold">
                  <TableCell>Total sector</TableCell>
                  <TableCell className="text-right">{formatCurrency(list.reduce((s, g) => s + g.p3, 0))}</TableCell>
                  <TableCell className="text-right">{formatCurrency(list.reduce((s, g) => s + g.a3, 0))}</TableCell>
                  <TableCell className="text-right">{formatCurrency(total)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(total / filtro.nMeses)}</TableCell>
                  <TableCell />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Section>
      <Section title="Comparar periodos">
        <ControlesAB ab={ab} />
        <p className="text-[11px] text-text-faint">El mismo periodo A / B se usa en grupos y materiales del sector.</p>
      </Section>
      <Section title={`Grupos del sector · periodo A vs B · doble clic para bajar al grupo`}>
        <TablaAB ab={ab} colTitulo="Grupo de artículo" conEstado={false} maxH="max-h-80"
          filas={gruposS.map((g) => ({ key: g.k, titulo: g.k, serie: g.serie, onOpen: () => push({ type: 'grupo', grupo: g.k }) }))} />
      </Section>
      <Section title={`Materiales del sector · ${matsS.length} · periodo A vs B · doble clic para ver el material`}>
        <TablaAB ab={ab} colTitulo="Material" conEstado={false} maxH="max-h-96"
          filas={matsS.map((m) => ({ key: m.k, titulo: m.k, sub: a.enrich.matTexto(m.k), serie: m.serie, onOpen: () => push({ type: 'material', material: m.k }) }))} />
      </Section>
    </div>
  );
}
