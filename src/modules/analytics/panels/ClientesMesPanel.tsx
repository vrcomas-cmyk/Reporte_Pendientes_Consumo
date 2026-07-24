import { useMemo, useState } from 'react';
import { Chip } from '../ui';
import { Section, SubFilter } from './_shared';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { clientesPorMesMaterial, mesLabel } from '@/core/resumenFac';
import { matchesQuery } from '../helpers';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import type { Panel } from '@/store/panelStore';
import type { Analytics } from '../AnalyticsContext';

/** Panel — Clientes que facturaron un material en un mes (drill desde EvolChart). */
export function ClientesMesPanel({ panel, a, push }: { panel: Extract<Panel, { type: 'clientesMes' }>; a: Analytics; push: (p: Panel) => void }) {
  const rf = a.rf;
  if (!rf) return <p>Sin datos.</p>;
  const list = clientesPorMesMaterial(rf, panel.material, panel.mes);
  return (
    <ClientesMesInner
      title={`${panel.material} · ${mesLabel(panel.mes)}`}
      subtitle="Clientes que facturaron este material en el mes"
      list={list.map((c) => ({ dest: c.dest, razon: c.razon, solic: '', material: panel.material, cant: c.cant, imp: c.imp }))}
      push={push}
    />
  );
}

/** Panel — Clientes que facturaron un mes respetando los filtros activos (drill desde chart de facturación). */
export function MesClientesFiltroPanel({ panel, a: _a, push }: { panel: Extract<Panel, { type: 'mesClientesFiltro' }>; a: Analytics; push: (p: Panel) => void }) {
  void _a;
  return (
    <ClientesMesInner
      title={`Facturación · ${mesLabel(panel.mes)}`}
      subtitle="Clientes que facturaron ese mes, respetando los filtros activos"
      list={panel.rows.map((r) => ({ dest: r.dest, razon: r.razon, solic: r.solic, material: r.material, cant: r.cant, imp: r.imp }))}
      push={push}
    />
  );
}

/** Lista presentacional de clientes con facturación para un mes+material o mes para filtros activos — dos niveles: por destinatario, expandible por material. */
function ClientesMesInner({ title, subtitle, list, push }: {
  title: string;
  subtitle: string;
  list: { dest: string; razon: string; solic: string; material: string; cant: number; imp: number }[];
  push: (p: Panel) => void;
}) {
  const [f, setF] = useState('');
  const [openDest, setOpenDest] = useState<string | null>(null);
  const byDest = useMemoDest(list);
  const shown = f ? byDest.filter((d) => matchesQuery(f, `${d.dest} ${d.razon}`)) : byDest;
  return (
    <div>
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-text-muted">{subtitle}</p>
      <Section title={`${shown.length} de ${byDest.length} cliente(s)`}>
        <SubFilter value={f} onChange={setF} placeholder="Filtrar cliente…" />
        <div>
          <Table wrapperClassName="max-h-96 rounded-lg border border-border">
            <TableHeader><TableRow><TableHead></TableHead><TableHead>Destinatario</TableHead><TableHead>Razón social</TableHead><TableHead className="text-right">Materiales</TableHead><TableHead className="text-right">Cant.</TableHead><TableHead className="text-right">Importe</TableHead></TableRow></TableHeader>
            <TableBody>
              {shown.map((d) => {
                const isOpen = openDest === d.dest;
                return (
                  <>
                    <TableRow key={d.dest} className="cursor-pointer" onClick={() => setOpenDest(isOpen ? null : d.dest)}>
                      <TableCell><ChevronDownIcon open={isOpen} /></TableCell>
                      <TableCell><span className="text-accent">{d.dest}</span></TableCell>
                      <TableCell className="max-w-72 truncate">{d.razon}</TableCell>
                      <TableCell className="text-right">{d.items.length}</TableCell>
                      <TableCell className="text-right">{formatNumber(d.cant)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(d.imp)}</TableCell>
                    </TableRow>
                    {isOpen && d.items.map((it, i) => (
                      <TableRow key={d.dest + it.material + i} className="bg-bg-inset/40 text-xs">
                        <TableCell></TableCell>
                        <TableCell colSpan={2} className="text-text-faint">
                          <Chip onClick={() => push({ type: 'material', material: it.material })}>{it.material}</Chip>
                        </TableCell>
                        <TableCell></TableCell>
                        <TableCell className="text-right">{formatNumber(it.cant)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(it.imp)}</TableCell>
                      </TableRow>
                    ))}
                  </>
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

function useMemoDest(list: { dest: string; razon: string; solic: string; material: string; cant: number; imp: number }[]) {
  return useMemo(() => {
    const map = new Map<string, { dest: string; razon: string; cant: number; imp: number; items: { material: string; cant: number; imp: number }[] }>();
    for (const c of list) {
      let d = map.get(c.dest);
      if (!d) { d = { dest: c.dest, razon: c.razon, cant: 0, imp: 0, items: [] }; map.set(c.dest, d); }
      d.cant += c.cant; d.imp += c.imp;
      d.items.push({ material: c.material, cant: c.cant, imp: c.imp });
    }
    return [...map.values()].sort((x, y) => y.imp - x.imp);
  }, [list]);
}
