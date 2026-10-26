import { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { TableCell, TableRow } from '@/components/ui/table';
import { F, esCarrito, esComplemento, fmtZona, lblMes, num, serieAgg, sumarPor, tipoEq } from '@/core/comodatoTablero';
import { cn } from '@/lib/utils';
import { BarrasH, DonaChart } from './graficas';
import { COLOR, DESC_STATUS, Kpi, KpiGrid, Pill, RoiCell, Seccion, Tabla, TendIcon, TipoTag, fmt, fmtN, pct, statusColor, t } from './piezas';
import { EvolucionMini } from './evolucion';
import { Delta } from './periodos';
import { useTablero, type Detalle } from './contexto';

/** Ventana de detalle: ficha de cliente, ficha de canister o desglose de un mes por cliente. */
export function DetalleDialog({ detalle, onClose }: { detalle: Detalle | null; onClose: () => void }) {
  return (
    <Dialog open={!!detalle} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-auto">
        {detalle?.tipo === 'cliente' && <FichaCliente razon={detalle.razon} onClose={onClose} />}
        {detalle?.tipo === 'canister' && <FichaCanister desc={detalle.desc} cod={detalle.cod} onClose={onClose} />}
        {detalle?.tipo === 'mes' && <DetalleMes periodo={detalle.periodo} cliCod={detalle.cliCod} equipoCod={detalle.equipoCod} metric={detalle.metric} />}
      </DialogContent>
    </Dialog>
  );
}

const Encabezado = ({ titulo, sub }: { titulo: string; sub: React.ReactNode }) => (
  <DialogHeader>
    <DialogTitle>{titulo}</DialogTitle>
    <div className="text-xs text-text-muted">{sub}</div>
  </DialogHeader>
);

function FichaCliente({ razon, onClose }: { razon: string; onClose: () => void }) {
  const { data, serie, filtros, aplicar } = useTablero();
  const recs = useMemo(() => data.filter((d) => d[F.razon] === razon), [data, razon]);
  const cod = t(recs[0] ?? {}, F.cliente);
  const si = useMemo(() => serieAgg(serie, { cliCod: cod, metric: 'importe', pDesde: filtros.pDesde, pHasta: filtros.pHasta }), [serie, cod, filtros.pDesde, filtros.pHasta]);
  const sb = useMemo(() => serieAgg(serie, { cliCod: cod, metric: 'bolsas', pDesde: filtros.pDesde, pHasta: filtros.pHasta }), [serie, cod, filtros.pDesde, filtros.pHasta]);
  if (!recs.length) return <p className="text-sm text-text-muted">Sin datos para este cliente en el periodo.</p>;
  const tot = (k: string) => recs.reduce((a, d) => a + num(d[k]), 0);
  const L = si.labels.length;
  const hayMes = L >= 1;
  const umMes = hayMes ? lblMes(si.labels[L - 1]!) : t(recs.find((d) => d[F.umFact]) ?? {}, F.umFact) || '—';
  const pmMes = hayMes ? (L >= 2 ? lblMes(si.labels[L - 2]!) : '—') : t(recs.find((d) => d[F.pmFact]) ?? {}, F.pmFact) || '—';
  const umImp = hayMes ? si.fac[L - 1]! : tot(F.umFactImp);
  const pmImp = hayMes ? (L >= 2 ? si.fac[L - 2]! : 0) : tot(F.pmFactImp);
  const umCant = hayMes ? sb.fac[L - 1]! : tot(F.umFactCant);
  const pmCant = hayMes ? (L >= 2 ? sb.fac[L - 2]! : 0) : tot(F.pmFactCant);
  const inv = tot(F.inv);
  const fac = tot(F.fact);
  const mar = tot(F.margen);
  const carr = recs.filter(esCarrito).length;
  const comp = recs.filter(esComplemento).length;
  const can = recs.length - carr - comp;
  const porEstado = new Map<string, number>();
  for (const d of recs) porEstado.set(t(d, F.status), (porEstado.get(t(d, F.status)) ?? 0) + 1);
  const estados = [...porEstado.entries()];
  return (
    <div className="flex flex-col gap-4">
      <Encabezado
        titulo={razon}
        sub={(
          <span className="flex flex-wrap items-center gap-1.5">
            Solicitante {cod} · Zona {fmtZona(recs[0]![F.zona]) || '—'} · {t(recs[0]!, F.ejec) || '—'} · {t(recs[0]!, F.grupo) || '—'} · {can} canister(s) · {carr} carrito(s){comp ? ` · ${comp} complemento(s)` : ''}
          </span>
        )}
      />
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-text-muted">Estado por equipo:</span>
        {estados.map(([s, n]) => <span key={s} className="inline-flex items-center gap-1"><Pill s={s} /><b className="tabular-nums">×{n}</b></span>)}
        {estados.length > 1 && <span className="basis-full text-[11px] text-text-faint">El estado se calcula por equipo según la última compra de sus bolsas; un cliente puede tener un equipo Activo y otro Sin compra (canister colocado sin primer pedido).</span>}
      </div>
      <div><Button size="sm" variant="outline" onClick={() => { aplicar({ cliente: razon }, 'com'); onClose(); }}>Filtrar tablero por este cliente</Button></div>
      <KpiGrid cols={4}>
        <Kpi label="Inversión comodato" value={fmt(inv)} />
        <Kpi label="Facturación total" value={fmt(fac)} />
        <Kpi label="Margen total" value={fmt(mar)} sub={`${pct(mar, fac)} s/venta`} />
        <Kpi label="ROI global" value={`${inv ? (mar / inv).toFixed(1) : 0}x`} />
      </KpiGrid>
      <div className="grid gap-3 sm:grid-cols-2">
        {[{ l: 'Facturación (importe) — comparativo', a: pmImp, b: umImp, f: fmt }, { l: 'Bolsas facturadas — comparativo', a: pmCant, b: umCant, f: fmtN }].map((x) => (
          <div key={x.l} className="rounded-lg border border-border p-3 text-xs">
            <div className="mb-1 text-[11px] uppercase tracking-wide text-text-faint">{x.l}</div>
            <div className="flex justify-between"><span>Penúltimo ({pmMes})</span><b className="tabular-nums">{x.f(x.a)}</b></div>
            <div className="flex justify-between"><span>Último ({umMes})</span><b className="tabular-nums">{x.f(x.b)}</b></div>
            <div className="mt-1"><Delta act={x.b} prev={x.a} /> <span className="text-text-faint">vs penúltimo mes</span></div>
          </div>
        ))}
      </div>
      <Seccion titulo="📈 Evolución mensual de este cliente"><EvolucionMini cliCod={cod} /></Seccion>
      <Tabla
        cols={[{ t: 'Equipo' }, { t: 'Tipo' }, { t: 'Piezas en comodato', num: true }, { t: 'Estado' }, { t: 'Tendencia' }, { t: 'ROI (veces)', num: true }, { t: 'Penúltimo mes' }, { t: 'Importe penúltimo', num: true }, { t: 'Importe último / Δ', num: true }, { t: 'Penúltima entrega' }, { t: 'Piezas penúltima entrega', num: true }, { t: 'Piezas última entrega / Δ', num: true }, { t: 'Acción sugerida' }]}
        filas={recs.map((d, i) => (
          <TableRow key={i}>
            <TableCell>{t(d, F.desc)}</TableCell>
            <TableCell><TipoTag tipo={tipoEq(d)} /></TableCell>
            <TableCell className="text-right tabular-nums">{num(d[F.cant])}</TableCell>
            <TableCell><Pill s={d[F.status]} /></TableCell>
            <TableCell><TendIcon t={d[F.tend]} /></TableCell>
            <TableCell className="text-right"><RoiCell v={d[F.roi]} /></TableCell>
            <TableCell>{t(d, F.pmFact) || '—'}</TableCell>
            <TableCell className="text-right tabular-nums">{fmt(d[F.pmFactImp])}</TableCell>
            <TableCell className="text-right tabular-nums">{fmt(d[F.umFactImp])} <Delta act={d[F.umFactImp]} prev={d[F.pmFactImp]} /><div className="text-[11px] text-text-faint">{t(d, F.umFact) || '—'}</div></TableCell>
            <TableCell>{t(d, F.pmComod) || '—'}</TableCell>
            <TableCell className="text-right tabular-nums">{d[F.pmComodCant] != null ? String(d[F.pmComodCant]) : '—'}</TableCell>
            <TableCell className="text-right tabular-nums">{d[F.umComodCant] != null ? String(d[F.umComodCant]) : '—'} <Delta act={d[F.umComodCant]} prev={d[F.pmComodCant]} /><div className="text-[11px] text-text-faint">{t(d, F.umComod) || '—'}</div></TableCell>
            <TableCell className="max-w-64 text-xs">{t(d, F.accion)}</TableCell>
          </TableRow>
        ))}
      />
    </div>
  );
}

function FichaCanister({ desc, cod, onClose }: { desc: string; cod: string; onClose: () => void }) {
  const { data, bolsas, abrir, aplicar } = useTablero();
  const recs = useMemo(() => data.filter((d) => String(d[F.desc]) === desc), [data, desc]);
  if (!recs.length) return <p className="text-sm text-text-muted">Sin datos para este equipo en el periodo.</p>;
  const tot = (k: string) => recs.reduce((a, d) => a + num(d[k]), 0);
  const inv = tot(F.inv);
  const fac = tot(F.fact);
  const mar = tot(F.margen);
  const gFac = sumarPor(recs.filter((d) => d[F.grupo]), F.grupo, F.fact);
  const sFac = sumarPor(recs, F.status, F.fact);
  const porStatus = new Map<string, { n: number; inv: number; fac: number; mar: number }>();
  for (const d of recs) {
    const s = t(d, F.status) || '—';
    const v = porStatus.get(s) ?? { n: 0, inv: 0, fac: 0, mar: 0 };
    v.n++; v.inv += num(d[F.inv]); v.fac += num(d[F.fact]); v.mar += num(d[F.margen]);
    porStatus.set(s, v);
  }
  const bolsasEq = bolsas.filter((b) => String(b.codigo_equipo) === cod || String(b.descripcion_equipo) === desc).sort((a, b) => num(b.importe_vendido) - num(a.importe_vendido));
  const clientes = [...recs].sort((a, b) => num(b[F.fact]) - num(a[F.fact]));
  const grupos = Object.entries(gFac).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, valor: value, color: COLOR.accent }));
  const estados = Object.entries(sFac).map(([name, value]) => ({ name, valor: value, color: statusColor(name) }));
  return (
    <div className="flex flex-col gap-4">
      <Encabezado titulo={desc} sub={`Código ${cod} · ${recs.length} clientes · ${tot(F.cant).toLocaleString('es-MX')} piezas en comodato`} />
      <KpiGrid cols={4}>
        <Kpi label="Inversión comodatos" value={fmt(inv)} />
        <Kpi label="Facturación" value={fmt(fac)} />
        <Kpi label="Margen" value={fmt(mar)} sub={`${pct(mar, fac)} s/venta`} />
        <Kpi label="ROI" value={`${(inv ? mar / inv : 0).toFixed(1)}x`} />
      </KpiGrid>
      <Seccion titulo="📈 Evolución mensual — Facturación vs Comodato (este canister)"><EvolucionMini equipoCod={cod} alto={260} /></Seccion>
      <Tabla
        titulo="💧 Facturación por bolsa (consumible)"
        cols={[{ t: 'Bolsa' }, { t: 'Clientes que la compran', num: true }, { t: 'Bolsas facturadas', num: true }, { t: 'Importe vendido', num: true }, { t: 'Margen total', num: true }, { t: '% de margen', num: true }, { t: 'Precio promedio por bolsa', num: true }]}
        filas={bolsasEq.length ? bolsasEq.map((d, i) => (
          <TableRow key={i}>
            <TableCell><b>{t(d, 'descripcion_consumible') || t(d, 'codigo_consumible')}</b></TableCell>
            <TableCell className="text-right tabular-nums">{num(d.num_clientes)}</TableCell>
            <TableCell className="text-right tabular-nums">{fmtN(d.bolsas_facturadas)}</TableCell>
            <TableCell className="text-right tabular-nums">{fmt(d.importe_vendido)}</TableCell>
            <TableCell className="text-right tabular-nums">{fmt(d.margen_total)}</TableCell>
            <TableCell className="text-right tabular-nums">{num(d.pct_margen)}%</TableCell>
            <TableCell className="text-right tabular-nums">{fmt(d.precio_prom_bolsa)}</TableCell>
          </TableRow>
        )) : [<TableRow key="v"><TableCell colSpan={7} className="text-text-muted">Sin bolsas para este equipo (es un equipo complementario sin facturación directa).</TableCell></TableRow>]}
        maxH="max-h-60"
      />
      <div className="grid gap-3 lg:grid-cols-2">
        <Seccion titulo="🏷️ Facturación por grupo de cliente" hint="(clic filtra)"><BarrasH datos={grupos} formato={(n) => fmt(n)} etiqueta="Facturación" onClick={(g) => { aplicar({ equipo: desc, grupo: g }); onClose(); }} /></Seccion>
        <Seccion titulo="Facturación por status" hint="(clic filtra)"><DonaChart datos={estados} formato={fmt} etiqueta="Facturación" descripciones={DESC_STATUS} onClick={(s) => { aplicar({ equipo: desc, status: s }); onClose(); }} /></Seccion>
      </div>
      <Tabla
        titulo="📌 Resumen por status"
        cols={[{ t: 'Estado' }, { t: 'Equipos asignados', num: true }, { t: 'Inversión en comodato', num: true }, { t: 'Facturación acumulada', num: true }, { t: 'Margen acumulado', num: true }, { t: 'ROI (veces)', num: true }]}
        filas={[...porStatus.entries()].sort((a, b) => b[1].fac - a[1].fac).map(([k, v]) => (
          <TableRow key={k}><TableCell><Pill s={k} /></TableCell><TableCell className="text-right tabular-nums">{v.n}</TableCell><TableCell className="text-right tabular-nums">{fmt(v.inv)}</TableCell><TableCell className="text-right tabular-nums">{fmt(v.fac)}</TableCell><TableCell className="text-right tabular-nums">{fmt(v.mar)}</TableCell><TableCell className="text-right"><RoiCell v={v.inv ? v.mar / v.inv : 0} /></TableCell></TableRow>
        ))}
        maxH="max-h-60"
      />
      <Tabla
        cols={[{ t: 'Cliente' }, { t: 'Zona' }, { t: 'Grupo' }, { t: 'Piezas en comodato', num: true }, { t: 'Facturación acumulada', num: true }, { t: 'Margen acumulado', num: true }, { t: 'ROI (veces)', num: true }, { t: 'Estado' }, { t: 'Tendencia' }]}
        filas={clientes.map((d, i) => (
          <TableRow key={i} className="cursor-pointer" onClick={() => abrir({ tipo: 'cliente', razon: t(d, F.razon) })}>
            <TableCell><b>{t(d, F.razon)}</b><div className="text-[11px] text-text-faint">{t(d, F.cliente)}</div></TableCell>
            <TableCell>{fmtZona(d[F.zona]) || '—'}</TableCell>
            <TableCell>{t(d, F.grupo) || '—'}</TableCell>
            <TableCell className="text-right tabular-nums">{num(d[F.cant])}</TableCell>
            <TableCell className="text-right tabular-nums">{fmt(d[F.fact])}</TableCell>
            <TableCell className="text-right tabular-nums">{fmt(d[F.margen])}</TableCell>
            <TableCell className="text-right"><RoiCell v={d[F.roi]} /></TableCell>
            <TableCell><Pill s={d[F.status]} /></TableCell>
            <TableCell><TendIcon t={d[F.tend]} /></TableCell>
          </TableRow>
        ))}
        cuenta="clic = ficha del cliente"
        maxH="max-h-80"
      />
    </div>
  );
}

