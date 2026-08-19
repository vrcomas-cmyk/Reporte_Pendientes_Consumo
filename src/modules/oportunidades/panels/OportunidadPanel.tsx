import { useEffect, useMemo, useState } from 'react';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { StatTile } from '@/modules/analytics/ui';
import { cn, formatNumber, formatFechaCaducidad, formatCurrency } from '@/lib/utils';
import { useConocimientoStore } from '@/store/conocimientoStore';
import { ESTADOS_OPORTUNIDAD, type Oportunidad } from '@/core/types';
import { EstadoProgreso } from '../components/EstadoProgreso';
import type { Panel } from '@/store/panelStore';

const textareaCls = 'flex w-full rounded-md border border-border bg-bg-elevated px-3 py-1.5 text-sm text-text placeholder:text-text-faint outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring';

interface Editable { responsable: string; prioridad: Oportunidad['prioridad']; cantidadColocada: number; notas: string }

function draftOf(o: Oportunidad): Editable {
  return { responsable: o.responsable, prioridad: o.prioridad, cantidadColocada: o.cantidadColocada, notas: o.notas };
}

/** Detalle de una Oportunidad: snapshot al crearla, estado editable, y campos
 * de seguimiento (responsable, prioridad, cantidad colocada, notas) — antes
 * solo el estado era editable después de crear la oportunidad. */
export function OportunidadPanel({ panel, push }: { panel: Extract<Panel, { type: 'oportunidad' }>; push: (p: Panel) => void }) {
  const todasOportunidades = useConocimientoStore((s) => s.oportunidades);
  const o = useMemo(() => todasOportunidades.find((x) => x.id === panel.id), [todasOportunidades, panel.id]);
  const setEstado = useConocimientoStore((s) => s.setEstado);
  const updateOportunidad = useConocimientoStore((s) => s.updateOportunidad);
  const todasInteracciones = useConocimientoStore((s) => s.interacciones);
  const interacciones = useMemo(() => todasInteracciones.filter((i) => i.oportunidadId === panel.id), [todasInteracciones, panel.id]);

  const [draft, setDraft] = useState<Editable | null>(o ? draftOf(o) : null);
  useEffect(() => { if (o) setDraft(draftOf(o)); }, [o?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!o || !draft) return <p className="text-sm text-text-muted">Oportunidad no encontrada.</p>;

  const dirty = draft.responsable !== o.responsable || draft.prioridad !== o.prioridad
    || draft.cantidadColocada !== o.cantidadColocada || draft.notas !== o.notas;
  const oportunidadId = o.id;
  const draftValue = draft;

  function guardar() {
    if (oportunidadId == null) return;
    void updateOportunidad(oportunidadId, draftValue);
  }

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

      <div className="mt-4">
        <EstadoProgreso estado={o.estado} />
      </div>

      <div className="mt-3 max-w-xs">
        <label className="mb-1 block text-xs font-medium text-text-muted">Estado</label>
        <Select value={o.estado} onChange={(e) => o.id != null && setEstado(o.id, e.target.value as Oportunidad['estado'])}>
          {ESTADOS_OPORTUNIDAD.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
        </Select>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:max-w-md">
        <div>
          <label className="mb-1 block text-xs font-medium text-text-muted">Responsable</label>
          <Input value={draft.responsable} onChange={(e) => setDraft({ ...draft, responsable: e.target.value })} placeholder="Quién la está trabajando" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-text-muted">Prioridad</label>
          <Select value={draft.prioridad} onChange={(e) => setDraft({ ...draft, prioridad: e.target.value as Oportunidad['prioridad'] })}>
            <option value="alta">Alta</option>
            <option value="media">Media</option>
            <option value="baja">Baja</option>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-text-muted">Cantidad colocada</label>
          <Input type="number" min={0} value={draft.cantidadColocada} onChange={(e) => setDraft({ ...draft, cantidadColocada: Number(e.target.value) })} />
        </div>
      </div>

      <div className="mt-3 sm:max-w-md">
        <label className="mb-1 block text-xs font-medium text-text-muted">Notas</label>
        <textarea className={cn(textareaCls, 'min-h-16')} value={draft.notas} onChange={(e) => setDraft({ ...draft, notas: e.target.value })} placeholder="Contexto de seguimiento…" />
      </div>

      {dirty && (
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" onClick={guardar}>Guardar cambios</Button>
          <Button size="sm" variant="outline" onClick={() => setDraft(draftOf(o))}>Descartar</Button>
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
