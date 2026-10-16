import { useMemo } from 'react';
import { KpiBand } from '@/components/layout/report';
import { TrendBadge } from '../ui';
import { DetalleLayout, InventarioColumna, HistorialConsumo, TabsSugConsumo, AccionTotalesMaterial } from './DetalleLayout';
import { Section } from './_shared';
import { useCostoMetrica } from './CostoMaterial';
import { ControlesAB, TablaAB, usePeriodosAB } from './ComparaPeriodos';
import { PromedioPeriodoSection, usePeriodoProm } from './PromedioPeriodoSection';
import { LotesOfertablesSection } from './OpcionesOferta';
import { formatNumber, formatCurrency } from '@/lib/utils';
import { serieMaterial, tendenciaTexto, mesKey } from '@/core/resumenFac';
import { sugFor, consFor, norm } from '../helpers';
import type { Panel } from '@/store/panelStore';
import type { Analytics } from '../AnalyticsContext';

/** Panel — Detalle de un material: tendencia, lotes, sugerencias y consumo por cliente. */
export function MaterialPanel({ panel, a, push }: { panel: Extract<Panel, { type: 'material' }>; a: Analytics; push: (p: Panel) => void }) {
  const { bo, enrich, lotes, rf, result } = a;
  const mat = panel.material;
  const { periodo, setPeriodo, esDefault } = usePeriodoProm(a);
  const filtro = panel.filtro;
  const costoMetrica = useCostoMetrica(a, mat);
  const ab = usePeriodosAB();
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
  // Clientes (destinatarios) del material con su serie mensual, para comparar periodo A vs B.
  const clientesAB = useMemo(() => {
    if (!rf) return [];
    const sufijo = '||' + norm(mat);
    const pares = filtro ? new Set(filtro.pares) : null;
    const razon = new Map(cons.map((r) => [norm(r.destinatario), r.razonSocial]));
    const out: { dest: string; razon: string; serie: typeof serie }[] = [];
    for (const [par, s] of rf.matDest) {
      if (!par.endsWith(sufijo) || (pares && !pares.has(par))) continue;
      const dest = par.slice(0, par.length - sufijo.length);
      out.push({ dest, razon: razon.get(dest) || '', serie: s });
    }
    return out;
  }, [rf, mat, filtro, cons]);
  const ventanaTotal = useMemo(() => {
    if (!filtro) return 0;
    return serie.reduce((s, p) => { const k = mesKey(p.mes); return k >= filtro.lo && k <= filtro.hi ? s + p.imp : s; }, 0);
  }, [serie, filtro]);
  const clase = a.abc.classByMaterial.get(norm(mat)) || '';
  return (
    <DetalleLayout
      acciones={<AccionTotalesMaterial material={mat} push={push} />}
      encabezado={(
        <>
          <h2 className="font-display text-lg font-semibold">{mat}</h2>
          <p className="mt-1 text-sm text-text-muted">{enrich.matTexto(mat) ? `${enrich.matTexto(mat)} · ` : ''}{lotesF.length} lote(s) · {formatNumber(totalUni)} unidades</p>
          {filtro && (
            <p className="mt-1 text-xs text-text-faint">
              Filtrado desde Consumo ({filtro.pares.length} cliente(s)) · ventana {filtro.etiqueta}: {formatCurrency(ventanaTotal)} ÷ {filtro.nMeses} = <b>{formatCurrency(ventanaTotal / filtro.nMeses)}</b>/mes
            </p>
          )}
        </>
      )}
      datos={[
        { etiqueta: 'Sector', valor: enrich.matSector(mat) },
        { etiqueta: 'Grupo art.', valor: enrich.matGrupo(mat) },
        { etiqueta: 'Condiciones', valor: enrich.matCondiciones(mat).join(', ') },
        { etiqueta: 'Clase ABC', valor: clase },
        { etiqueta: 'Tendencia', valor: <TrendBadge t={tendenciaTexto(serie)} /> },
      ]}
      banda={(
        <KpiBand
          titulo="Material · resumen"
          distribuir
          principal={{ etiqueta: 'Unidades en lotes', valor: formatNumber(totalUni), sub: `${lotesF.length} lote(s)` }}
          metricas={[
            { etiqueta: 'Pendiente (BO)', valor: formatNumber(sug.reduce((s, it) => s + it.bo.cantidadPendiente, 0)), sub: `${sug.length} renglón(es)`, tono: sug.length ? 'danger' : undefined },
            { etiqueta: 'Clientes con consumo', valor: formatNumber(cons.length) },
            { etiqueta: 'Facturado (serie)', valor: formatCurrency(serie.reduce((s, p) => s + p.imp, 0)), sub: `${formatNumber(serie.reduce((s, p) => s + p.cant, 0))} u.` },
            ...costoMetrica,
          ]}
        />
      )}
      izquierda={<InventarioColumna a={a} material={mat} push={push} />}
      centro={(
        <>
          <HistorialConsumo a={a} serie={serie} titulo="Facturación del material" costosMaterial={mat} onMonth={(mes) => push({ type: 'clientesMes', material: mat, mes })}>
            <PromedioPeriodoSection a={a} material={mat} periodo={periodo} esDefault={esDefault} onChange={setPeriodo} />
          </HistorialConsumo>
        </>
      )}
      abajo={(
        <>
          <TabsSugConsumo sug={sug} cons={cons} a={a} push={push} />
          {clientesAB.length > 0 && (
            <Section ancho collapsible defaultOpen={false} storageKey="material.clientes.ab" tono="fac" origen="Resumen_Fac" title={`Clientes del material · ${clientesAB.length} · periodo A vs B · doble clic para ver al cliente`}>
              <ControlesAB ab={ab} />
              <TablaAB ab={ab} colTitulo="Cliente" maxH="max-h-96"
                filas={clientesAB.map((c) => ({ key: c.dest, titulo: c.razon || c.dest, sub: `Dest ${c.dest}`, serie: c.serie, onOpen: () => push({ type: 'clienteDetalle', dest: c.dest, material: mat }) }))} />
            </Section>
          )}
          <LotesOfertablesSection a={a} material={mat} push={push} />
        </>
      )}
    />
  );
}
