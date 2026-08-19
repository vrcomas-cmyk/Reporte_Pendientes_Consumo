import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useConocimientoStore } from '@/store/conocimientoStore';
import { ESTADOS_OPORTUNIDAD, type EstadoOportunidad, type Oportunidad } from '@/core/types';
import { OportunidadCard } from './OportunidadCard';

// 8 estados no caben cómodamente en pantalla: las 6 "activas" (incluye
// campana-agresiva, que sigue siendo trabajo en curso — así el tablero
// coincide con el KPI "Abiertas" de OportunidadesPage, que también la
// cuenta como abierta) tienen columna propia; las 2 de cierre real se
// agrupan bajo "Cerradas".
const COLUMNAS: EstadoOportunidad[] = ['nueva', 'en-analisis', 'contactando', 'negociacion', 'campana-agresiva', 'colocada-parcial'];
const CERRADAS: EstadoOportunidad[] = ['colocada-total', 'sin-interesados'];

function labelOf(key: EstadoOportunidad) {
  return ESTADOS_OPORTUNIDAD.find((e) => e.key === key)?.label ?? key;
}

const PRIORIDAD_RANGO: Record<Oportunidad['prioridad'], number> = { alta: 0, media: 1, baja: 2 };

/** Orden de atención dentro de una columna: prioridad (alta primero) y, en
 * empate, caducidad más próxima primero — así lo primero que se ve arriba de
 * cada columna es siempre lo más urgente, no lo último que se creó. */
function porUrgencia(a: Oportunidad, b: Oportunidad): number {
  const p = PRIORIDAD_RANGO[a.prioridad] - PRIORIDAD_RANGO[b.prioridad];
  if (p !== 0) return p;
  if (a.fechaCaducidad && b.fechaCaducidad) return a.fechaCaducidad.localeCompare(b.fechaCaducidad);
  if (a.fechaCaducidad) return -1;
  if (b.fechaCaducidad) return 1;
  return 0;
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
    <div className="grid grid-cols-1 gap-3 overflow-x-auto pb-2 sm:grid-cols-2 lg:grid-cols-7">
      {COLUMNAS.map((estado) => (
        <Columna key={estado} label={labelOf(estado)} items={oportunidades.filter((o) => o.estado === estado).sort(porUrgencia)} onDropId={onDropEstado(estado)} />
      ))}
      <Columna label="Cerradas" items={cerradas.sort(porUrgencia)} onDropId={onDropEstado('colocada-total')} />
    </div>
  );
}
