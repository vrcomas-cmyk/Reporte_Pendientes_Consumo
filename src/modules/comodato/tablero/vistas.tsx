import { useMemo } from 'react';
import { Select } from '@/components/ui/select';
import { TableCell, TableRow } from '@/components/ui/table';
import {
  F, ORDEN_FRECUENCIA, contarPor, cubetaFrecuencia, esCarrito, esCom, esComplemento, fmtZona, nCom, num, ordenarFilas, sinFacturar, sumCant, sumarPor, tipoEq, type Fila,
} from '@/core/comodatoTablero';
import { BarrasH, BurbujaChart, DonaChart } from './graficas';
import { COLOR, DESC_RECUP, DESC_RENT, DESC_STATUS, Kpi, KpiGrid, Pill, RecupCell, RoiCell, STATUS_KEYS, Seccion, Tabla, TendIcon, TipoTag, fmt, fmtK, fmtN, pct, rentColor, statusColor, t } from './piezas';
import { EquipoTable, BolsaTable } from './tablas';
import { ComparativoCard, Tendencia3Card } from './periodos';
import { EvolucionCard } from './evolucion';
import { useTablero } from './contexto';

const diaCorto = (iso: unknown): string => {
  const s = String(iso ?? '');
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
};
const sum = (rows: Fila[], k: string) => rows.reduce((a, d) => a + num(d[k]), 0);

