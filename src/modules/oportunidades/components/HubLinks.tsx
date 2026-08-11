import { useNavigate } from 'react-router-dom';
import { Boxes, Activity, ClipboardList, Truck, HandCoins } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Atajos del HUB (req. 9): saltar a los módulos de reporte relacionados con
 * este material sin perder el contexto. Inventario/Consumo/Pedidos llegan con
 * `?material=` prefiltrado (ver hooks/useMaterialPrefiltro.ts, fase 3); DRP y
 * Comodato todavía no leen el query param — navegan a la ruta base. */
export function HubLinks({ material }: { material: string }) {
  const navigate = useNavigate();
  const q = encodeURIComponent(material);
  const items = [
    { label: 'Inventario', icon: Boxes, to: `/inventario?material=${q}` },
    { label: 'Consumo', icon: Activity, to: `/consumo?material=${q}` },
    { label: 'Pedidos', icon: ClipboardList, to: `/sugerencias?material=${q}` },
    { label: 'Solicitudes DRP', icon: Truck, to: '/solicitudes' },
    { label: 'Comodato', icon: HandCoins, to: '/comodato' },
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it) => (
        <Button key={it.to} variant="outline" size="sm" onClick={() => navigate(it.to)} title={`Ver ${material} en ${it.label}`}>
          <it.icon className="size-3.5" /> {it.label}
        </Button>
      ))}
    </div>
  );
}
