import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useConocimientoStore } from '@/store/conocimientoStore';
import { ESTADOS_OPORTUNIDAD, type EstadoOportunidad, type Oportunidad } from '@/core/types';
import { OportunidadCard } from './OportunidadCard';

// 8 estados no caben cómodamente en pantalla: las 5 "activas" tienen columna
// propia; las 3 de cierre se agrupan bajo "Cerradas" (wireframe §4.1 del plan).
const COLUMNAS: EstadoOportunidad[] = ['nueva', 'en-analisis', 'contactando', 'negociacion', 'colocada-parcial'];
const CERRADAS: EstadoOportunidad[] = ['colocada-total', 'sin-interesados', 'campana-agresiva'];

function labelOf(key: EstadoOportunidad) {
  return ESTADOS_OPORTUNIDAD.find((e) => e.key === key)?.label ?? key;
}

/** Una columna del tablero: además de listar tarjetas, es zona de destino de
 * drag&drop — soltar una tarjeta aquí cambia su estado (fase 4). Para
 * "Cerradas" (3 estados agrupados), el drop cae siempre en `colocada-total`;
 * elegir entre las 3 sigue siendo el `Select` de la tarjeta. */
function Columna({ label, items, onDropId }: { label: string; items: Oportunidad[]; onDropId: (id: number) => void }) {
  const [over, setOver] = useState(false);
  return (
    <div
      className="min-w-0"
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const id = Number(e.dataTransfer.getData('text/plain'));
        if (Number.isFinite(id) && id) onDropId(id);
      }}
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-faint">{label} ({items.length})</p>
      <div className={cn('flex flex-col gap-2 rounded-lg p-1 transition-colors', over && 'bg-accent-soft ring-2 ring-accent/40')}>
        {items.map((o) => <OportunidadCard key={o.id ?? `${o.material}-${o.lote}`} o={o} />)}
        {items.length === 0 && <p className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-text-faint">Sin oportunidades</p>}
      </div>
    </div>
  );
}

/** Bandeja de trabajo — tablero por estado, entrada principal del módulo.
 * Cambiar de columna por drag&drop persiste el nuevo estado igual que el
 * `Select` de la tarjeta (misma acción, dos formas de disparo). */
export function OportunidadTray({ oportunidades }: { oportunidades: Oportunidad[] }) {
  const setEstado = useConocimientoStore((s) => s.setEstado);
  const cerradas = oportunidades.filter((o) => CERRADAS.includes(o.estado));

  function onDropEstado(estado: EstadoOportunidad) {
    return (id: number) => {
      const target = oportunidades.find((o) => o.id === id);
      if (target && target.estado !== estado) void setEstado(id, estado);
    };
  }

  return (
    <div className="grid grid-cols-1 gap-3 overflow-x-auto pb-2 sm:grid-cols-2 lg:grid-cols-6">
      {COLUMNAS.map((estado) => (
        <Columna key={estado} label={labelOf(estado)} items={oportunidades.filter((o) => o.estado === estado)} onDropId={onDropEstado(estado)} />
      ))}
      <Columna label="Cerradas" items={cerradas} onDropId={onDropEstado('colocada-total')} />
    </div>
  );
}
