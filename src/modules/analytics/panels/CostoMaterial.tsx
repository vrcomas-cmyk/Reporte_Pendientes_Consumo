import { usePermissionsStore } from '@/store/permissionsStore';
import { isDetailHidden } from '@/core/permissions';
import { formatCurrency } from '@/lib/utils';
import { StatTile } from '../ui';
import { EyeOff } from 'lucide-react';
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem } from '@/components/ui/context-menu';
import { useTilesOcultosStore } from '@/store/tilesOcultosStore';
import type { Analytics } from '../AnalyticsContext';
import type { MetricaKpi } from '@/components/layout/report';

/** Costo del material (pestaña Materiales del catálogo). Dato sensible: se
 * oculta con el detalle `costo` del módulo `inventario` (Admin → Roles) — un
 * solo interruptor para todos los paneles de detalle que lo muestran. */
export function useCostoVisible(): boolean {
  const perms = usePermissionsStore((s) => s.perms);
  return !isDetailHidden(perms, 'inventario', 'costo');
}

export function CostoTile({ a, material }: { a: Analytics; material: string }) {
  const visible = useCostoVisible();
  if (!visible) return null;
  const costo = a.enrich.matCosto(material);
  return <StatTile hideKey="Costo" label={`Costo${a.enrich.matUm(material) ? ` / ${a.enrich.matUm(material)}` : ''}`} value={costo ? formatCurrency(costo) : '—'} />;
}

/** Costo / UM como métrica de `KpiBand` (o `[]` si el rol no puede verlo): integra el costo a la banda en vez de una tarjeta aparte. */
export function useCostoMetrica(a: Analytics, material: string): MetricaKpi[] {
  const visible = useCostoVisible();
  const ocultos = useTilesOcultosStore((s) => s.ocultos);
  const ocultar = useTilesOcultosStore((s) => s.ocultar);
  // Se oculta con clic derecho (como el resto de tarjetas) y por permiso de rol.
  if (ocultos.includes('Costo')) return [];
  const [m] = costoMetricaDe(visible, a, material);
  if (!m || m.valor === '—') return [];
  return [{
    ...m,
    title: 'Clic derecho para ocultar',
    valor: (
      <ContextMenu>
        <ContextMenuTrigger asChild><span className="cursor-context-menu">{m.valor}</span></ContextMenuTrigger>
        <ContextMenuContent><ContextMenuItem onSelect={() => ocultar('Costo')}><EyeOff className="size-3.5" /> Ocultar “Costo”</ContextMenuItem></ContextMenuContent>
      </ContextMenu>
    ),
  }];
}
export function costoMetricaDe(visible: boolean, a: Analytics, material: string): MetricaKpi[] {
  if (!visible) return [];
  const costo = a.enrich.matCosto(material);
  return [{ etiqueta: `Costo${a.enrich.matUm(material) ? ` / ${a.enrich.matUm(material)}` : ''}`, valor: costo ? formatCurrency(costo) : '—' }];
}

/** Costo / UM como dato suelto (etiqueta + valor) para cabeceras: se oculta con clic derecho → "Ocultar Costo" (como el resto de tarjetas)
 * y por permiso de rol. Si está oculto no ocupa nada. */
export function CostoOcultable({ a, material, className }: { a: Analytics; material: string; className?: string }) {
  const [m] = useCostoMetrica(a, material);
  if (!m) return null;
  return (
    <div className={className ?? 'flex flex-col'}>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-text-faint">{m.etiqueta}</span>
      <span className="font-bold tabular-nums text-text">{m.valor}</span>
    </div>
  );
}
