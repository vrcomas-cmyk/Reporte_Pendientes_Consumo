import { Fragment, useMemo, useState } from 'react';
import { Chip } from '../ui';
import { Section, SubFilter } from './_shared';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { clientesPorMesMaterial, mesLabel, type RFIndex } from '@/core/resumenFac';
import { matchesQuery } from '../helpers';
import { norm } from '@/lib/text';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import type { Panel } from '@/store/panelStore';
import type { Analytics } from '../AnalyticsContext';

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

/** Lista presentacional de clientes con facturación para un mes+material o mes para filtros activos — dos niveles: por destinatario (con ejecutivo y grupo de cliente), expandible por material (con su descripción). */
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
  const shown = f ? byDest.filter((d) => matchesQuery(f, `${d.dest} ${d.razon} ${d.ejecutivo} ${d.grupo}`)) : byDest;
  const descDe = (material: string) => rf?.matTexto.get(norm(material)) || enrich.matTexto(material);
  return (
    <div>
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {descripcion && <p className="text-sm text-text">{descripcion}</p>}
      <p className="mt-1 text-sm text-text-muted">{subtitle}</p>
      <Section title={`${shown.length} de ${byDest.length} cliente(s)`}>
        <SubFilter value={f} onChange={setF} placeholder="Filtrar cliente, ejecutivo o grupo…" />
        <div>
          <Table wrapperClassName="max-h-96 rounded-lg border border-border">
            <TableHeader><TableRow><TableHead></TableHead><TableHead>Destinatario</TableHead><TableHead>Razón social</TableHead><TableHead>Ejecutivo / Grupo cli.</TableHead><TableHead className="text-right">Materiales</TableHead><TableHead className="text-right">Cant.</TableHead><TableHead className="text-right">Importe</TableHead></TableRow></TableHeader>
            <TableBody>
              {shown.map((d) => {
                const isOpen = openDest === d.dest;
                return (
                  <Fragment key={d.dest}>
                    <TableRow className="cursor-pointer" onClick={() => setOpenDest(isOpen ? null : d.dest)}>
                      <TableCell><ChevronDownIcon open={isOpen} /></TableCell>
                      <TableCell><span className="text-text">{d.dest}</span></TableCell>
                      <TableCell className="max-w-72 truncate">{d.razon}</TableCell>
                      <TableCell>{d.ejecutivo || '—'}<div className="text-[11px] text-text-faint">{d.grupo || '—'}</div></TableCell>
                      <TableCell className="text-right">{d.items.length}</TableCell>
                      <TableCell className="text-right">{formatNumber(d.cant)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(d.imp)}</TableCell>
                    </TableRow>
                    {isOpen && d.items.map((it, i) => (
                      <TableRow key={d.dest + it.material + i} className="bg-bg-inset/40 text-xs">
                        <TableCell></TableCell>
                        <TableCell colSpan={3} className="text-text-faint">
                          <Chip onClick={() => push({ type: 'material', material: it.material })}>{it.material}</Chip>
                          {descDe(it.material) && <div className="mt-0.5 max-w-96 truncate text-[11px] text-text-muted" title={descDe(it.material)}>{descDe(it.material)}</div>}
                        </TableCell>
                        <TableCell></TableCell>
                        <TableCell className="text-right">{formatNumber(it.cant)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(it.imp)}</TableCell>
                      </TableRow>
                    ))}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Section>
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
