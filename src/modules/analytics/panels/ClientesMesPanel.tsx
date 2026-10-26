import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { Chip } from '../ui';
import { SubFilter } from './_shared';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { clientesPorMesMaterial, mesLabel, type RFIndex } from '@/core/resumenFac';
import { matchesQuery } from '../helpers';
import { norm } from '@/lib/text';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import type { Panel } from '@/store/panelStore';
import { DonaChart, type Rebanada } from '@/modules/comodato/tablero/graficas';
import { CATEGORICAL } from '@/lib/chartColors';
import { percentilPonderado } from '@/core/politicaPrecios';
import type { Analytics } from '../AnalyticsContext';

const COLORES = CATEGORICAL;
const precioDe = (imp: number, cant: number) => (cant > 0 ? imp / cant : 0);

/** Top 7 por valor + «Otros», con color fijo por rebanada. */
function rebanadas(m: Map<string, number>): Rebanada[] {
  const orden = [...m].filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]);
  const top = orden.slice(0, 7).map(([name, valor], i) => ({ name, valor, color: COLORES[i] }));
  const resto = orden.slice(7).reduce((s, [, v]) => s + v, 0);
  return resto > 0 ? [...top, { name: 'Otros', valor: resto, color: 'var(--text-faint)' }] : top;
}

type Fila = { dest: string; razon: string; solic: string; material: string; cant: number; imp: number; gpoVdor?: string; gpoCte?: string };

/** Grupo de vendedor / grupo de cliente por destinatario (primera fila de
 * Resumen_Fac que lo trae) — para los drills cuyas filas no los cargan. */
const gposCache = new WeakMap<RFIndex, Map<string, { gpoVdor: string; gpoCte: string }>>();
function gposPorDest(rf: RFIndex): Map<string, { gpoVdor: string; gpoCte: string }> {
  let m = gposCache.get(rf);
  if (m) return m;
  m = new Map();
  for (const r of rf.rows) {
    const d = norm(r.destinatario);
    if (!d) continue;
    const cur = m.get(d);
    if (!cur) m.set(d, { gpoVdor: norm(r.gpoVdor), gpoCte: norm(r.gpoCte) });
    else {
      if (!cur.gpoVdor && r.gpoVdor) cur.gpoVdor = norm(r.gpoVdor);
      if (!cur.gpoCte && r.gpoCte) cur.gpoCte = norm(r.gpoCte);
    }
  }
  gposCache.set(rf, m);
  return m;
}

/** Panel — Clientes que facturaron un material en un mes (drill desde EvolChart).
 * Respeta el filtro de la gráfica de origen: `centro` (tendencia de un centro) y/o `dest` (serie de un solo cliente). */
export function ClientesMesPanel({ panel, a, push }: { panel: Extract<Panel, { type: 'clientesMes' }>; a: Analytics; push: (p: Panel) => void }) {
  const rf = a.rf;
  if (!rf) return <p>Sin datos.</p>;
  const list = clientesPorMesMaterial(rf, panel.material, panel.mes, { centro: panel.centro, dest: panel.dest });
  const filtros = [panel.centro && `Centro ${panel.centro}`, panel.dest && `Destinatario ${panel.dest}`].filter(Boolean).join(' · ');
  return (
    <ClientesMesInner
      a={a}
      title={`${panel.material} · ${mesLabel(panel.mes)}`}
      descripcion={rf.matTexto.get(norm(panel.material)) || a.enrich.matTexto(panel.material)}
      subtitle={`Clientes que facturaron este material en el mes${filtros ? ` · ${filtros}` : ''}`}
      list={list.map((c) => ({ dest: c.dest, razon: c.razon, solic: c.solic, material: panel.material, cant: c.cant, imp: c.imp, gpoVdor: c.gpoVdor, gpoCte: c.gpoCte }))}
      push={push}
    />
  );
}

/** Panel — Clientes que facturaron un mes respetando los filtros activos (drill desde chart de facturación). */
export function MesClientesFiltroPanel({ panel, a, push }: { panel: Extract<Panel, { type: 'mesClientesFiltro' }>; a: Analytics; push: (p: Panel) => void }) {
  return (
    <ClientesMesInner
      a={a}
      title={`Facturación · ${mesLabel(panel.mes)}`}
      subtitle="Clientes que facturaron ese mes, respetando los filtros activos"
      list={panel.rows.map((r) => ({ dest: r.dest, razon: r.razon, solic: r.solic, material: r.material, cant: r.cant, imp: r.imp }))}
      push={push}
    />
  );
}

