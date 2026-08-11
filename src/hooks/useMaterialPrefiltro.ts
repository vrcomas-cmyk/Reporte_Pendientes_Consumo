import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/** Lee `?material=` de la URL una sola vez al montar y aplica ese valor como
 * query de la página (via `setQ`, el estado de búsqueda ya existente en
 * Consumo/Inventario/Pedidos) — cierra el HUB del módulo Oportunidades
 * (req. 9): "Ver en Consumo" desde un material no debe aterrizar en una
 * tabla sin filtrar. `DebouncedSearch` es no controlado por diseño (perf),
 * así que el cuadro de búsqueda queda visualmente vacío; el banner devuelto
 * por este hook es la señal visible de que sí hay un filtro activo. */
export function useMaterialPrefiltro(setQ: (v: string) => void): { prefiltro: string | null; clear: () => void } {
  const [params, setParams] = useSearchParams();
  const [prefiltro, setPrefiltro] = useState<string | null>(null);

  useEffect(() => {
    const material = params.get('material');
    if (!material) return;
    setQ(material);
    setPrefiltro(material);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clear() {
    setQ('');
    setPrefiltro(null);
    const next = new URLSearchParams(params);
    next.delete('material');
    setParams(next, { replace: true });
  }

  return { prefiltro, clear };
}