function DetalleMes({ periodo, cliCod, equipoCod, metric }: { periodo: string; cliCod?: string; equipoCod?: string; metric: 'importe' | 'bolsas' }) {
  const { serie, rows, codToRazon, abrir } = useTablero();
  const entradas = useMemo(() => {
    const general = !cliCod && !equipoCod;
    const claves = new Set(rows.map((d) => `${t(d, F.cliente)}|${t(d, F.mat)}`));
    const clientes = new Set(rows.map((d) => t(d, F.cliente)));
    const por = new Map<string, { imp: number; bol: number; mar: number; pz: number }>();
    for (const r of serie) {
      if (r.periodo !== periodo) continue;
      if (cliCod && r.cliente !== cliCod) continue;
      if (equipoCod && r.codigo_equipo !== equipoCod) continue;
      if (general && !(r.codigo_equipo !== '' ? claves.has(`${r.cliente}|${r.codigo_equipo}`) : clientes.has(r.cliente))) continue;
      const v = por.get(r.cliente) ?? { imp: 0, bol: 0, mar: 0, pz: 0 };
      v.imp += r.importe_mes; v.bol += r.bolsas_mes; v.mar += r.margen_mes; v.pz += r.piezas_netas_mes;
      por.set(r.cliente, v);
    }
    return [...por.entries()].filter(([, v]) => v.imp || v.bol || v.mar || v.pz).sort((a, b) => (metric === 'bolsas' ? b[1].bol - a[1].bol : b[1].imp - a[1].imp));
  }, [serie, rows, periodo, cliCod, equipoCod, metric]);
  const sum = (k: 'imp' | 'bol' | 'mar' | 'pz') => entradas.reduce((a, [, v]) => a + v[k], 0);
  const totImp = sum('imp');
  return (
    <div className="flex flex-col gap-4">
      <Encabezado titulo={`📆 ${lblMes(periodo)} — detalle por cliente`} sub={`${entradas.length} cliente(s) con actividad en el mes${equipoCod ? ` · equipo ${equipoCod}` : ''} · clic en un cliente para ver su ficha completa`} />
      <KpiGrid cols={4}>
        <Kpi label="Facturación del mes" value={fmt(totImp)} />
        <Kpi label="Margen del mes" value={fmt(sum('mar'))} />
        <Kpi label="Bolsas facturadas" value={fmtN(sum('bol'))} />
        <Kpi label="Piezas de comodato colocadas" value={fmtN(sum('pz'))} />
      </KpiGrid>
      <Tabla
        cols={[{ t: 'Cliente' }, { t: 'Facturación del mes', num: true }, { t: 'Bolsas del mes', num: true }, { t: 'Margen del mes', num: true }, { t: 'Piezas de comodato del mes', num: true }, { t: '% de la facturación del mes', num: true }]}
        filas={entradas.length ? entradas.map(([cod, v]) => {
          const razon = codToRazon.get(cod) ?? `Cliente ${cod}`;
          return (
            <TableRow key={cod} className={cn(codToRazon.has(cod) && 'cursor-pointer')} onClick={() => codToRazon.has(cod) && abrir({ tipo: 'cliente', razon })}>
              <TableCell><b>{razon}</b><div className="text-[11px] text-text-faint">{cod}</div></TableCell>
              <TableCell className="text-right tabular-nums">{fmt(v.imp)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmtN(v.bol)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmt(v.mar)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmtN(v.pz)}</TableCell>
              <TableCell className="text-right tabular-nums">{totImp ? Math.round((v.imp / totImp) * 100) : 0}%</TableCell>
            </TableRow>
          );
        }) : [<TableRow key="v"><TableCell colSpan={6} className="text-text-muted">Sin datos para este mes con los filtros actuales.</TableCell></TableRow>]}
        maxH="max-h-96"
      />
    </div>
  );
}

