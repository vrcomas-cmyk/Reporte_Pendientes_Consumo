import { useEffect, useMemo, useState } from 'react';
import { DebouncedSearch } from '@/modules/analytics/ui';
import { matchesQuery } from '@/modules/analytics/helpers';
import { EmptyState } from '@/components/feedback/EmptyState';
import { usePanelStore } from '@/store/panelStore';
import { useConocimientoStore } from '@/store/conocimientoStore';

const CONDICION_LABEL: Record<string, string> = {
  'corta-caducidad': 'Corta caducidad', 'lento-movimiento': 'Lento movimiento', calidad: 'Calidad', danado: 'Dañado',
};

/** Índice de fichas de cliente — el mini-CRM del módulo (req. 3), navegable
 * fuera del contexto de un material específico. */
export function ClientesPage() {
  const clientes = useConocimientoStore((s) => s.clientes);
  const hydrate = useConocimientoStore((s) => s.hydrate);
  const open = usePanelStore((s) => s.open);
  const [q, setQ] = useState('');

  useEffect(() => { void hydrate(); }, [hydrate]);

  const shown = useMemo(
    () => (q ? clientes.filter((c) => matchesQuery(q, `${c.dest} ${c.razonSocial}`)) : clientes),
    [clientes, q],
  );

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-xl font-semibold">Clientes — fichas comerciales</h1>
        <DebouncedSearch onChange={setQ} placeholder="Buscar cliente…" className="w-full sm:w-72" />
      </div>

      {clientes.length === 0 ? (
        <EmptyState title="Sin fichas todavía" description="Las fichas se crean desde la pestaña Compatibilidad de un material, al hacer clic en 'Ficha' junto a un cliente sugerido." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((c) => (
            <button
              key={c.dest}
              className="rounded-lg border border-border bg-bg-elevated p-3 text-left text-sm hover:border-accent"
              onClick={() => open({ type: 'clienteConocimiento', dest: c.dest, razonSocial: c.razonSocial })}
            >
              <p className="font-medium text-text">{c.razonSocial || c.dest}</p>
              <p className="text-xs text-text-faint">{c.dest}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {c.condicionesAceptadas.map((cond) => (
                  <span key={cond} className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] text-accent">{CONDICION_LABEL[cond] ?? cond}</span>
                ))}
                {c.condicionesAceptadas.length === 0 && <span className="text-[11px] text-text-faint">Sin condiciones registradas</span>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
