import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { StatTile, StatePill, EvolChart } from '../ui';
import { Section, PrecioCondicionBox, SugTable, ConsumoTable } from './_shared';
import { formatNumber, formatCurrency, formatFechaCaducidad } from '@/lib/utils';
import { almacenesDeCondicion } from '@/core/inventoryRules';
import { pendPorCondicion, transitoPorCondicion, impPendPorCondicion, esLentoPorCondicion, type RSSAlmacen } from '@/core/resumenSin';
import { serieMaterial, serieMatCentro } from '@/core/resumenFac';
import { norm, sugFor, consFor } from '../helpers';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { buildFromInvDetalle, buildFromResumenSin } from '@/services/solicitudService';
import { useSolicitarDialog } from '@/modules/solicitudes/useSolicitarDialog';
import { SolicitarDialog } from '@/modules/solicitudes/SolicitarDialog';
import { SolicitarContextMenu } from '@/modules/solicitudes/SolicitarContextMenu';
import { useSolicitudStore } from '@/store/solicitudStore';
import { CENTERS, type InvDetalleRow } from '@/core/types';
import type { Panel } from '@/store/panelStore';
import type { Analytics } from '../AnalyticsContext';

/** Panel — Detalle por material+centro del reporte "Inv Condición"
 * (InvConsolidado): mismo detalle que `CeldaPanel` (módulo Inventario) —
 * pendiente/tránsito/importe pendiente, desglose por almacén, tendencia y
 * sugerencias/consumo de ese centro (Resumen Sin Sugerencias / Reporte de
 * Consumo) — pero restringido a los almacenes que aplican según la condición
 * (RN-INV-002: solo 1032 en corta caducidad, 1030+1031+1060 en cualquier
 * otro caso), MÁS el detalle de lotes de "InvDetalle", propio de este
 * reporte (la misma fuente/sincronización que "Inv Condición", sin mezclar
 * con Resumen Sin Sugerencias, que viene de otro spreadsheet y puede estar
 * desfasado). */