// =================== DIRECCIÓN ===================
export function VistaDireccion() {
  const { rows, alternar, abrir, bolsas } = useTablero();
  const r = useMemo(() => {
    const fact = sum(rows, F.fact);
    const marg = sum(rows, F.margen);
    const inv = sum(rows, F.inv);
    const rent = rows.filter((d) => d[F.rentable] === 'Rentable').length;
    const carr = rows.filter(esCarrito);
    const stats = new Map<string, { n: number; inv: number; fac: number; mar: number }>();
    const byCli = new Map<string, { inv: number; fac: number; mar: number; eq: number }>();
    for (const d of rows) {
      const s = t(d, F.status);
      const a = stats.get(s) ?? { n: 0, inv: 0, fac: 0, mar: 0 };
      if (esCom(d)) a.n++;
      a.inv += num(d[F.inv]); a.fac += num(d[F.fact]); a.mar += num(d[F.margen]);
      stats.set(s, a);
      const n = t(d, F.razon);
      const c = byCli.get(n) ?? { inv: 0, fac: 0, mar: 0, eq: 0 };
      c.inv += num(d[F.inv]); c.fac += num(d[F.fact]); c.mar += num(d[F.margen]); c.eq++;
      byCli.set(n, c);
    }
    return {
      fact, marg, inv, rent, carr, clientes: new Set(rows.map((d) => t(d, F.cliente))).size, activos: rows.filter((d) => d[F.status] === 'Activo').length, sf: rows.filter(sinFacturar).length,
      stats: [...stats.entries()].sort((a, b) => b[1].fac - a[1].fac),
      top: [...byCli.entries()].sort((a, b) => b[1].fac - a[1].fac).slice(0, 15),
      factStatus: sumarPor(rows, F.status, F.fact),
      rentCount: contarPor(rows, F.rentable),
      grupoFac: sumarPor(rows.filter((d) => d[F.grupo]), F.grupo, F.fact),
    };
  }, [rows]);

  const bubbles = STATUS_KEYS.map((s) => ({
    name: s, color: statusColor(s),
    puntos: rows.filter((d) => d[F.status] === s).map((d) => ({ x: num(d[F.inv]), y: num(d[F.margen]), z: Math.max(1, num(d[F.fact])), etiqueta: t(d, F.razon) })),
  })).filter((s) => s.puntos.length);

  return (
    <div className="flex flex-col gap-4">
      <KpiGrid cols={8}>
        <Kpi label="Facturación total" value={fmtK(r.fact)} sub={`${nCom(rows)} comodatos`} />
        <Kpi label="Margen total" value={fmtK(r.marg)} sub={`${pct(r.marg, r.fact)} sobre venta`} />
        <Kpi label="Inversión comodato" value={fmtK(r.inv)} sub={`ROI global ${r.inv ? (r.marg / r.inv).toFixed(1) : 0}x`} />
        <Kpi label="Ganancia neta" value={fmtK(r.marg - r.inv)} sub="margen − inversión" />
        <Kpi label="Clientes (solicitantes)" value={r.clientes} sub="únicos" />
        <Kpi label="% de equipos rentables" value={pct(r.rent, nCom(rows))} sub={`${r.rent} rentables`} />
        <Kpi label="Carritos (piezas)" value={`${sumCant(r.carr).toLocaleString('es-MX')} pzs`} sub={`${r.carr.length} equipos · ${new Set(r.carr.map((d) => t(d, F.cliente))).size} clientes`} onClick={() => alternar('tipo', 'Carrito')} />
        <Kpi label="Canisters sin facturar" value={r.sf} sub="por activar" onClick={() => alternar('status', 'Sin compra')} />
      </KpiGrid>
      <Tendencia3Card />
      <ComparativoCard />
      <EquipoTable rows={rows} onEquipo={(desc, cod) => abrir({ tipo: 'canister', desc, cod })} />
      <BolsaTable bolsas={bolsas} />
      <EvolucionCard />
      <div className="grid gap-4 lg:grid-cols-2">
        <Seccion titulo="Facturación acumulada por estado del equipo" hint="(clic en una rebanada filtra)">
          <DonaChart datos={Object.entries(r.factStatus).map(([name, value]) => ({ name, valor: value, color: statusColor(name) }))} formato={fmt} etiqueta="Facturación" descripciones={DESC_STATUS} onClick={(s) => alternar('status', s)} />
        </Seccion>
        <Seccion titulo="Rentabilidad" hint="(clic filtra)">
          <BarrasH datos={Object.entries(r.rentCount).map(([name, value]) => ({ name, valor: value, color: rentColor(name) }))} formato={(n) => String(Math.round(n))} etiqueta="Equipos" onClick={(v) => alternar('rent', v)} ancho={170} />
          <Leyenda items={Object.keys(r.rentCount).map((k) => [k, DESC_RENT[k] ?? ''] as const)} />
        </Seccion>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Seccion titulo="🏷️ Facturación por grupo de cliente" hint="(clic filtra)">
          <BarrasH datos={Object.entries(r.grupoFac).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, valor: value, color: COLOR.accent }))} formato={(n) => fmtK(n)} etiqueta="Facturación" onClick={(g) => alternar('grupo', g)} alto={280} />
        </Seccion>
        <Seccion titulo="Inversión vs Margen" hint="(burbuja = facturación)"><BurbujaChart series={bubbles} /></Seccion>
      </div>
      <Tabla
        titulo="📌 Resumen por estado del equipo (clic para filtrar)"
        cols={[{ t: 'Estado' }, { t: 'Equipos en comodato', num: true }, { t: 'Inversión en comodato', num: true }, { t: 'Facturación acumulada', num: true }, { t: 'Margen acumulado', num: true }, { t: 'ROI (veces)', num: true }]}
        filas={r.stats.map(([s, v]) => (
          <TableRow key={s} className="cursor-pointer" onClick={() => alternar('status', s)}>
            <TableCell><Pill s={s} /></TableCell><TableCell className="text-right tabular-nums">{v.n}</TableCell><TableCell className="text-right tabular-nums">{fmt(v.inv)}</TableCell>
            <TableCell className="text-right tabular-nums">{fmt(v.fac)}</TableCell><TableCell className="text-right tabular-nums">{fmt(v.mar)}</TableCell><TableCell className="text-right"><RoiCell v={v.inv ? v.mar / v.inv : 0} /></TableCell>
          </TableRow>
        ))}
        cuenta={`${r.stats.length} grupos`}
        maxH="max-h-72"
      />
      <Tabla
        titulo="🏆 Top 15 clientes por facturación (clic = ficha)"
        cols={[{ t: 'Cliente' }, { t: 'Equipos asignados', num: true }, { t: 'Inversión en comodato', num: true }, { t: 'Facturación acumulada', num: true }, { t: 'Margen acumulado', num: true }, { t: 'ROI (veces)', num: true }]}
        filas={r.top.map(([n, v]) => (
          <TableRow key={n} className="cursor-pointer" onClick={() => abrir({ tipo: 'cliente', razon: n })}>
            <TableCell><b>{n}</b></TableCell><TableCell className="text-right tabular-nums">{v.eq}</TableCell><TableCell className="text-right tabular-nums">{fmt(v.inv)}</TableCell>
            <TableCell className="text-right tabular-nums">{fmt(v.fac)}</TableCell><TableCell className="text-right tabular-nums">{fmt(v.mar)}</TableCell><TableCell className="text-right"><RoiCell v={v.inv ? v.mar / v.inv : 0} /></TableCell>
          </TableRow>
        ))}
        cuenta="15 clientes"
        maxH="max-h-[28rem]"
      />
    </div>
  );
}

