import { useMemo } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Chip } from '@/modules/analytics/ui';
import { ClienteFicha } from '../components/ClienteFicha';
import { ObservacionesList } from '../components/ObservacionesList';
import { Timeline } from '../components/Timeline';
import { OfertaForm, OfertaRow } from '../components/OfertaForm';
import { useConocimientoStore } from '@/store/conocimientoStore';
import { usePanelStore } from '@/store/panelStore';
import { norm } from '@/lib/text';
import type { Panel } from '@/store/panelStore';
import type { Analytics } from '@/modules/analytics/AnalyticsContext';

/** Ficha de conocimiento del cliente (req. 3): mini-CRM interno con pestañas
 * — igual que MaterialHubPanel, el tab activo vive en el descriptor Panel.
 * Timeline y Ofertas (fase 3) leen/escriben directo del conocimientoStore. */
export function ClienteConocimientoPanel({ panel, a }: { panel: Extract<Panel, { type: 'clienteConocimiento' }>; a: Analytics }) {
  const { dest, razonSocial } = panel;
  const push = usePanelStore((s) => s.push);
  const replaceTop = usePanelStore((s) => s.replaceTop);
  const todasOfertas = useConocimientoStore((s) => s.ofertas);
  // Memoizado por la misma razón que MaterialHubPanel: un selector inline con
  // `.filter()` devuelve un array nuevo en cada lectura del store y, junto
  // con `push()` disparado en cada cambio de tab, producía el ciclo de
  // renders que terminaba en "Maximum update depth exceeded".
  const ofertas = useMemo(() => todasOfertas.filter((o) => norm(o.dest) === norm(dest)), [todasOfertas, dest]);
  const precioLista = panel.prefillMaterial ? a.enrich.matPrecioOferta(panel.prefillMaterial) : undefined;

  return (
    <div>
      <h2 className="font-display text-lg font-semibold">{razonSocial || dest}</h2>
      <p className="mt-1 text-sm text-text-muted">
        Destinatario <Chip onClick={() => push({ type: 'clienteDetalle', dest })}>{dest}</Chip>
      </p>

      <Tabs defaultValue={panel.tab ?? 'ficha'} onValueChange={(v) => replaceTop({ ...panel, tab: v as 'ficha' | 'timeline' | 'ofertas' })} className="mt-4">
        <TabsList>
          <TabsTrigger value="ficha">Ficha</TabsTrigger>
          <TabsTrigger value="timeline">Línea de tiempo</TabsTrigger>
          <TabsTrigger value="ofertas">Ofertas ({ofertas.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="ficha">
          <ClienteFicha dest={dest} razonSocial={razonSocial ?? ''} />
          <div className="mt-4">
            <h3 className="mb-2 text-sm font-semibold text-text">Observaciones</h3>
            <ObservacionesList dest={dest} />
          </div>
        </TabsContent>

        <TabsContent value="timeline">
          <Timeline dest={dest} />
        </TabsContent>

        <TabsContent value="ofertas">
          <OfertaForm
            dest={dest}
            razonSocial={razonSocial ?? ''}
            prefillMaterial={panel.prefillMaterial}
            prefillOportunidadId={panel.prefillOportunidadId}
            precioLista={precioLista}
          />
          <div className="mt-3 flex flex-col gap-2">
            {ofertas.length === 0 && <p className="text-sm text-text-muted">Sin ofertas registradas todavía.</p>}
            {ofertas.map((o) => <OfertaRow key={o.id} oferta={o} />)}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
