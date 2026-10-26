import { useEffect, useState } from 'react';
import { ReportPage, PageHeader } from '@/components/layout/report';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useFacturacionLibros } from '@/modules/analytics/useFacturacionLibros';
import { pedidosConfigurado, syncPedidos } from '@/services/pedidosService';
import { usePedidosStore } from '@/store/pedidosStore';
import { useConocimientoStore } from '@/store/conocimientoStore';
import { useTrasladosStore } from '@/store/trasladosStore';
import type { Oferta } from '@/core/types';
import { GenerarOfertas } from './GenerarOfertas';
import { SeguimientoOfertas } from './SeguimientoOfertas';
import { Traslados } from './Traslados';
import { PrepararTrasladoDialog } from './PrepararTrasladoDialog';

const REVISION_MIN_MS = 10 * 60_000;

/** Ofertas por ejecutivo (Excel por ejecutivo/zona), seguimiento comercial de lo ofertado y solicitudes de traslado con envío de correo MANUAL. */
export function OfertasTrasladosPage() {
  // Los precios autorizados, lotes y pedidos salen de los libros; el historial de facturación de los detalles, de los libros de Drive.
  useFacturacionLibros();
  const hidratado = usePedidosStore((s) => s.hidratado);
  const ofertas = useConocimientoStore((s) => s.ofertas);
  const traslados = useTrasladosStore((s) => s.traslados);
  const [tab, setTab] = useState('generar');
  const [paraTraslado, setParaTraslado] = useState<Oferta | null>(null);

  // Al abrir (ya restaurada la caché local): revisa en Drive si algún libro cambió, como Seg. de pedidos.
  useEffect(() => {
    if (!hidratado) return;
    const st = usePedidosStore.getState();
    const reciente = st.ultimaRevision !== null && Date.now() - st.ultimaRevision < REVISION_MIN_MS;
    if (st.syncing || reciente) return;
    void pedidosConfigurado().then((ok) => {
      if (ok) void syncPedidos().catch(() => undefined);
    });
  }, [hidratado]);

  // Con Disponibilidad al día, el seguimiento de los traslados se evalúa al abrir el módulo.
  useEffect(() => {
    void useTrasladosStore.getState().aplicarDisponibilidad();
  }, []);

  const conPedido = ofertas.filter((o) => o.pedido);
  const enSeguimiento = traslados.filter((t) => t.estatus !== 'recibido' && t.estatus !== 'cancelado').length;

  return (
    <ReportPage>
      <PageHeader
        title="Ofertas y traslados"
        subtitle="Prepara la oferta de cada ejecutivo, da seguimiento a lo ofertado y a los traslados. Los correos se envían a mano."
      />
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="self-start">
          <TabsTrigger value="generar">Generar ofertas</TabsTrigger>
          <TabsTrigger value="ofertas">Seguimiento de ofertas{conPedido.length ? ` · ${conPedido.length}` : ''}</TabsTrigger>
          <TabsTrigger value="traslados">Traslados{enSeguimiento ? ` · ${enSeguimiento}` : ''}</TabsTrigger>
        </TabsList>
        <TabsContent value="generar" className="min-h-0 flex-1"><GenerarOfertas onRegistradas={() => setTab('ofertas')} /></TabsContent>
        <TabsContent value="ofertas" className="min-h-0 flex-1"><SeguimientoOfertas onPrepararTraslado={(o) => setParaTraslado(o)} /></TabsContent>
        <TabsContent value="traslados" className="min-h-0 flex-1"><Traslados /></TabsContent>
      </Tabs>
      <PrepararTrasladoDialog oferta={paraTraslado} onClose={(creado) => { setParaTraslado(null); if (creado) setTab('traslados'); }} />
    </ReportPage>
  );
}