export function InvCondCeldaPanel({ panel, a, push }: { panel: Extract<Panel, { type: 'invCondCelda' }>; a: Analytics; push: (p: Panel) => void }) {
  const condicionMat = a.invCondicion.find((r) => norm(r.material) === norm(panel.material))?.condicion || '';
  const almacenesAplicables = new Set(almacenesDeCondicion(condicionMat).map(norm));
  const lotes = a.lotes.filter((l) => norm(l.material) === norm(panel.material) && norm(l.centro) === norm(panel.centro));
  const totalAplica = lotes.filter((l) => almacenesAplicables.has(norm(l.almacen))).reduce((s, l) => s + l.cantidadDisp, 0);
  const totalTodos = lotes.reduce((s, l) => s + l.cantidadDisp, 0);
  const desc = lotes[0]?.textoBreve || a.rss?.mats.get(norm(panel.material))?.desc || '';

  const mo = a.rss?.mats.get(norm(panel.material));
  const co = mo?.centros.get(norm(panel.centro));
  const pend = pendPorCondicion(co, condicionMat);
  const transito = transitoPorCondicion(co, condicionMat);
  const impPend = impPendPorCondicion(co, condicionMat);
  const sug = sugFor(a.bo, panel.material, panel.centro);
  const cons = consFor(a.result?.consumo ?? [], panel.material, panel.centro);
  // Un almacén aplicable se muestra en cuanto tenga CUALQUIER dato — no solo
  // cuando Resumen Sin Sugerencias trae una fila propia para él (p.ej. 1060
  // puede no tener pendiente/tránsito reportado ahí y aun así tener
  // inventario, leído de `co.invAlm`, el mismo total por almacén que ya usa
  // `invPorCondicion`) — antes se ocultaba silenciosamente en ese caso.
  const almsAplicables: RSSAlmacen[] = co
    ? almacenesDeCondicion(condicionMat)
        .map((alm): RSSAlmacen => co.alm.get(alm) ?? {
          alm, inv: co.invAlm[alm] || 0, pend: 0, transito: 0, impPend: 0, prom: 0,
          ultMes: '', cantUlt: 0, penMes: '', cantPen: 0, meses: 0, status: '', fuente: '',
        })
        .filter((al) => al.inv > 0 || al.pend > 0 || al.transito > 0)
        .sort((x, y) => String(x.alm).localeCompare(String(y.alm)))
    : [];

  const serieCentro = serieMatCentro(a.rf, panel.material, panel.centro);
  const usaCentro = serieCentro.length > 0;

  const solicitar = useSolicitarDialog();
  const solicitudesList = useSolicitudStore((s) => s.list);
  const yaSolicitado = solicitudesList.some((s) => s.origen === 'inventario' && norm(s.sourceKey.split('|')[1]) === norm(panel.material));
  const lotesDeAlmacen = (almacen: string) => lotes.filter((l) => norm(l.almacen) === norm(almacen));
  const onSolicitarAlm = (al: RSSAlmacen) => {
    const loteElegido = lotesDeAlmacen(al.alm)[0] ?? null;
    solicitar.abrir(buildFromResumenSin(
      { material: panel.material, descripcion: desc, centro: panel.centro, almacen: al.alm, cantidadPendiente: al.pend || al.inv },
      loteElegido, a.enrich,
    ));
  };
  const onSolicitarLote = (l: InvDetalleRow) => solicitar.abrir(buildFromInvDetalle(l, a.enrich));

  // Mismo dato que la celda del centro actual en la tabla de "Inv
  // Condición" (Inv/Pend/Tránsito/lento), pero para los OTROS centros —
  // para no obligar a cerrar el panel y volver a la tabla solo para
  // comparar dónde más hay (o falta) inventario de este material.
  const invRow = a.invCondicion.find((r) => norm(r.material) === norm(panel.material));
  const otrosCentros = CENTERS
    .filter((c) => norm(c) !== norm(panel.centro))
    .map((c) => {
      const coC = mo?.centros.get(c);
      return {
        centro: c,
        inv: invRow?.invByCenter[c] || 0,
        pend: pendPorCondicion(coC, condicionMat),
        transito: transitoPorCondicion(coC, condicionMat),
        lento: a.rss ? esLentoPorCondicion(coC, condicionMat, a.rss.curMes) : false,
      };
    });

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <aside className="shrink-0 lg:sticky lg:top-0 lg:w-52">
        <Section title="Otros centros (según condición)">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
            {otrosCentros.map((o) => (
              <button
                key={o.centro}
                type="button"
                onClick={() => push({ type: 'invCondCelda', material: panel.material, centro: o.centro })}
                className="rounded-md border border-border px-2.5 py-1.5 text-left hover:border-accent"
              >
                <p className="text-[11px] text-text-faint">Inv {o.centro}</p>
                <p className="font-mono text-sm">
                  {formatNumber(o.inv)}
                  {o.transito > 0 && <span className="text-emerald-500"> +{formatNumber(o.transito)}</span>}
                  {o.lento && <AlertTriangle className="ml-1 inline size-3 text-warning" />}
                </p>
                {o.pend > 0 && <p className="text-[11px] text-danger">Pend {formatNumber(o.pend)}</p>}
              </button>
            ))}
          </div>
        </Section>
      </aside>
      <div className="min-w-0 flex-1">
      <h2 className="font-display text-lg font-semibold">{panel.material} · Centro {panel.centro}</h2>
      <p className="mt-1 text-sm text-text-muted">{desc} · Condición: {condicionMat || '—'}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Inv. según condición" value={formatNumber(totalAplica)} />
        <StatTile label="Pendiente" value={formatNumber(pend)} tone="text-danger" />
        <StatTile label="En tránsito" value={formatNumber(transito)} tone="text-warning" />
        <StatTile label="Importe pend." value={formatCurrency(impPend)} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Inv. total (todos los almacenes)" value={formatNumber(totalTodos)} />
        <StatTile label="Lotes" value={formatNumber(lotes.length)} />
      </div>
      <PrecioCondicionBox a={a} material={panel.material} />

      <Section title="Desglose por almacén (según condición)">
        <p className="mb-2 text-xs text-text-faint">Clic derecho en una fila = Solicitar / Copiar.</p>
        {almsAplicables.length === 0 ? (
          <p className="text-sm text-text-muted">Sin inventario, pendiente ni tránsito en los almacenes aplicables a esta condición en este centro.</p>
        ) : (
          <div>
            <Table wrapperClassName="max-h-64 rounded-lg border border-border">
              <TableHeader><TableRow><TableHead>Almacén</TableHead><TableHead className="text-right">Inv.</TableHead><TableHead className="text-right">Pend.</TableHead><TableHead className="text-right">Tránsito</TableHead><TableHead className="text-right">Prom.</TableHead><TableHead>Último</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {almsAplicables.map((al, i) => (
                  <SolicitarContextMenu
                    key={i}
                    label={`${panel.material} · Alm ${al.alm}`}
                    solicitado={yaSolicitado}
                    onSolicitar={() => onSolicitarAlm(al)}
                    copyItems={[{ label: 'Material', value: panel.material }, { label: 'Centro', value: panel.centro }, { label: 'Almacén', value: al.alm }]}
                  >
                    <TableRow className="cursor-context-menu">
                      <TableCell>{al.alm}<StatePill label="aplica" cls="verde" /></TableCell>
                      <TableCell className="text-right">{formatNumber(al.inv)}</TableCell>
                      <TableCell className="text-right">{al.pend ? formatNumber(al.pend) : '—'}</TableCell>
                      <TableCell className="text-right">{al.transito ? formatNumber(al.transito) : '—'}</TableCell>
                      <TableCell className="text-right">{formatNumber(al.prom)}</TableCell>
                      <TableCell>{al.ultMes || '—'}</TableCell>
                      <TableCell>{al.status ? <StatePill label={al.status} cls="amb" /> : '—'}</TableCell>
                    </TableRow>
                  </SolicitarContextMenu>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>

      <Section title="Detalle de lotes (InvDetalle)">
        <p className="mb-2 text-xs text-text-faint">Clic derecho en una fila = Solicitar / Copiar.</p>
        {lotes.length === 0 ? (
          <p className="text-sm text-text-muted">Sin lotes en InvDetalle para este material y centro.</p>
        ) : (
          <div>
            <Table wrapperClassName="max-h-96 rounded-lg border border-border">
              <TableHeader>
                <TableRow>
                  <TableHead>Almacén</TableHead><TableHead>Lote</TableHead>
                  <TableHead className="text-right">Disp.</TableHead><TableHead>Vence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lotes
                  .slice()
                  .sort((x, y) => x.almacen.localeCompare(y.almacen))
                  .map((l, i) => (
                    <SolicitarContextMenu
                      key={i}
                      label={`${l.material} · Lote ${l.lote || '—'}`}
                      solicitado={yaSolicitado}
                      onSolicitar={() => onSolicitarLote(l)}
                      copyItems={[{ label: 'Material', value: l.material }, { label: 'Lote', value: l.lote }, { label: 'Almacén', value: l.almacen }]}
                    >
                      <TableRow className="cursor-context-menu">
                        <TableCell>{l.almacen}{almacenesAplicables.has(norm(l.almacen)) && <StatePill label="aplica" cls="verde" />}</TableCell>
                        <TableCell>{l.lote || '—'}</TableCell>
                        <TableCell className="text-right">{formatNumber(l.cantidadDisp)}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{formatFechaCaducidad(l.fechaCaducidad)}</TableCell>
                      </TableRow>
                    </SolicitarContextMenu>
                  ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>

      <Section title={usaCentro ? `Tendencia del material · Centro ${panel.centro}` : 'Tendencia del material (general — sin historia en este centro)'}>
        <EvolChart serie={usaCentro ? serieCentro : serieMaterial(a.rf, panel.material)} height={180} />
      </Section>

      <Section title="Sugerencias / Consumo en este centro">
        <Tabs defaultValue="sug">
          <TabsList><TabsTrigger value="sug">Sugerencias ({sug.length})</TabsTrigger><TabsTrigger value="cons">Consumo ({cons.length})</TabsTrigger></TabsList>
          <TabsContent value="sug"><SugTable list={sug} a={a} push={push} /></TabsContent>
          <TabsContent value="cons"><ConsumoTable list={cons} a={a} push={push} /></TabsContent>
        </Tabs>
      </Section>
      <div className="mt-3">
        <Button variant="outline" size="sm" onClick={() => push({ type: 'materialTotales', material: panel.material })}>Ver totales del material</Button>
      </div>
      <SolicitarDialog draft={solicitar.dialogDraft} loteOptions={solicitar.dialogLoteOptions} onClose={solicitar.cerrar} />
      </div>
    </div>
  );
}
