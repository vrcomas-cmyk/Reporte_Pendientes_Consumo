import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useAnalytics } from '@/modules/analytics/AnalyticsContext';
import { condicionesDisponibles } from '@/core/oportunidad';
import type { CondicionEspecial } from '@/core/types';

const CATEGORIAS: { key: CondicionEspecial; label: string }[] = [
  { key: 'corta-caducidad', label: 'Corta caducidad' },
  { key: 'lento-movimiento', label: 'Lento movimiento' },
  { key: 'calidad', label: 'Calidad' },
  { key: 'danado', label: 'Dañado' },
];

/** Selector de "qué condiciones acepta" un cliente — las 4 categorías fijas
 * de siempre, MÁS cualquier valor real de negocio (p. ej. "Cosmopark",
 * "PNC") tal como aparece en la columna Condición de Inv Condición o Fuente
 * de Pedidos. Antes solo existían las 4 categorías: un cliente que en
 * realidad acepta "Cosmopark" no tenía forma de configurarlo — quedaba
 * clasificado como 'normal' y nunca hacía match. */
export function CondicionSelector({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { bo, invCondicion } = useAnalytics();
  const [q, setQ] = useState('');
  const disponibles = useMemo(() => condicionesDisponibles(bo, invCondicion), [bo, invCondicion]);
  const qNorm = q.trim().toLowerCase();
  const shown = qNorm ? disponibles.filter((v) => v.toLowerCase().includes(qNorm)) : disponibles;

  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {CATEGORIAS.map((c) => (
          <button key={c.key} type="button" onClick={() => toggle(c.key)}>
            <Badge variant={value.includes(c.key) ? 'success' : 'outline'} className={cn('cursor-pointer', !value.includes(c.key) && 'opacity-60')}>{c.label}</Badge>
          </button>
        ))}
      </div>
      {disponibles.length > 0 && (
        <div className="mt-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar otro valor real (Cosmopark, PNC…)" className="h-7 max-w-xs text-xs" />
          <div className="mt-1.5 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
            {shown.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => toggle(v)}
                className={cn('rounded-full border px-2.5 py-1 text-xs', value.includes(v) ? 'border-accent bg-accent-soft text-accent' : 'border-border text-text-muted hover:border-accent/50')}
              >
                {v}
              </button>
            ))}
            {shown.length === 0 && <p className="text-[11px] text-text-faint">Sin coincidencias.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
