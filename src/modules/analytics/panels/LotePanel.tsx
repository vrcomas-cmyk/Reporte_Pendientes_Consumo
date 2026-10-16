import { useMemo } from 'react';
import { KpiBand } from '@/components/layout/report';
import { Chip, StatePill, DetailChevron } from '../ui';
import { Section, SugTable, ConsumoTable, vigenciaTxt } from './_shared';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { formatCurrency, formatNumber, formatFechaCaducidad } from '@/lib/utils';
import { sugFor, consFor, norm } from '../helpers';
import type { Panel } from '@/store/panelStore';
import type { Analytics } from '../AnalyticsContext';

/** Panel — Detalle de un lote de un material: cuánto hay y dónde (centro/almacén), caducidad, precio,
 * y la demanda a la que puede servir (sugerencias BO y clientes con consumo del material). */
export function LotePanel({ panel, a, push }: { panel: Extract<Panel, { type: 'lote' }>; a: Analytics; push: (p: Panel) => void }) {
  const mat = panel.material;
  const ubicaciones = useMemo(
    () => a.lotes.filter((l) => norm(l.material) === norm(mat) && norm(l.lote) === norm(panel.lote)),
    [a.lotes, mat, panel.lote],
  );
  const sug = useMemo(() => sugFor(a.bo, mat), [a.bo, mat]);
  const cons = useMemo(() => consFor(a.result?.consumo ?? [], mat), [a.result, mat]);
  const total = ubicaciones.reduce((s, l) => s + l.cantidadDisp, 0);
  const cad = ubicaciones.find((l) => l.fechaCaducidad)?.fechaCaducidad ?? null;
  const vg = vigenciaTxt(cad || '');
  const precio = ubicaciones.find((l) => (l.precioOferta ?? 0) > 0)?.precioOferta ?? 0;
  const pendiente = sug.reduce((s, it) => s + it.bo.cantidadPendiente, 0);
  const consumoMes = cons.reduce((s, r) => s + (r.consumoPromedioMensual || 0), 0);
  return (
    <div>
      <p className="text-xs text-text-faint">Detalle de lote</p>
      <h2 className="font-display text-lg font-semibold">
        Lote {panel.lote} · <Chip onClick={() => push({ type: 'material', material: mat })}>{mat}</Chip>
      </h2>
      <p className="mt-1 text-sm text-text-muted">{a.enrich.matTexto(mat) || ubicaciones[0]?.textoBreve || ''}</p>
      <KpiBand
        className="mt-3"
        titulo="Lote · resumen"
        estado={vg?.cls === 'rojo' ? 'danger' : vg?.cls === 'amb' ? 'warning' : 'neutral'}
        principal={{ etiqueta: 'Disponible en el lote', valor: formatNumber(total), sub: `${ubicaciones.length} ubicación(es) centro / almacén` }}
        metricas={[
          { etiqueta: 'Caducidad', valor: cad ? formatFechaCaducidad(cad) : '—', sub: vg ? vg.txt : undefined, tono: vg?.cls === 'rojo' ? 'danger' : vg?.cls === 'amb' ? 'warning' : undefined },
          { etiqueta: 'Precio del lote', valor: precio ? formatCurrency(precio) : '—' },
          { etiqueta: 'Pendiente BO del material', valor: formatNumber(pendiente), sub: `${sug.length} renglón(es)` },
          { etiqueta: 'Consumo / mes (material)', valor: formatNumber(consumoMes), sub: `${cons.length} cliente(s)` },
        ]}
      />
      <Section title="Dónde está el lote">
        {ubicaciones.length === 0 ? (
          <p className="text-sm text-text-muted">Este lote ya no aparece en el inventario cargado.</p>
        ) : (
          <Table wrapperClassName="max-h-64 rounded-lg border border-border">
            <TableHeader><TableRow><TableHead>Centro</TableHead><TableHead>Almacén</TableHead><TableHead className="text-right">Disp.</TableHead><TableHead>Caducidad</TableHead><TableHead className="w-8" /></TableRow></TableHeader>
            <TableBody>
              {ubicaciones.map((l, i) => {
                const ir = () => push({ type: 'celda', material: mat, centro: l.centro, almacen: l.almacen });
                return (
                  <TableRow key={`${l.centro}|${l.almacen}|${i}`} className="group cursor-pointer" title="Doble clic para ver el material en este centro" onDoubleClick={ir}>
                    <TableCell>{l.centro}</TableCell>
                    <TableCell>{l.almacen}</TableCell>
                    <TableCell className="text-right">{formatNumber(l.cantidadDisp)}</TableCell>
                    <TableCell>{formatFechaCaducidad(l.fechaCaducidad)}{vg && <div className="text-[11px]"><StatePill label={vg.txt} cls={vg.cls} /></div>}</TableCell>
                    <TableCell><DetailChevron onOpen={ir} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Section>
      <Section title={`Pedidos pendientes que pide el material · ${sug.length}`}><SugTable list={sug} a={a} push={push} /></Section>
      <Section title={`Clientes con consumo del material · ${cons.length}`}><ConsumoTable list={cons} a={a} push={push} /></Section>
    </div>
  );
}