/** Encabezado de un bloque: texto plano con filete, sin caja — el orden lo da la rejilla, no los contenedores. */
function Bloque({ titulo, nota, children, className = '' }: { titulo: string; nota?: string; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      <div className="mb-2 flex items-baseline justify-between gap-3 border-b border-border pb-1">
        <h3 className="text-sm font-semibold">{titulo}</h3>
        {nota && <span className="text-[11px] text-text-faint">{nota}</span>}
      </div>
      {children}
    </section>
  );
}

/** Ranking con barra proporcional: lee de un vistazo quién pesa más y cuánto. */
function Ranking({ filas, total }: { filas: { key: string; etiqueta: ReactNode; detalle?: string; valor: number }[]; total: number }) {
  const max = Math.max(1, ...filas.map((f) => f.valor));
  return (
    <ul className="divide-y divide-border/60">
      {filas.map((f) => (
        <li key={f.key} className="grid grid-cols-[minmax(0,1.4fr)_minmax(4rem,1fr)_auto_2.5rem] items-center gap-3 py-1.5 text-sm">
          <div className="min-w-0"><div className="truncate">{f.etiqueta}</div>{f.detalle && <div className="truncate text-[11px] text-text-faint" title={f.detalle}>{f.detalle}</div>}</div>
          <div className="h-1.5 rounded-full bg-bg-inset" aria-hidden><div className="h-full rounded-full bg-accent/70" style={{ width: `${Math.max(2, (f.valor / max) * 100)}%` }} /></div>
          <span className="text-right tabular-nums">{formatCurrency(f.valor)}</span>
          <span className="text-right text-xs tabular-nums text-text-muted">{total > 0 ? `${Math.round((f.valor / total) * 100)}%` : '-'}</span>
        </li>
      ))}
    </ul>
  );
}

/** Regla de precios: dónde caen el promedio y la mediana dentro del rango mín–máx del mes. */
function ReglaPrecios({ min, p50, promedio, max }: { min: number; p50: number; promedio: number; max: number }) {
  if (!max) return <p className="text-sm text-text-muted">Sin precios en el mes.</p>;
  const pos = (v: number) => (max > min ? Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100)) : 50);
  return (
    <div>
      <div className="relative mx-2 h-6" role="img" aria-label={`Precio mínimo ${formatCurrency(min)}, mediana ${formatCurrency(p50)}, promedio ${formatCurrency(promedio)}, máximo ${formatCurrency(max)}`}>
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-bg-inset" />
        <div className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-text-faint" style={{ left: `${pos(p50)}%` }} />
        <div className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-2 ring-bg" style={{ left: `${pos(promedio)}%` }} />
      </div>
      <dl className="mt-1 grid grid-cols-4 gap-2 text-xs">
        {([['Mínimo', min], ['Mediana', p50], ['Promedio', promedio], ['Máximo', max]] as const).map(([k, v]) => (
          <div key={k}><dt className="text-text-faint">{k}</dt><dd className="font-mono text-sm font-semibold tabular-nums">{formatCurrency(v)}</dd></div>
        ))}
      </dl>
    </div>
  );
}

/** Lista presentacional de clientes con facturación para un mes+material o mes para filtros activos. Orden de lectura: cifras del mes (importe al frente,
 * regla de precios al lado) → de qué se compone (grupo, ejecutivo, materiales) junto a quién lo compró (clientes, expandibles por material). */
