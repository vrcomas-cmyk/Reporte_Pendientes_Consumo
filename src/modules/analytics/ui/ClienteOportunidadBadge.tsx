import { Target } from 'lucide-react';
import { useConocimientoStore } from '@/store/conocimientoStore';
import { usePanelStore } from '@/store/panelStore';
import { norm } from '@/lib/text';
import { TooltipHint } from '@/components/ui/tooltip';

const CONDICION_LABEL: Record<string, string> = {
  'corta-caducidad': 'Corta caducidad', 'lento-movimiento': 'Lento movimiento', calidad: 'Calidad', danado: 'Dañado', normal: 'Normal',
};

/** Indicador de "este cliente ya tiene ficha en Oportunidades" — visible
 * directo en la fila de Consumo/Pedidos, sin tener que abrir el detalle
 * primero. El tooltip adelanta las condiciones que acepta y su tasa de
 * aceptación; clic abre la ficha completa (`clienteConocimiento`). */
export function ClienteOportunidadBadge({ dest }: { dest: string }) {
  const cliente = useConocimientoStore((s) => s.clientesByDest.get(norm(dest)));
  const open = usePanelStore((s) => s.open);
  if (!cliente) return null;

  const condiciones = cliente.condicionesAceptadas.map((c) => CONDICION_LABEL[c] ?? c);
  const tooltip = [
    condiciones.length ? `Acepta: ${condiciones.join(', ')}` : 'Sin condiciones registradas',
    cliente.caducidadMinimaDias != null ? `Caducidad mín. ${cliente.caducidadMinimaDias} días` : null,
    cliente.tasaAceptacion != null ? `Tasa de aceptación: ${Math.round(cliente.tasaAceptacion * 100)}%` : null,
  ].filter(Boolean).join(' · ');

  return (
    <TooltipHint text={`Ya tiene ficha en Oportunidades. ${tooltip}`}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); open({ type: 'clienteConocimiento', dest: cliente.dest, razonSocial: cliente.razonSocial }); }}
        className="inline-flex items-center gap-0.5 rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] text-accent hover:bg-accent/20"
      >
        <Target className="size-2.5" /> Oportunidades
      </button>
    </TooltipHint>
  );
}
