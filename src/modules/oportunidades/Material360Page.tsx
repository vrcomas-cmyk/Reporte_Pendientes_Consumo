import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { usePanelStore } from '@/store/panelStore';

/** Ruta directa a la vista 360 de un material (deep-link / búsqueda desde
 * fuera del panel). Reusa el mismo panel `materialHub` que abre la bandeja,
 * así el contenido nunca diverge entre "página" y "panel". */
export function Material360Page() {
  const { material } = useParams<{ material: string }>();
  const navigate = useNavigate();
  const open = usePanelStore((s) => s.open);

  useEffect(() => {
    if (material) open({ type: 'materialHub', material: decodeURIComponent(material) });
  }, [material, open]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <button onClick={() => navigate('/oportunidades')} className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text">
        <ArrowLeft className="size-4" /> Volver a Oportunidades
      </button>
      <p className="text-sm text-text-faint">Abriendo {material}…</p>
    </div>
  );
}
