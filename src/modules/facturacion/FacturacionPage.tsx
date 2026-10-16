import { useEffect } from 'react';
import { ConsumoPage } from '@/modules/consumo/ConsumoPage';
import { pedidosConfigurado } from '@/services/pedidosService';
import { syncFacturacion } from '@/services/facturacionLibrosService';
import { useFacturacionStore } from '@/store/facturacionStore';

/** Cada cuánto, como mínimo, se vuelve a consultar Drive al abrir el módulo. */
const REVISION_MIN_MS = 10 * 60_000;

/** Módulo "Facturación": es la MISMA página de Consumo (columnas, filtros, paneles y acciones), pero alimentada solo
 * por los libros trimestrales de la carpeta de Drive y con su propia carga (Carga → Sincronizar facturación). Al abrirlo:
 * si nunca se ha cargado baja TODOS los libros; si ya hay datos, solo revisa los libros que cambiaron. */
export function FacturacionPage() {
  const hidratado = useFacturacionStore((s) => s.hidratado);
  const error = useFacturacionStore((s) => s.error);

  useEffect(() => {
    if (!hidratado) return;
    const st = useFacturacionStore.getState();
    const reciente = st.ultimaRevision !== null && Date.now() - st.ultimaRevision < REVISION_MIN_MS;
    if (st.syncing || reciente) return;
    void pedidosConfigurado().then((ok) => {
      if (ok) void syncFacturacion().catch(() => undefined);
    });
  }, [hidratado]);

  return (
    <div className="flex h-full flex-col">
      {error && <p className="border-b border-danger/30 bg-danger/10 px-5 py-1.5 text-xs text-danger">{error}</p>}
      <div className="min-h-0 flex-1">
        <ConsumoPage modo="fac" />
      </div>
    </div>
  );
}
