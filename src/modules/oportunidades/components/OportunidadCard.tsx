import { AlertTriangle } from 'lucide-react';
import { Select } from '@/components/ui/select';
import { StatePill } from '@/modules/analytics/ui';
import { formatNumber, formatFechaCaducidad } from '@/lib/utils';
import { usePanelStore } from '@/store/panelStore';
import { useConocimientoStore } from '@/store/conocimientoStore';
import { ESTADOS_OPORTUNIDAD, type Oportunidad } from '@/core/types';

const CONDICION_LABEL: Record<Oportunidad['condicion'], string> = {
  'corta-caducidad': 'Corta caducidad', 'lento-movimiento': 'Lento movimiento', calidad: 'Calidad', danado: 'Dañado', normal: 'Normal',
};

function diasRestantes(fecha: string | null): number | null {
  if (!fecha) return null;
  const d = new Date(fecha);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0); d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / 86400000);
}

/** Tarjeta de una Oportunidad en la bandeja — clic abre el panel de detalle;
 * arrastrable entre columnas (fase 4) y el select de estado sigue disponible
 * como alternativa accesible/táctil al drag&drop. */
export function OportunidadCard({ o }: { o: Oportunidad }) {
  const open = usePanelStore((s) => s.open);
  const setEstado = useConocimientoStore((s) => s.setEstado);
  const dias = diasRestantes(o.fechaCaducidad);

  return (
    <div
      draggable={o.id != null}
      onDragStart={(e) => { if (o.id != null) { e.dataTransfer.setData('text/plain', String(o.id)); e.dataTransfer.effectAllowed = 'move'; } }}
      className="cursor-grab rounded-lg border border-border bg-bg-elevated p-3 text-sm shadow-sm active:cursor-grabbing"
    >
      <button type="button" className="text-left" onClick={() => open({ type: 'materialHub', material: o.material, lote: o.lote })}>
        <span className="font-mono text-xs text-accent">{o.material}</span>
        <p className="mt-0.5 line-clamp-2 font-medium text-text">{o.descripcion || o.material}</p>
      </button>
      <div className="mt-1.5"><StatePill label={CONDICION_LABEL[o.condicion]} cls={o.condicion === 'corta-caducidad' ? 'rojo' : o.condicion === 'danado' ? 'amb' : 'azul'} /></div>
      <p className="mt-1.5 text-xs text-text-muted">{formatNumber(o.cantidadDisponible)} unid.</p>
      {dias != null && (
        <p className="mt-0.5 flex items-center gap-1 text-xs text-text-muted">
          {dias <= 60 && <AlertTriangle className="size-3 text-danger" />}
          vence {formatFechaCaducidad(o.fechaCaducidad)} ({dias}d)
        </p>
      )}
      <div className="mt-2">
        <Select value={o.estado} onChange={(e) => o.id != null && setEstado(o.id, e.target.value as Oportunidad['estado'])} className="h-7 text-xs">
          {ESTADOS_OPORTUNIDAD.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
        </Select>
      </div>
    </div>
  );
}
