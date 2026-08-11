import { useMemo } from 'react';
import { Select } from '@/components/ui/select';
import { StatTile } from '@/modules/analytics/ui';
import { formatNumber, formatFechaCaducidad, formatCurrency } from '@/lib/utils';
import { useConocimientoStore } from '@/store/conocimientoStore';
import { ESTADOS_OPORTUNIDAD, type Oportunidad } from '@/core/types';
import type { Panel } from '@/store/panelStore';

/** Detalle de una Oportunidad: snapshot al crearla, estado, y su timeline de
 * interacciones (cambios de estado quedan registrados automáticamente —
 * req. 10 del plan). Ofertas/timeline completo llegan en fase 3. */
export function OportunidadPanel({ panel, push }: { panel: Extract<Panel, { type: 'oportunidad' }>; push: (p: Panel) => void }) {
  const todasOportunidades = useConocimientoStore((s) => s.oportunidades);
  const o = useMemo(() => todasOportunidades.find((x) => x.id === panel.id), [todasOportunidades, panel.id]);
  const setEstado = useConocimientoStore((s) => s.setEstado);
  const todasInteracciones = useConocimientoStore((s) => s.interacciones);
  const interacciones = useMemo(() => todasInteracciones.filter((i) => i.oportunidadId === panel.id), [todasInteracciones, panel.id]);
  if (!o) return <p className="text-sm text-text-muted">Oportunidad no encontrada.</p>;

  return (
    <div>
      <button className="text-left font-mono text-xs text-accent hover:underline" onClick={() => push({ type: 'materialHub', material: o.material, lote: o.lote })}>{o.material}</button>
      <h2 className="font-display text-lg font-semibold">{o.descripcion || o.material}</h2>
      {o.lote && <p className="text-sm text-text-muted">Lote {o.lote}{o.centro ? ` · Centro ${o.centro}` : ''}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        <StatTile label="Disponible" value={formatNumber(o.cantidadDisponible)} />
        <StatTile label="Colocado" value={formatNumber(o.cantidadColocada)} />
        <StatTile label="Precio oferta" value={formatCurrency(o.precioOferta)} />
        {o.fechaCaducidad && <StatTile label="Caducidad" value={formatFechaCaducidad(o.fechaCaducidad)} />}
      </div>

      <div className="mt-4 max-w-xs">
        <label className="mb-1 block text-xs font-medium text-text-muted">Estado</label>
        <Select value={o.estado} onChange={(e) => o.id != null && setEstado(o.id, e.target.value as Oportunidad['estado'])}>
          {ESTADOS_OPORTUNIDAD.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
        </Select>
      </div>

      {o.notas && (
        <div className="mt-4">
          <h3 className="mb-1 text-sm font-semibold text-text">Notas</h3>
          <p className="text-sm text-text-muted">{o.notas}</p>
        </div>
      )}

      <div className="mt-4">
        <h3 className="mb-2 text-sm font-semibold text-text">Historial</h3>
        {interacciones.length === 0 && <p className="text-sm text-text-muted">Sin movimientos todavía.</p>}
        <ul className="flex flex-col gap-2">
          {interacciones.map((i) => (
            <li key={i.id} className="rounded-lg border border-border bg-bg-elevated p-2.5 text-sm">
              <p className="text-text">{i.resumen}</p>
              <p className="mt-0.5 text-xs text-text-faint">{new Date(i.fecha).toLocaleString('es-MX')}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
