import { useEffect } from 'react';
import { pedidosConfigurado } from '@/services/pedidosService';
import { syncFacturacion } from '@/services/facturacionLibrosService';
import { useFacturacionStore } from '@/store/facturacionStore';
import { useFacFuenteStore } from '@/store/facFuenteStore';

/** Cada cuánto, como mínimo, se vuelve a consultar Drive al abrir un módulo que usa la facturación (igual que Facturación). */
const REVISION_MIN_MS = 10 * 60_000;

/** Para los módulos que alimentan sus detalles/tendencias con la facturación de los libros trimestrales de Drive sin ser la tabla de
 * Facturación (Inventario · Disponibilidad, Inv con Condición, Seg. de pedidos): mientras están abiertos
 *  1) piden que se armen los índices de facturación (si no, quedarían vacíos: "sin facturación cargada"), y
 *  2) al abrir revisan Drive —baja todo si nunca se cargó o solo lo que cambió—, como máximo cada 10 minutos. */
export function useFacturacionLibros(): void {
  const hidratado = useFacturacionStore((s) => s.hidratado);
  useEffect(() => useFacFuenteStore.getState().pedir(), []);
  useEffect(() => {
    if (!hidratado) return;
    const st = useFacturacionStore.getState();
    const reciente = st.ultimaRevision !== null && Date.now() - st.ultimaRevision < REVISION_MIN_MS;
    if (st.syncing || reciente) return;
    void pedidosConfigurado().then((ok) => {
      if (ok) void syncFacturacion().catch(() => undefined);
    });
  }, [hidratado]);
}