// =================== GERENCIAL ===================
/** Explicación breve bajo una gráfica. */
function Leyenda({ items, nota }: { items: readonly (readonly [string, string])[]; nota?: string }) {
  return (
    <div className="mt-2 border-t border-border pt-2 text-[11px] text-text-muted">
      <dl className="grid gap-x-4 gap-y-0.5 sm:grid-cols-[max-content_1fr]">
        {items.map(([k, v]) => <div key={k} className="contents"><dt className="font-medium text-text">{k}</dt><dd>{v}</dd></div>)}
      </dl>
      {nota && <p className="mt-1 text-text-faint">{nota}</p>}
    </div>
  );
}

export function VistaGerencial() {
  const { rows, alternar, abrir } = useTablero();
  const r = useMemo(() => {
    const recupSi = rows.filter((d) => t(d, F.recup).startsWith('Sí'));
    const sf = rows.filter(sinFacturar);
    const rec = new Map<string, { n: number; inv: number; mar: number }>();
    for (const d of rows) {
      const k = t(d, F.recup);
      const v = rec.get(k) ?? { n: 0, inv: 0, mar: 0 };
      if (esCom(d)) v.n++;
      v.inv += num(d[F.inv]); v.mar += num(d[F.margen]);
      rec.set(k, v);
    }
    const freq: Record<string, number> = {};
    for (const d of rows) if (!esCarrito(d) && !esComplemento(d)) { const b = cubetaFrecuencia(d[F.mesesFact], num(d[F.fact]) > 0); freq[b] = (freq[b] ?? 0) + 1; }
    return {
      recupSi, sf,
      visitar: rows.filter((d) => num(d[F.dias]) > 90 && !['Complementario', 'Sin compra'].includes(t(d, F.status))).length,
      roiCayendo: rows.filter((d) => num(d[F.roi]) > 2 && d[F.tend] === 'Cayendo').length,
      invNoRent: rows.filter((d) => ['No rentable', 'Margen positivo (no cubre inversión)'].includes(t(d, F.rentable))).reduce((a, d) => a + num(d[F.inv]), 0),
      enRiesgo: rows.filter((d) => d[F.status] === 'En riesgo').length,
      invRecup: sumarPor(rows, F.recup, F.inv),
      rec: [...rec.entries()].sort((a, b) => b[1].inv - a[1].inv),
      freq,
      recupTop: [...recupSi].sort((a, b) => num(a[F.roi]) - num(b[F.roi])).slice(0, 50),
    };
  }, [rows]);
  const paleta = [COLOR.good, COLOR.warn, COLOR.danger, COLOR.neutral, COLOR.info];
  const filaCliente = (d: Fila) => <><b>{t(d, F.razon)}</b><div className="text-[11px] text-text-faint">{t(d, F.cliente)}</div></>;

  return (
    <div className="flex flex-col gap-4">
      <KpiGrid cols={6}>
        <Kpi label="Equipos recuperables" value={r.recupSi.length} sub="recuperable = Sí" />
        <Kpi label="Clientes a visitar" value={r.visitar} sub=">90 días sin compra" />
        <Kpi label="Rentables apagándose" value={r.roiCayendo} sub="ROI>2 y cayendo" onClick={() => alternar('tend', 'Cayendo')} />
        <Kpi label="Canisters sin facturar" value={r.sf.length} sub="colocados sin venta" onClick={() => alternar('status', 'Sin compra')} />
        <Kpi label="Inversión no recuperada" value={fmtK(r.invNoRent)} sub="comodatos no rentables" />
        <Kpi label="En riesgo" value={r.enRiesgo} sub="91–150 días" onClick={() => alternar('status', 'En riesgo')} />
      </KpiGrid>
      <div className="grid gap-4 lg:grid-cols-2">
        <Seccion titulo="Inversión por estado de recuperación" hint="(clic filtra)">
          <BarrasH datos={Object.entries(r.invRecup).map(([name, value], i) => ({ name, valor: value, color: paleta[i % paleta.length]! }))} formato={fmtK} etiqueta="Inversión en comodato" onClick={(v) => alternar('recup', v)} ancho={150} />
          <Leyenda items={Object.keys(r.invRecup).map((k) => [k, DESC_RECUP[k] ?? ''] as const)} nota="Los tres primeros grupos no requieren acción de recuperación: cliente vigente, equipo complementario o factura sin equipo en comodato." />
        </Seccion>
        <Seccion titulo="Frecuencia de facturación (meses)">
          <BarrasH datos={ORDEN_FRECUENCIA.filter((o) => r.freq[o]).map((name) => ({ name, valor: r.freq[name]!, color: COLOR.accent }))} formato={(n) => String(Math.round(n))} etiqueta="Equipos" ancho={130} />
          <Leyenda
            items={[['Mensual … +6m', 'Meses promedio entre un pedido-mes y el siguiente.'], ['Un solo mes con venta', 'Solo ha facturado en un mes: no hay intervalo que medir.'], ['Sin compras', 'Aún no factura nada.']]}
            nota="Cuenta equipos canister (sin carritos ni complementos)."
          />
        </Seccion>
      </div>
      <EvolucionCard />
      <Tabla
        titulo="📊 Inversión y margen por recuperabilidad (clic filtra)"
        cols={[{ t: 'Recuperable' }, { t: 'Equipos en comodato', num: true }, { t: 'Inversión en comodato', num: true }, { t: 'Margen acumulado', num: true }]}
        filas={r.rec.map(([k, v]) => (
          <TableRow key={k} className="cursor-pointer" onClick={() => alternar('recup', k)}>
            <TableCell><RecupCell v={k} /></TableCell><TableCell className="text-right tabular-nums">{v.n}</TableCell><TableCell className="text-right tabular-nums">{fmt(v.inv)}</TableCell><TableCell className="text-right tabular-nums">{fmt(v.mar)}</TableCell>
          </TableRow>
        ))}
        cuenta={`${r.rec.length} grupos`}
        maxH="max-h-64"
      />
      <Tabla
        titulo="🔧 Recuperación de equipos — prioridad por ROI"
        cols={[{ t: 'Cliente' }, { t: 'Equipo' }, { t: 'Piezas en comodato', num: true }, { t: 'Inversión en comodato', num: true }, { t: 'ROI (veces)', num: true }, { t: 'Margen acumulado', num: true }, { t: 'Días sin compra', num: true }, { t: 'Recuperable' }, { t: 'Acción sugerida' }]}
        filas={r.recupTop.map((d, i) => (
          <TableRow key={i} className="cursor-pointer" onClick={() => abrir({ tipo: 'cliente', razon: t(d, F.razon) })}>
            <TableCell>{filaCliente(d)}</TableCell><TableCell>{t(d, F.desc)}</TableCell><TableCell className="text-right tabular-nums">{num(d[F.cant])}</TableCell>
            <TableCell className="text-right tabular-nums">{fmt(d[F.inv])}</TableCell><TableCell className="text-right"><RoiCell v={d[F.roi]} /></TableCell><TableCell className="text-right tabular-nums">{fmt(d[F.margen])}</TableCell>
            <TableCell className="text-right tabular-nums">{d[F.dias] != null ? String(d[F.dias]) : ''}</TableCell><TableCell><RecupCell v={d[F.recup]} /></TableCell><TableCell className="max-w-72 text-xs">{t(d, F.accion)}</TableCell>
          </TableRow>
        ))}
        cuenta={`${r.recupTop.length} equipos`}
        maxH="max-h-[28rem]"
      />
      <Tabla
        titulo="⚠️ Canisters colocados SIN facturar — activar 1er pedido"
        cols={[{ t: 'Cliente' }, { t: 'Equipo' }, { t: 'Piezas en comodato', num: true }, { t: 'Inversión en comodato', num: true }, { t: 'Última entrega de comodato' }, { t: 'Frecuencia de entrega (días)', num: true }, { t: 'Acción sugerida' }]}
        filas={ordenarFilas(r.sf, F.razon, 1).map((d, i) => (
          <TableRow key={i} className="cursor-pointer" onClick={() => abrir({ tipo: 'cliente', razon: t(d, F.razon) })}>
            <TableCell>{filaCliente(d)}</TableCell><TableCell>{t(d, F.desc)}</TableCell><TableCell className="text-right tabular-nums">{num(d[F.cant])}</TableCell><TableCell className="text-right tabular-nums">{fmt(d[F.inv])}</TableCell>
            <TableCell>{t(d, F.umComod) || '—'}</TableCell><TableCell className="text-right tabular-nums">{d[F.diasComod] != null ? String(d[F.diasComod]) : '—'}</TableCell><TableCell className="max-w-72 text-xs">{t(d, F.accion)}</TableCell>
          </TableRow>
        ))}
        cuenta={`${r.sf.length} canisters`}
        maxH="max-h-[28rem]"
      />
    </div>
  );
}

