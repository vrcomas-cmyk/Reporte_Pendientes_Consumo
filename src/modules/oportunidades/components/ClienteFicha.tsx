import { StatTile } from '@/modules/analytics/ui';
import { useConocimientoStore } from '@/store/conocimientoStore';
import { norm } from '@/lib/text';
import { ClienteFichaForm } from './ClienteFichaForm';

/** Ficha de conocimiento del cliente: formulario editable + métricas
 * derivadas (tasa de aceptación, tiempo de respuesta) — estas últimas quedan
 * en 0 hasta que exista historial de ofertas real (fase 3). */
export function ClienteFicha({ dest, razonSocial }: { dest: string; razonSocial: string }) {
  const cliente = useConocimientoStore((s) => s.clientesByDest.get(norm(dest)) ?? null);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <StatTile label="Tiempo de respuesta" value={cliente?.tiempoRespuestaPromDias != null ? `${cliente.tiempoRespuestaPromDias}d` : '—'} sub="automático (fase 3)" />
        <StatTile label="Tasa de aceptación" value={cliente?.tasaAceptacion != null ? `${Math.round(cliente.tasaAceptacion * 100)}%` : '—'} sub="automático (fase 3)" />
      </div>
      <ClienteFichaForm dest={dest} razonSocial={razonSocial} existing={cliente} />
    </div>
  );
}
