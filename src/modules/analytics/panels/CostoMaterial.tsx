import { usePermissionsStore } from '@/store/permissionsStore';
import { isDetailHidden } from '@/core/permissions';
import { formatCurrency } from '@/lib/utils';
import { StatTile } from '../ui';
import type { Analytics } from '../AnalyticsContext';

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
  return <StatTile label={`Costo${a.enrich.matUm(material) ? ` / ${a.enrich.matUm(material)}` : ''}`} value={costo ? formatCurrency(costo) : '—'} />;
}
