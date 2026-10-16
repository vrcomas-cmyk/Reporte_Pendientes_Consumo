import { useEffect, useState } from 'react';
import { SugerenciasPage } from '@/modules/sugerencias/SugerenciasPage';
import { pedidosConfigurado, syncPedidos } from '@/services/pedidosService';
import { usePedidosStore } from '@/store/pedidosStore';
import { DetalleMaterialDialog } from './DetalleMaterialDialog';
import { useFacturacionLibros } from '@/modules/analytics/useFacturacionLibros';

/** Cada cuánto, como mínimo, se vuelve a consultar el manifiesto al abrir el módulo. */
const REVISION_MIN_MS = 10 * 60_000;

/** Módulo "Seg. de pedidos": es la MISMA página de Pedidos (columnas, filtros, paneles y acciones), pero
 * alimentada por los libros crudos de Google Sheets Seg pedidos, Disponibilidad e Inv_Condicion y sin fuentes
 * alternas. Aquí solo vive lo propio del origen: la revisión automática al abrir y el detalle emergente por material; el estado y la sincronización de los libros están en Carga. */
export function SegPedidosPage() {
  // El historial de facturación de sus detalles sale de los libros de Drive.
  useFacturacionLibros();
  const hidratado = usePedidosStore((s) => s.hidratado);
  const error = usePedidosStore((s) => s.error);
  const [materialDetalle, setMaterialDetalle] = useState<string | null>(null);

  // Al abrir el módulo (ya restaurada la caché local): revisa en Drive si algún libro cambió.
  useEffect(() => {
    if (!hidratado) return;
    const st = usePedidosStore.getState();
    const reciente = st.ultimaRevision !== null && Date.now() - st.ultimaRevision < REVISION_MIN_MS;
    if (st.syncing || reciente) return;
    void pedidosConfigurado().then((ok) => {
      if (ok) void syncPedidos().catch(() => undefined);
    });
  }, [hidratado]);

  return (
    <div className="flex h-full flex-col">
      {error && <p className="border-b border-danger/30 bg-danger/10 px-5 py-1.5 text-xs text-danger">{error}</p>}
      <div className="min-h-0 flex-1">
        <SugerenciasPage modo="seg" onDetalleLibros={setMaterialDetalle} />
      </div>
      <DetalleMaterialDialog material={materialDetalle} onClose={() => setMaterialDetalle(null)} />
    </div>
  );
}
