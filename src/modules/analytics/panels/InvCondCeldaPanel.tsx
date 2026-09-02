import { StatTile, StatePill } from '../ui';
import { Section, PrecioCondicionBox } from './_shared';
import { formatNumber, formatFechaCaducidad } from '@/lib/utils';
import { almacenesDeCondicion } from '@/core/inventoryRules';
import { norm } from '../helpers';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import type { Panel } from '@/store/panelStore';
import type { Analytics } from '../AnalyticsContext';

/** Panel — Detalle por material+centro del reporte "Inv Condición"
 * (InvConsolidado): desglose por lote desde "InvDetalle", la misma
 * fuente/sincronización que el reporte — sin mezclar con Resumen Sin
 * Sugerencias (que viene de otro spreadsheet y puede estar desfasado). */
export function InvCondCeldaPanel({ panel, a }: { panel: Extract<Panel, { type: 'invCondCelda' }>; a: Analytics }) {
  const condicionMat = a.invCondicion.find((r) => norm(r.material) === norm(panel.material))?.condicion || '';
  const almacenesAplicables = new Set(almacenesDeCondicion(condicionMat).map(norm));
  const lotes = a.lotes.filter((l) => norm(l.material) === norm(panel.material) && norm(l.centro) === norm(panel.centro));
  const totalAplica = lotes.filter((l) => almacenesAplicables.has(norm(l.almacen))).reduce((s, l) => s + l.cantidadDisp, 0);
  const totalTodos = lotes.reduce((s, l) => s + l.cantidadDisp, 0);

  return (
    <div>
      <h2 className="font-display text-lg font-semibold">{panel.material} · Centro {panel.centro}</h2>
      <p className="mt-1 text-sm text-text-muted">{lotes[0]?.textoBreve} · Condición: {condicionMat || '—'}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Inv. según condición" value={formatNumber(totalAplica)} />
        <StatTile label="Inv. total (todos los almacenes)" value={formatNumber(totalTodos)} />
        <StatTile label="Lotes" value={formatNumber(lotes.length)} />
      </div>
      <PrecioCondicionBox a={a} material={panel.material} />
      <Section title="Detalle de lotes (InvDetalle)">
        {lotes.length === 0 ? (
          <p className="text-sm text-text-muted">Sin lotes en InvDetalle para este material y centro.</p>
        ) : (
          <div>
            <Table wrapperClassName="max-h-96 rounded-lg border border-border">
              <TableHeader>
                <TableRow>
                  <TableHead>Almacén</TableHead><TableHead>Lote</TableHead>
                  <TableHead className="text-right">Disp.</TableHead><TableHead>Vence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lotes
                  .slice()
                  .sort((x, y) => x.almacen.localeCompare(y.almacen))
                  .map((l, i) => (
                    <TableRow key={i}>
                      <TableCell>{l.almacen}{almacenesAplicables.has(norm(l.almacen)) && <StatePill label="aplica" cls="verde" />}</TableCell>
                      <TableCell>{l.lote || '—'}</TableCell>
                      <TableCell className="text-right">{formatNumber(l.cantidadDisp)}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{formatFechaCaducidad(l.fechaCaducidad)}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>
    </div>
  );
}
