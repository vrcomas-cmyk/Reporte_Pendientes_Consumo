import { Badge } from '@/components/ui/badge';
import { ESTADOS_OPORTUNIDAD, type EstadoOportunidad } from '@/core/types';

const VARIANT: Record<EstadoOportunidad, 'default' | 'outline' | 'warning' | 'danger' | 'success'> = {
  nueva: 'outline',
  'en-analisis': 'default',
  contactando: 'default',
  negociacion: 'warning',
  'colocada-parcial': 'success',
  'colocada-total': 'success',
  'sin-interesados': 'danger',
  'campana-agresiva': 'warning',
};

/** Badge del estado de una Oportunidad — colores consistentes con StatePill del resto del portal. */
export function EstadoBadge({ estado }: { estado: EstadoOportunidad }) {
  const label = ESTADOS_OPORTUNIDAD.find((e) => e.key === estado)?.label ?? estado;
  return <Badge variant={VARIANT[estado]}>{label}</Badge>;
}
