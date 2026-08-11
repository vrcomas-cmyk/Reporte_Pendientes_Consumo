import { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useConocimientoStore } from '@/store/conocimientoStore';
import { norm } from '@/lib/text';

/** Bitácora de observaciones libres de un cliente (req. "registro de
 * conocimiento", opcionalmente ligadas a un material) — append-only, cada
 * entrada queda con autor y fecha; nunca se edita, solo se agrega o se borra. */
export function ObservacionesList({ dest, material }: { dest: string; material?: string }) {
  // Selector estable: se lee el array completo del store (misma referencia
  // hasta que cambie de verdad) y se filtra en un useMemo — un `.filter()`
  // inline en el selector devuelve una referencia nueva en cada notificación
  // del store, lo que en este panel (con push()/replaceTop() en cascada al
  // guardar) producía renders encadenados hasta "Maximum update depth exceeded".
  const todasObservaciones = useConocimientoStore((s) => s.observaciones);
  const observaciones = useMemo(() => todasObservaciones.filter((o) => norm(o.dest) === norm(dest)), [todasObservaciones, dest]);
  const addObservacion = useConocimientoStore((s) => s.addObservacion);
  const removeObservacion = useConocimientoStore((s) => s.removeObservacion);
  const [texto, setTexto] = useState('');

  function agregar() {
    if (!texto.trim()) return;
    void addObservacion({ dest, material, texto: texto.trim(), creadoEn: new Date().toISOString(), creadoPor: '' });
    setTexto('');
  }

  return (
    <div>
      <div className="flex gap-2">
        <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Nueva observación…" onKeyDown={(e) => e.key === 'Enter' && agregar()} />
        <Button size="sm" onClick={agregar} disabled={!texto.trim()}>Agregar</Button>
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {observaciones.length === 0 && <p className="text-sm text-text-muted">Sin observaciones todavía.</p>}
        {observaciones.map((o) => (
          <li key={o.id} className="group flex items-start justify-between gap-2 rounded-lg border border-border bg-bg-elevated p-2.5 text-sm">
            <div>
              <p className="text-text">{o.texto}</p>
              <p className="mt-0.5 text-[11px] text-text-faint">{new Date(o.creadoEn).toLocaleDateString('es-MX')}{o.material ? ` · material ${o.material}` : ''}{o.creadoPor ? ` · ${o.creadoPor}` : ''}</p>
            </div>
            <button
              type="button"
              aria-label="Eliminar observación"
              className="shrink-0 text-text-faint opacity-0 hover:text-danger group-hover:opacity-100"
              onClick={() => o.id != null && removeObservacion(o.id)}
            >
              <Trash2 className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
