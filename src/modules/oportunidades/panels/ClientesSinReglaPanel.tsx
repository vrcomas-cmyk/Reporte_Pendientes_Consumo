import { Button } from '@/components/ui/button';
import { StatePill } from '@/modules/analytics/ui';
import { usePanelStore } from '@/store/panelStore';
import type { Panel } from '@/store/panelStore';

/** Detalle de "Clientes que compran pero no cumplen su regla" — la fila de
 * la bandeja es compacta (1 línea por material); aquí vive la lista
 * completa de clientes candidatos por rotación, ya ordenados de antes
 * (mejor rotación primero, sin nadie con más de 1 año sin comprar). */
export function ClientesSinReglaPanel({ panel }: { panel: Extract<Panel, { type: 'materialSinRegla' }> }) {
  const { material, descripcion, clientes } = panel;
  const openPanel = usePanelStore((s) => s.open);

  return (
    <div>
      <span className="font-mono text-xs text-accent">{material}</span>
      <h2 className="font-display text-lg font-semibold">{descripcion || material}</h2>
      <p className="mt-1 text-sm text-text-muted">
        {clientes.length} cliente(s) compran este material pero su regla actual no lo cubre (o no tienen regla) — ordenados por mejor rotación primero.
      </p>

      <div className="mt-4 flex flex-col gap-1.5">
        {clientes.map(({ dest, razonSocial, estado, ultimoMesFacturacion }) => (
          <div key={dest} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-bg-elevated px-3 py-2 text-xs">
            <div className="min-w-0">
              <button className="text-left font-medium text-text hover:text-accent hover:underline" onClick={() => openPanel({ type: 'clienteConocimiento', dest, razonSocial, tab: 'ficha' })}>{razonSocial || dest}</button>
              <span className="ml-1.5"><StatePill label={estado.label} cls={estado.cls} /></span>
              <span className="ml-1.5 text-text-faint">última compra {ultimoMesFacturacion || '—'}</span>
            </div>
            <Button size="sm" variant="outline" onClick={() => openPanel({ type: 'clienteConocimiento', dest, razonSocial, tab: 'ofertas', prefillMaterial: material })}>Ofertar</Button>
          </div>
        ))}
      </div>
    </div>
  );
}
