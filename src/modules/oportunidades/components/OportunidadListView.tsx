import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { formatNumber, formatFechaCaducidad, formatCurrency } from '@/lib/utils';
import { usePanelStore } from '@/store/panelStore';
import { useColumnVisibility, ColumnVisibilityControl, type ColDef } from '@/modules/analytics/ui';
import { usePermissionsStore } from '@/store/permissionsStore';
import { isColumnHidden } from '@/core/permissions';
import { EstadoBadge } from './EstadoBadge';
import type { Oportunidad } from '@/core/types';

const COLS: ColDef[] = [
  { key: 'material', label: 'Material' },
  { key: 'condicion', label: 'Condición' },
  { key: 'cantidad', label: 'Disponible' },
  { key: 'caducidad', label: 'Caducidad' },
  { key: 'precio', label: 'Precio oferta' },
  { key: 'estado', label: 'Estado' },
  { key: 'actualizada', label: 'Actualizada' },
];

const CONDICION_LABEL: Record<Oportunidad['condicion'], string> = {
  'corta-caducidad': 'Corta caducidad', 'lento-movimiento': 'Lento movimiento', calidad: 'Calidad', danado: 'Dañado', normal: 'Normal',
};

/** Vista tabular de la bandeja — alternativa densa al tablero, con columnas
 * ocultables (fase 4). Mismo dato, otra forma de escanearlo rápido. */
export function OportunidadListView({ oportunidades }: { oportunidades: Oportunidad[] }) {
  const { hidden, isVisible: isVisibleUser, toggle, reset } = useColumnVisibility('oportunidades_cols');
  const open = usePanelStore((s) => s.open);
  const perms = usePermissionsStore((s) => s.perms);
  const isVisible = (key: string) => isVisibleUser(key) && !isColumnHidden(perms, 'oportunidades', key);

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <ColumnVisibilityControl columns={COLS} hidden={hidden} toggle={toggle} reset={reset} />
      </div>
      <Table wrapperClassName="max-h-[65vh] rounded-lg border border-border">
        <TableHeader>
          <TableRow>
            {isVisible('material') && <TableHead title="Material del lote que buscamos colocar.">Material</TableHead>}
            {isVisible('condicion') && <TableHead title="Fuente de pedido/condición del material: corta-caducidad, lento-movimiento, calidad, dañado o normal.">Condición</TableHead>}
            {isVisible('cantidad') && <TableHead className="text-right" title="Cantidad disponible de este lote.">Disponible</TableHead>}
            {isVisible('caducidad') && <TableHead title="Fecha de caducidad del lote, si aplica.">Caducidad</TableHead>}
            {isVisible('precio') && <TableHead className="text-right" title="Precio de oferta propuesto para colocar este lote.">Precio oferta</TableHead>}
            {isVisible('estado') && <TableHead title="Avance de esta Oportunidad en el flujo (nueva, en análisis, contactando, negociación, colocada, sin interesados).">Estado</TableHead>}
            {isVisible('actualizada') && <TableHead title="Última vez que se actualizó el estado o los datos de esta Oportunidad.">Actualizada</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {oportunidades.map((o) => (
            <TableRow key={o.id} className="cursor-pointer" onClick={() => open({ type: 'oportunidad', id: o.id! })}>
              {isVisible('material') && <TableCell><span className="font-mono text-xs text-accent">{o.material}</span><div className="max-w-64 truncate text-[11px] text-text-faint">{o.descripcion}</div></TableCell>}
              {isVisible('condicion') && <TableCell>{CONDICION_LABEL[o.condicion]}</TableCell>}
              {isVisible('cantidad') && <TableCell className="text-right">{formatNumber(o.cantidadDisponible)}</TableCell>}
              {isVisible('caducidad') && <TableCell>{o.fechaCaducidad ? formatFechaCaducidad(o.fechaCaducidad) : '—'}</TableCell>}
              {isVisible('precio') && <TableCell className="text-right">{formatCurrency(o.precioOferta)}</TableCell>}
              {isVisible('estado') && <TableCell><EstadoBadge estado={o.estado} /></TableCell>}
              {isVisible('actualizada') && <TableCell className="text-xs text-text-faint">{new Date(o.actualizadaEn).toLocaleDateString('es-MX')}</TableCell>}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