// =================== COMERCIAL ===================
const COLS_COM: { k: string | null; t: string; num?: boolean }[] = [
  { k: F.razon, t: 'Cliente' }, { k: F.zona, t: 'Zona' }, { k: F.grupo, t: 'Grupo' }, { k: F.desc, t: 'Equipo' }, { k: null, t: 'Tipo' }, { k: F.cant, t: 'Piezas en comodato', num: true },
  { k: F.fact, t: 'Facturación acumulada', num: true }, { k: F.margen, t: 'Margen acumulado', num: true }, { k: F.roi, t: 'ROI (veces)', num: true }, { k: F.dias, t: 'Días sin compra', num: true }, { k: F.tend, t: 'Tendencia' },
  { k: F.status, t: 'Estado' }, { k: F.umFact, t: 'Último mes facturado' }, { k: F.umFactImp, t: 'Importe último mes', num: true }, { k: F.pmFact, t: 'Penúltimo mes' }, { k: F.pmFactImp, t: 'Importe penúltimo', num: true },
  { k: F.ultFact, t: 'Última facturación' }, { k: F.umComod, t: 'Última entrega de comodato' }, { k: F.mesesFact, t: 'Frecuencia (meses)', num: true }, { k: F.accion, t: 'Acción sugerida' },
];