function ClientesMesInner({ a, title, descripcion, subtitle, list, push }: {
  a: Analytics;
  title: string;
  descripcion?: string;
  subtitle: string;
  list: Fila[];
  push: (p: Panel) => void;
}) {
  const [f, setF] = useState('');
  const [openDest, setOpenDest] = useState<string | null>(null);
  const { rf, enrich } = a;
  const byDest = useMemoDest(list, rf, enrich);
  const dash = useMemo(() => {
    let cant = 0; let imp = 0;
    const puntos: { valor: number; peso: number }[] = [];
    const porGrupo = new Map<string, number>();
    const porEjec = new Map<string, number>();
    const matDet = new Map<string, { material: string; cant: number; imp: number; min: number; max: number }>();
    for (const d of byDest) {
      cant += d.cant; imp += d.imp;
      porGrupo.set(d.grupo || '(sin grupo)', (porGrupo.get(d.grupo || '(sin grupo)') ?? 0) + d.imp);
      porEjec.set(d.ejecutivo || '(sin ejecutivo)', (porEjec.get(d.ejecutivo || '(sin ejecutivo)') ?? 0) + d.imp);
      for (const it of d.items) {
        const m = matDet.get(it.material) ?? { material: it.material, cant: 0, imp: 0, min: Infinity, max: 0 };
        m.cant += it.cant; m.imp += it.imp;
        if (it.cant > 0 && it.imp > 0) {
          const p = it.imp / it.cant;
          puntos.push({ valor: p, peso: it.cant });
          m.min = Math.min(m.min, p); m.max = Math.max(m.max, p);
        }
        matDet.set(it.material, m);
      }
    }
    const valores = puntos.map((p) => p.valor);
    return {
      cant, imp, clientes: byDest.length, materiales: matDet.size,
      min: valores.length ? Math.min(...valores) : 0, max: valores.length ? Math.max(...valores) : 0,
      promedio: precioDe(imp, cant), p50: percentilPonderado(puntos, 0.5),
      grupo: rebanadas(porGrupo),
      ejec: [...porEjec].filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]),
      topMat: [...matDet.values()].sort((x, y) => y.imp - x.imp).slice(0, 10),
      top5: byDest.slice(0, 5).reduce((s, d) => s + d.imp, 0),
    };
  }, [byDest]);
  const shown = f ? byDest.filter((d) => matchesQuery(f, `${d.dest} ${d.razon} ${d.ejecutivo} ${d.grupo}`)) : byDest;
  const descDe = (material: string) => rf?.matTexto.get(norm(material)) || enrich.matTexto(material);
  const maxImp = Math.max(1, ...byDest.map((d) => d.imp));
  return (
    <div className="space-y-6">
      <header>
        <h2 className="font-display text-2xl font-semibold tracking-tight">{title}</h2>
        {descripcion && <p className="text-sm text-text">{descripcion}</p>}
        <p className="mt-0.5 text-sm text-text-muted">{subtitle}</p>
      </header>

      {/* Cifras del mes: el importe al frente, el resto como línea de apoyo; a su lado, la regla de precios. */}
      <div className="grid gap-6 border-y border-border py-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-10">
        <div>
          <div className="text-xs text-text-muted">Importe facturado</div>
          <div className="font-display text-4xl font-semibold leading-tight tabular-nums">{formatCurrency(dash.imp)}</div>
          <p className="mt-1 text-sm text-text-muted">
            <span className="tabular-nums text-text">{formatNumber(dash.cant)}</span> piezas · <span className="tabular-nums text-text">{formatNumber(dash.clientes)}</span> clientes · <span className="tabular-nums text-text">{formatNumber(dash.materiales)}</span> materiales
          </p>
          {dash.imp > 0 && dash.clientes > 5 && <p className="mt-0.5 text-xs text-text-faint">Los 5 primeros clientes concentran el {Math.round((dash.top5 / dash.imp) * 100)}% del importe.</p>}
        </div>
        <div>
          <div className="mb-1 text-xs text-text-muted">Precio unitario facturado (importe ÷ cantidad)</div>
          <ReglaPrecios min={dash.min} p50={dash.p50} promedio={dash.promedio} max={dash.max} />
        </div>
      </div>

      <div className="grid items-start gap-x-10 gap-y-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="space-y-6">
          <Bloque titulo="Por grupo de cliente" nota="Importe">
            <DonaChart datos={dash.grupo} formato={formatCurrency} etiqueta="Importe" alto={150} />
          </Bloque>
          <Bloque titulo="Por ejecutivo" nota={`${dash.ejec.length} en el mes`}>
            <Ranking total={dash.imp} filas={dash.ejec.slice(0, 8).map(([k, v]) => ({ key: k, etiqueta: k, valor: v }))} />
          </Bloque>
          {dash.materiales > 1 && (
            <Bloque titulo="Materiales con más importe" nota={`${Math.min(10, dash.materiales)} de ${dash.materiales}`}>
              <Ranking
                total={dash.imp}
                filas={dash.topMat.map((m) => ({
                  key: m.material,
                  etiqueta: <Chip onClick={() => push({ type: 'material', material: m.material })}>{m.material}</Chip>,
                  detalle: [descDe(m.material), `${formatNumber(m.cant)} pzas`, m.max > 0 ? (m.min === m.max ? formatCurrency(m.max) : `${formatCurrency(m.min)} – ${formatCurrency(m.max)}`) : ''].filter(Boolean).join(' · '),
                  valor: m.imp,
                }))}
              />
            </Bloque>
          )}
        </div>

        <Bloque titulo="Clientes" nota={`${shown.length} de ${byDest.length}`}>
          <SubFilter value={f} onChange={setF} placeholder="Filtrar cliente, ejecutivo o grupo…" />
          <Table wrapperClassName="mt-2 max-h-[75vh] rounded-lg border border-border">
            <TableHeader><TableRow><TableHead></TableHead><TableHead>Destinatario / Razón social</TableHead><TableHead>Ejecutivo / Grupo cli.</TableHead><TableHead className="text-right">Mat.</TableHead><TableHead className="text-right">Cant.</TableHead><TableHead className="text-right">Precio</TableHead><TableHead className="text-right">Importe</TableHead></TableRow></TableHeader>
            <TableBody>
              {shown.map((d) => {
                const isOpen = openDest === d.dest;
                return (
                  <Fragment key={d.dest}>
                    <TableRow className="cursor-pointer" onClick={() => setOpenDest(isOpen ? null : d.dest)}>
                      <TableCell><ChevronDownIcon open={isOpen} /></TableCell>
                      <TableCell><span onClick={(e) => e.stopPropagation()}><Chip title="Ver el detalle del cliente" onClick={() => push({ type: 'clienteDetalle', dest: d.dest })}>{d.dest}</Chip></span><div className="max-w-72 truncate text-xs text-text-muted" title={d.razon}>{d.razon}</div></TableCell>
                      <TableCell>{d.ejecutivo || '—'}<div className="text-[11px] text-text-faint">{d.grupo || '—'}</div></TableCell>
                      <TableCell className="text-right">{d.items.length}</TableCell>
                      <TableCell className="text-right">{formatNumber(d.cant)}</TableCell>
                      <TableCell className="text-right">{d.cant > 0 && d.imp > 0 ? formatCurrency(precioDe(d.imp, d.cant)) : '-'}</TableCell>
                      <TableCell className="text-right">{formatCurrency(d.imp)}<div className="ml-auto mt-0.5 h-1 rounded-full bg-accent/60" style={{ width: `${Math.max(3, (d.imp / maxImp) * 100)}%` }} aria-hidden /></TableCell>
                    </TableRow>
                    {isOpen && d.items.map((it, i) => (
                      <TableRow key={d.dest + it.material + i} className="bg-bg-inset/40 text-xs">
                        <TableCell></TableCell>
                        <TableCell colSpan={2} className="text-text-faint">
                          <Chip onClick={() => push({ type: 'material', material: it.material })}>{it.material}</Chip>
                          {descDe(it.material) && <div className="mt-0.5 max-w-96 truncate text-[11px] text-text-muted" title={descDe(it.material)}>{descDe(it.material)}</div>}
                        </TableCell>
                        <TableCell></TableCell>
                        <TableCell className="text-right">{formatNumber(it.cant)}</TableCell>
                        <TableCell className="text-right">{it.cant > 0 && it.imp > 0 ? formatCurrency(precioDe(it.imp, it.cant)) : '-'}</TableCell>
                        <TableCell className="text-right">{formatCurrency(it.imp)}</TableCell>
                      </TableRow>
                    ))}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </Bloque>
      </div>
    </div>
  );
}

function ChevronDownIcon({ open }: { open: boolean }) {
  return <span className={`inline-block transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>;
}

function useMemoDest(list: Fila[], rf: RFIndex | null, enrich: Analytics['enrich']) {
  return useMemo(() => {
    const gpos = rf ? gposPorDest(rf) : null;
    const map = new Map<string, { dest: string; razon: string; ejecutivo: string; grupo: string; cant: number; imp: number; items: { material: string; cant: number; imp: number }[] }>();
    for (const c of list) {
      let d = map.get(c.dest);
      if (!d) {
        const g = gpos?.get(norm(c.dest));
        const gv = c.gpoVdor || g?.gpoVdor || '';
        const gc = c.gpoCte || g?.gpoCte || '';
        d = { dest: c.dest, razon: c.razon, ejecutivo: enrich.ejecutivoNombre(gv) || gv, grupo: enrich.grupoCliente(gc) || gc, cant: 0, imp: 0, items: [] };
        map.set(c.dest, d);
      }
      d.cant += c.cant; d.imp += c.imp;
      d.items.push({ material: c.material, cant: c.cant, imp: c.imp });
    }
    return [...map.values()].sort((x, y) => y.imp - x.imp);
  }, [list, rf, enrich]);
}
