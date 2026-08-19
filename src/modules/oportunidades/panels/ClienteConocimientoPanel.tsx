import { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Chip } from '@/modules/analytics/ui';
import { ClienteFicha } from '../components/ClienteFicha';
import { ObservacionesList } from '../components/ObservacionesList';
import { Timeline } from '../components/Timeline';
import { OfertaForm, OfertaRow } from '../components/OfertaForm';
import { ReglaMaterialForm, MaterialPicker } from '../components/ReglaMaterialForm';
import { ClienteResumen360 } from '@/modules/analytics/panels/ClienteResumen360';
import { useConocimientoStore } from '@/store/conocimientoStore';
import { usePanelStore } from '@/store/panelStore';
import { norm } from '@/lib/text';
import type { Panel } from '@/store/panelStore';
import type { Analytics } from '@/modules/analytics/AnalyticsContext';

/** Excepciones por material del cliente — los overrides que sobrescriben su
 * regla global (la ficha) para un material concreto. */
function ExcepcionesMaterial({ dest }: { dest: string }) {
  const reglas = useConocimientoStore((s) => s.reglas);
  const removeRegla = useConocimientoStore((s) => s.removeRegla);
  const [adding, setAdding] = useState(false);
  const [nuevo, setNuevo] = useState<string | null>(null);

  const overrides = useMemo(() => reglas.filter((r) => norm(r.dest) === norm(dest) && r.material != null), [reglas, dest]);

  return (
    <div className="mt-5 border-t border-border pt-3">
      <h3 className="mb-1 text-sm font-semibold text-text">Excepciones por material ({overrides.length})</h3>
      <p className="mb-2 text-xs text-text-muted">Excepción para un material específico — gana sobre la regla global de arriba para ese material. Ej.: acepta X con corta-caducidad aunque su regla global exija buena caducidad.</p>
      <div className="flex flex-col gap-2">
        {overrides.map((r) => (
          <div key={r.id ?? r.material} className="rounded-lg border border-border bg-bg-elevated">
            <div className="flex items-center justify-between px-3 pt-2">
              <span className="font-mono text-xs text-accent">{r.material}</span>
              <button type="button" onClick={() => r.id != null && removeRegla(r.id)} className="text-text-faint hover:text-red-500" title="Eliminar excepción"><Trash2 className="size-3.5" /></button>
            </div>
            <div className="p-3 pt-1"><ReglaMaterialForm dest={dest} material={r.material ?? ''} existing={r} /></div>
          </div>
        ))}
      </div>

      {adding ? (
        <div className="mt-2">
          {!nuevo ? (
            <MaterialPicker onPick={setNuevo} />
          ) : (
            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <span className="font-mono text-xs text-accent">{nuevo}</span>
                <button type="button" className="text-xs text-text-faint hover:text-text" onClick={() => setNuevo(null)}>Cambiar</button>
              </div>
              <ReglaMaterialForm dest={dest} material={nuevo} onSaved={() => { setAdding(false); setNuevo(null); }} />
            </div>
          )}
        </div>
      ) : (
        <Button variant="outline" size="sm" className="mt-2" onClick={() => setAdding(true)}>+ Agregar excepción por material</Button>
      )}
    </div>
  );
}

/** Ficha de conocimiento del cliente: un solo lugar por cliente donde viven
 * juntas la ficha (contacto + regla global de aceptación), las excepciones
 * por material, las ofertas y el historial. */
export function ClienteConocimientoPanel({ panel, a, push }: { panel: Extract<Panel, { type: 'clienteConocimiento' }>; a: Analytics; push: (p: Panel) => void }) {
  const { dest, razonSocial } = panel;
  const replaceTop = usePanelStore((s) => s.replaceTop);
  const todasOfertas = useConocimientoStore((s) => s.ofertas);
  // Memoizado por la misma razón que MaterialHubPanel: un selector inline con
  // `.filter()` devuelve un array nuevo en cada lectura del store y, junto
  // con `replaceTop()` disparado en cada cambio de tab, producía el ciclo de
  // renders que terminaba en "Maximum update depth exceeded".
  const ofertas = useMemo(() => todasOfertas.filter((o) => norm(o.dest) === norm(dest)), [todasOfertas, dest]);
  const precioLista = panel.prefillMaterial ? a.enrich.matPrecioOferta(panel.prefillMaterial) : undefined;

  return (
    <div>
      <h2 className="font-display text-lg font-semibold">{razonSocial || dest}</h2>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-text-muted">
        Destinatario <Chip>{dest}</Chip>
      </p>

      <Tabs defaultValue={panel.tab ?? 'resumen'} onValueChange={(v) => replaceTop({ ...panel, tab: v as 'resumen' | 'ficha' | 'timeline' | 'ofertas' })} className="mt-4">
        <TabsList>
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="ficha">Ficha</TabsTrigger>
          <TabsTrigger value="timeline">Línea de tiempo</TabsTrigger>
          <TabsTrigger value="ofertas">Ofertas ({ofertas.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen">
          <ClienteResumen360 dest={dest} a={a} push={push} />
        </TabsContent>

        <TabsContent value="ficha">
          <ClienteFicha dest={dest} razonSocial={razonSocial ?? ''} />
          <ExcepcionesMaterial dest={dest} />
          <div className="mt-5 border-t border-border pt-3">
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
            prefillLote={panel.prefillLote}
            prefillCondicion={panel.prefillCondicion}
            prefillCondicionTexto={panel.prefillCondicionTexto}
            prefillFechaCaducidad={panel.prefillFechaCaducidad}
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