export function VistaComercial() {
  const { rows, data, filtros, aplicar, alternar, abrir, orden, setOrden } = useTablero();
  const s = useMemo(() => ordenarFilas(rows, orden.sort, orden.dir), [rows, orden]);
  const clientes = useMemo(() => [...new Set(data.map((d) => t(d, F.razon)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')), [data]);
  const cols = COLS_COM.map((c) => ({
    t: c.k ? <>{c.t} ⇅</> : c.t, num: c.num, className: 'whitespace-nowrap',
    onSort: c.k ? () => setOrden({ sort: c.k!, dir: orden.sort === c.k ? (orden.dir === 1 ? -1 : 1) : 1 }) : undefined,
  }));
  const recs = filtros.cliente ? data.filter((d) => d[F.razon] === filtros.cliente) : [];
  const tot = (k: string) => recs.reduce((a, d) => a + num(d[k]), 0);

  return (
    <div className="flex flex-col gap-4">
      <KpiGrid cols={4}>
        <Kpi label="Registros filtrados" value={rows.length} />
        <Kpi label="En riesgo/inactivos" value={rows.filter((d) => ['En riesgo', 'Inactivo'].includes(t(d, F.status))).length} sub="contactar" />
        <Kpi label="Carritos (piezas)" value={`${sumCant(rows.filter(esCarrito)).toLocaleString('es-MX')} pzs`} sub={`${rows.filter(esCarrito).length} equipos`} onClick={() => alternar('tipo', 'Carrito')} />
        <Kpi label="Canisters sin facturar" value={rows.filter(sinFacturar).length} sub="por activar" onClick={() => alternar('status', 'Sin compra')} />
      </KpiGrid>
      <Seccion titulo="🪪 Ficha de cliente">
        <Select value={filtros.cliente} onChange={(ev) => aplicar({ cliente: ev.target.value })} className="max-w-md" aria-label="Cliente">
          <option value="">— Selecciona (o clic en una fila) —</option>
          {clientes.map((n) => <option key={n} value={n}>{n}</option>)}
        </Select>
        {!recs.length ? (
          <p className="mt-2 text-sm text-text-muted">Elige un cliente o haz clic en una fila para ver su ficha con fechas y consumo.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
              {[['Cliente', filtros.cliente], ['Solicitante', t(recs[0]!, F.cliente)], ['Equipos', recs.length], ['Piezas totales', tot(F.cant)], ['Inversión comodato', fmt(tot(F.inv))], ['Facturación total', fmt(tot(F.fact))], ['Margen total', fmt(tot(F.margen))], ['Bolsas facturadas', fmtN(tot(F.bolsas))]].map(([l, v]) => (
                <div key={String(l)}><div className="text-[11px] uppercase tracking-wide text-text-faint">{l}</div><div className="font-medium tabular-nums">{v}</div></div>
              ))}
            </div>
            <Tabla
              cols={[{ t: 'Equipo' }, { t: 'Tipo' }, { t: 'Piezas en comodato', num: true }, { t: 'Estado' }, { t: 'Tendencia' }, { t: 'ROI (veces)', num: true }, { t: 'Última facturación' }, { t: 'Último mes facturado' }, { t: 'Importe último mes', num: true }, { t: 'Penúltimo mes' }, { t: 'Importe penúltimo', num: true }, { t: 'Última entrega de comodato' }, { t: 'Piezas última entrega', num: true }, { t: 'Penúltima entrega' }, { t: 'Frecuencia de entrega (meses)', num: true }, { t: 'Acción sugerida' }]}
              filas={recs.map((d, i) => (
                <TableRow key={i}>
                  <TableCell>{t(d, F.desc)}</TableCell><TableCell><TipoTag tipo={tipoEq(d)} /></TableCell><TableCell className="text-right tabular-nums">{num(d[F.cant])}</TableCell>
                  <TableCell><Pill s={d[F.status]} /></TableCell><TableCell><TendIcon t={d[F.tend]} /></TableCell><TableCell className="text-right"><RoiCell v={d[F.roi]} /></TableCell>
                  <TableCell>{diaCorto(d[F.ultFact])}</TableCell><TableCell>{t(d, F.umFact) || '—'}</TableCell><TableCell className="text-right tabular-nums">{fmt(d[F.umFactImp])}</TableCell>
                  <TableCell>{t(d, F.pmFact) || '—'}</TableCell><TableCell className="text-right tabular-nums">{fmt(d[F.pmFactImp])}</TableCell>
                  <TableCell>{t(d, F.umComod) || '—'}</TableCell><TableCell className="text-right tabular-nums">{d[F.umComodCant] != null ? String(d[F.umComodCant]) : '—'}</TableCell>
                  <TableCell>{t(d, F.pmComod) || '—'}</TableCell><TableCell className="text-right tabular-nums">{num(d[F.mesesComod]).toFixed(1)}</TableCell><TableCell className="max-w-64 text-xs">{t(d, F.accion)}</TableCell>
                </TableRow>
              ))}
              maxH="max-h-72"
            />
          </div>
        )}
      </Seccion>
      <EvolucionCard />
      <Tabla
        titulo="📋 Seguimiento comercial — ordenado por cliente"
        cols={cols}
        filas={s.slice(0, 1000).map((d, i) => (
          <TableRow key={i} className="cursor-pointer" onClick={() => abrir({ tipo: 'cliente', razon: t(d, F.razon) })}>
            <TableCell className="whitespace-nowrap"><b>{t(d, F.razon)}</b><div className="text-[11px] text-text-faint">{t(d, F.cliente)}</div></TableCell>
            <TableCell>{fmtZona(d[F.zona]) || '—'}</TableCell><TableCell>{t(d, F.grupo) || '—'}</TableCell><TableCell className="whitespace-nowrap">{t(d, F.desc)}</TableCell><TableCell><TipoTag tipo={tipoEq(d)} /></TableCell>
            <TableCell className="text-right tabular-nums">{num(d[F.cant])}</TableCell><TableCell className="text-right tabular-nums">{fmt(d[F.fact])}</TableCell><TableCell className="text-right tabular-nums">{fmt(d[F.margen])}</TableCell>
            <TableCell className="text-right"><RoiCell v={d[F.roi]} /></TableCell><TableCell className="text-right tabular-nums">{d[F.dias] != null ? String(d[F.dias]) : ''}</TableCell>
            <TableCell><TendIcon t={d[F.tend]} /></TableCell><TableCell><Pill s={d[F.status]} /></TableCell>
            <TableCell>{t(d, F.umFact) || '—'}</TableCell><TableCell className="text-right tabular-nums">{fmt(d[F.umFactImp])}</TableCell>
            <TableCell>{t(d, F.pmFact) || '—'}</TableCell><TableCell className="text-right tabular-nums">{fmt(d[F.pmFactImp])}</TableCell>
            <TableCell>{diaCorto(d[F.ultFact])}</TableCell><TableCell>{t(d, F.umComod) || '—'}</TableCell>
            <TableCell className="text-right tabular-nums">{num(d[F.mesesFact]).toFixed(1)}</TableCell><TableCell className="max-w-72 text-xs">{t(d, F.accion)}</TableCell>
          </TableRow>
        ))}
        cuenta={`${rows.length} registros · clic en fila = ficha${rows.length > 1000 ? ' · se muestran 1,000' : ''}`}
        maxH="max-h-[36rem]"
      />
    </div>
  );
}
