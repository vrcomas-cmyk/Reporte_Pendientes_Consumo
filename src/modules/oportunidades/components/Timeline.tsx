import { useMemo } from 'react';
import { Phone, Mail, MessageCircle, MapPin, Tag, StickyNote, RefreshCcw } from 'lucide-react';
import { useConocimientoStore } from '@/store/conocimientoStore';
import { norm } from '@/lib/text';
import type { TipoInteraccion } from '@/core/types';

const ICONS: Record<TipoInteraccion, typeof Phone> = {
  llamada: Phone, correo: Mail, whatsapp: MessageCircle, visita: MapPin, oferta: Tag, nota: StickyNote, 'cambio-estado': RefreshCcw,
};

/** Línea de tiempo comercial de un cliente (req. 5): toda interacción
 * registrada — cambios de estado de oportunidad, ofertas y resultados — en
 * orden cronológico. Se alimenta sola: cada mutación del store empuja su
 * propia Interaccion, así que no hay nada que el usuario deba "llenar" aquí. */
export function Timeline({ dest }: { dest: string }) {
  const todasInteracciones = useConocimientoStore((s) => s.interacciones);
  const interacciones = useMemo(() => todasInteracciones.filter((i) => norm(i.dest) === norm(dest)), [todasInteracciones, dest]);
  if (interacciones.length === 0) {
    return <p className="text-sm text-text-muted">Sin interacciones registradas todavía. Se llenan automáticamente al registrar ofertas o cambiar el estado de una oportunidad de este cliente.</p>;
  }
  return (
    <ol className="flex flex-col gap-3 border-l border-border pl-4">
      {interacciones.map((i) => {
        const Icon = ICONS[i.tipo];
        return (
          <li key={i.id} className="relative">
            <span className="absolute -left-[21px] top-0.5 flex size-4 items-center justify-center rounded-full bg-bg-inset text-text-muted">
              <Icon className="size-2.5" />
            </span>
            <p className="text-sm text-text">{i.resumen}</p>
            <p className="mt-0.5 text-[11px] text-text-faint">{new Date(i.fecha).toLocaleString('es-MX')}{i.material ? ` · ${i.material}` : ''}</p>
          </li>
        );
      })}
    </ol>
  );
}
