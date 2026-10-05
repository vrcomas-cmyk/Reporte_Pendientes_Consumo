import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { StatTile, EvolChart, StatePill } from '../ui';
import { Section, SugTable, ConsumoTable, PrecioCondicionBox } from './_shared';
import { MaterialInventarioSection } from './MaterialInventario';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { invGen, coberturaEstado, COBERTURA_LABEL, COBERTURA_CLS } from '@/core/resumenSin';
import { promedioPeriodo } from '@/core/facMensual';
import { PromedioPeriodoSection, periodoCompleto, usePeriodoProm } from './PromedioPeriodoSection';
import { serieMaterial, serieMatCentro, rfTieneCentro } from '@/core/resumenFac';
import { almacenesDeCondicion } from '@/core/inventoryRules';
import { sugFor, consFor, norm } from '../helpers';
import { useNombresStore, useVistaCentrosStore } from '@/store/nombresStore';
import { etiquetaCentro, etiquetaAlmacen } from '@/lib/nombres';
import { usePanelStore } from '@/store/panelStore';
import { MaterialNavControl, type OpcionMaterial } from './MaterialNavControl';
import { CostoTile } from './CostoMaterial';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import type { Panel } from '@/store/panelStore';
import type { Analytics } from '../AnalyticsContext';

