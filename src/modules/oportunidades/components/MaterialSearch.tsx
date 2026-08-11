import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DebouncedSearch } from '@/modules/analytics/ui';
import { matchesQuery } from '@/modules/analytics/helpers';
import { useAnalytics } from '@/modules/analytics/AnalyticsContext';

/** Buscador inteligente de materiales (req. 1): por código, descripción o
 * sector/grupo — construido sobre el índice de consumo ya cargado, sin
 * duplicar el catálogo. Selecciona un resultado → Material 360. */
export function MaterialSearch() {
  const navigate = useNavigate();
  const { result, enrich } = useAnalytics();
  const [q, setQ] = useState('');

  const materiales = useMemo(() => {
    const set = new Map<string, string>();
    for (const r of result?.consumo ?? []) if (r.material && !set.has(r.material)) set.set(r.material, r.textoMaterial || enrich.matTexto(r.material));
    return [...set.entries()];
  }, [result, enrich]);

  const shown = q ? materiales.filter(([mat, texto]) => matchesQuery(q, `${mat} ${texto} ${enrich.matSector(mat)} ${enrich.matGrupo(mat)}`)).slice(0, 12) : [];

  return (
    <div className="relative">
      <DebouncedSearch onChange={setQ} placeholder="Buscar material por código, descripción o familia…" className="w-full sm:w-96" />
      {shown.length > 0 && (
        <div className="absolute z-20 mt-1 w-full sm:w-96 rounded-lg border border-border bg-bg-elevated shadow-lg">
          {shown.map(([mat, texto]) => (
            <button
              key={mat}
              className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-bg-inset"
              onClick={() => navigate(`/oportunidades/material/${encodeURIComponent(mat)}`)}
            >
              <span className="font-mono text-xs text-accent">{mat}</span>
              <span className="truncate text-text">{texto || '—'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