/** Panel — Detalle por material+centro: inventario, desglose por almacén, tendencia y sugerencias/consumo en ese centro. */
export function CeldaPanel({ panel, a, push }: { panel: Extract<Panel, { type: 'celda' }>; a: Analytics; push: (p: Panel) => void }) {
  const { rss, bo, rf, result } = a;
  const nombresCentros = useNombresStore((s) => s.centros);
  const nombresAlm = useNombresStore((s) => s.almacenes);
  const mostrarNombres = useVistaCentrosStore((s) => s.mostrarNombres);
  const centroTxt = etiquetaCentro(panel.centro, nombresCentros, mostrarNombres);
  // Un solo periodo para todo el módulo (no por material): al navegar entre
  // materiales con las flechas se conserva el rango elegido.
  const { periodo: periodoProm, setPeriodo: setPeriodoProm, esDefault: periodoDefault } = usePeriodoProm(a);
  // Desde Inventario (Resumen Sin) el inventario de otros centros + Solicitar
  // viven en el panel lateral izquierdo (ver PanelHost).
  const inventarioEnLateral = panel.origen === 'resumenSin';
  const replaceTop = usePanelStore((s) => s.replaceTop);
  // Navegación entre materiales (solo desde Inventario): mismo centro, otro material.
  const opcionesNav = useMemo<OpcionMaterial[]>(() => (rss ? [...rss.mats.values()].map((m) => ({ material: m.material, desc: m.desc })) : []), [rss]);
  const nav = inventarioEnLateral ? (
    <div className="mb-3">
      <MaterialNavControl opciones={opcionesNav} material={panel.material} lista={panel.lista} irA={(m) => replaceTop({ ...panel, material: m })} />
    </div>
  ) : null;
  const condicionMat = a.invCondicion.find((r) => norm(r.material) === norm(panel.material))?.condicion || '';
  const almacenesAplicables = new Set(almacenesDeCondicion(condicionMat).map(norm));
  const sug = sugFor(bo, panel.material, panel.centro);
  const cons = consFor(result?.consumo ?? [], panel.material, panel.centro);

  const mo = rss?.mats.get(norm(panel.material));
  const co = mo?.centros.get(norm(panel.centro));

  // Modo degradado: sin Resumen Sin Sugerencias no hay pendiente/tránsito por
  // almacén, pero sí se puede reconstruir el desglose desde los lotes
  // (InvDetalle / lotes de corta caducidad) para no dejar el panel vacío.
  if (!rss || !co) {
    const lotesCelda = a.lotes.filter((l) => norm(l.material) === norm(panel.material) && norm(l.centro) === norm(panel.centro));
    if (!lotesCelda.length) {
      return (
        <div>
          {nav}
          <h2 className="font-display text-lg font-semibold">{panel.material} · Centro {centroTxt}</h2>
          <p className="mt-2 text-sm text-text-muted">Este material no tiene inventario ni registro en este centro.</p>
        </div>
      );
    }
    const porAlmacen = new Map<string, number>();
    for (const l of lotesCelda) porAlmacen.set(l.almacen, (porAlmacen.get(l.almacen) || 0) + l.cantidadDisp);
    const total = [...porAlmacen.values()].reduce((s, v) => s + v, 0);
    return (
      <div>
        {nav}
        <h2 className="font-display text-lg font-semibold">{panel.material} · Centro {centroTxt}</h2>
        <p className="mt-1 text-sm text-text-muted">{lotesCelda[0].textoBreve}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile label="Inv. (lotes)" value={formatNumber(total)} />
          <CostoTile a={a} material={panel.material} />
        </div>
        <PrecioCondicionBox a={a} material={panel.material} />
        <Section title="Desglose por almacén (desde lotes)">
          <div>
            <Table wrapperClassName="max-h-64 rounded-lg border border-border">
              <TableHeader><TableRow><TableHead>Almacén</TableHead><TableHead className="text-right">Disp.</TableHead></TableRow></TableHeader>
              <TableBody>
                {[...porAlmacen.entries()].sort(([x], [y]) => x.localeCompare(y)).map(([alm, v]) => (
                  <TableRow key={alm}>
                    <TableCell>{etiquetaAlmacen(alm, nombresAlm)}{almacenesAplicables.has(norm(alm)) && <StatePill label="aplica" cls="verde" />}</TableCell>
                    <TableCell className="text-right">{formatNumber(v)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
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
        {!inventarioEnLateral && <MaterialInventarioSection a={a} material={panel.material} />}
      </div>
    );
  }

  const alms = [...co.alm.values()].sort((x, y) => String(x.alm).localeCompare(String(y.alm)));
  const conPeriodo = !!a.facMensual && periodoCompleto(periodoProm);
  return (
    <div>
      {nav}
      <h2 className="font-display text-lg font-semibold">{panel.material} · Centro {centroTxt}</h2>
      <p className="mt-1 text-sm text-text-muted">{mo!.desc}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Inv. general" value={formatNumber(invGen(co))} />
        <StatTile label="Pendiente" value={formatNumber(co.pend)} tone="text-danger" />
        <StatTile label="En tránsito" value={formatNumber(co.transito)} tone="text-warning" />
        <StatTile label="Importe pend." value={formatCurrency(co.impPend)} />
        <CostoTile a={a} material={panel.material} />
      </div>
      <PrecioCondicionBox a={a} material={panel.material} />
      <PromedioPeriodoSection a={a} material={panel.material} centro={panel.centro} periodo={periodoProm} esDefault={periodoDefault} onChange={setPeriodoProm} />
      <Section title="Desglose por almacén">
        <div>
          <Table wrapperClassName="max-h-64 rounded-lg border border-border">
            <TableHeader>
              <TableRow>
                <TableHead>Almacén</TableHead><TableHead className="text-right">Inv.</TableHead><TableHead className="text-right">Pend.</TableHead><TableHead className="text-right">Tránsito</TableHead>
                {conPeriodo && <TableHead className="text-right" title={`Cantidad facturada ÷ meses de ${periodoProm.desde} a ${periodoProm.hasta} (Fac_Mensual_CAM), de este almacén.`}>Prom. mensual</TableHead>}
                {conPeriodo && <TableHead className="text-right" title="Inventario del almacén ÷ promedio del periodo.">Meses inv.</TableHead>}
                {conPeriodo && <TableHead title="Cobertura recalculada con el promedio del periodo.">Cobertura</TableHead>}
                <TableHead>Último</TableHead><TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {alms.map((al, i) => {
                const pp = conPeriodo ? promedioPeriodo(a.facMensual, { material: panel.material, centro: panel.centro, almacen: al.alm }, periodoProm.desde, periodoProm.hasta) : null;
                const mesesPp = pp && pp.promedio > 0 ? al.inv / pp.promedio : 0;
                const cob = pp ? coberturaEstado(mesesPp, pp.promedio, al.inv) : null;
                return (
                  <TableRow key={i}>
                    <TableCell>{etiquetaAlmacen(al.alm, nombresAlm)}{almacenesAplicables.has(norm(al.alm)) && <StatePill label="aplica" cls="verde" />}</TableCell>
                    <TableCell className="text-right">{formatNumber(al.inv)}</TableCell>
                    <TableCell className="text-right">{al.pend ? formatNumber(al.pend) : '—'}</TableCell>
                    <TableCell className="text-right">{al.transito ? formatNumber(al.transito) : '—'}</TableCell>
                    {pp && <TableCell className="text-right font-medium">{formatNumber(pp.promedio)}</TableCell>}
                    {pp && <TableCell className="text-right">{pp.promedio > 0 ? formatNumber(mesesPp) : '—'}</TableCell>}
                    {cob && <TableCell><StatePill label={COBERTURA_LABEL[cob]} cls={COBERTURA_CLS[cob]} /></TableCell>}
                    <TableCell>{al.ultMes || '—'}</TableCell>
                    <TableCell>{al.status ? <StatePill label={al.status} cls="amb" /> : '—'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Section>
      {(() => {
        const serieCentro = serieMatCentro(rf, panel.material, panel.centro);
        const usaCentro = serieCentro.length > 0;
        return (
          <Section title={usaCentro ? `Tendencia del material · Centro ${centroTxt}` : rfTieneCentro(rf) ? 'Tendencia del material (general — sin historia en este centro)' : 'Tendencia del material (general — los datos cargados de Resumen_Fac no traen la columna Centro: actualiza Resumen_Fac en vivo desde Carga)'}>
            <EvolChart serie={usaCentro ? serieCentro : serieMaterial(rf, panel.material)} height={180} />
          </Section>
        );
      })()}
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
      {!inventarioEnLateral && <MaterialInventarioSection a={a} material={panel.material} />}
    </div>
  );
}
