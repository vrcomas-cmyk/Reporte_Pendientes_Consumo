import { useMemo } from 'react';
import { KpiBand } from '@/components/layout/report';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { StatePill } from '../ui';
import { Section, SugTable, ConsumoTable, PrecioCondicionBox } from './_shared';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { invGen, coberturaEstado, COBERTURA_LABEL, COBERTURA_CLS } from '@/core/resumenSin';
import { detalle12Cerrados, ayudaPromedio12 } from '../promedio12';
import { PromedioPeriodoSection, periodoCompleto, usePeriodoProm } from './PromedioPeriodoSection';
import { almacenesDeCondicion } from '@/core/inventoryRules';
import { sugFor, consFor, norm } from '../helpers';
import { useNombresStore, useVistaCentrosStore } from '@/store/nombresStore';
import { etiquetaCentro, etiquetaAlmacen } from '@/lib/nombres';
import { usePanelStore } from '@/store/panelStore';
import { DetalleLayout, InventarioColumna, TabsSugConsumo, AccionTotalesMaterial, ConsumoCostoPrecios } from './DetalleLayout';
import { LotesOfertablesSection } from './OpcionesOferta';
import { MaterialNavControl, type OpcionMaterial } from './MaterialNavControl';
import { CentroNavControl } from './CentroNavControl';
import { TendenciaCentro } from './TendenciaCentro';
import { useCostoMetrica } from './CostoMaterial';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import type { Panel } from '@/store/panelStore';
import type { Analytics } from '../AnalyticsContext';

/** Panel — Detalle por material+centro: inventario, desglose por almacén, tendencia y sugerencias/consumo en ese centro. */
export function CeldaPanel({ panel, a, push }: { panel: Extract<Panel, { type: 'celda' }>; a: Analytics; push: (p: Panel) => void }) {
  const { rss, bo, result } = a;
  const nombresCentros = useNombresStore((s) => s.centros);
  const nombresAlm = useNombresStore((s) => s.almacenes);
  const mostrarNombres = useVistaCentrosStore((s) => s.mostrarNombres);
  const centroTxt = etiquetaCentro(panel.centro, nombresCentros, mostrarNombres);
  const costoMetrica = useCostoMetrica(a, panel.material);
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
  // Centros del material para ◀/▶ (← / →).
  const centrosMat = mo ? [...mo.centros.keys()].sort() : [];

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
        <KpiBand className="mt-3" titulo={`Material × centro ${centroTxt}`} principal={{ etiqueta: 'Inv. (lotes)', valor: formatNumber(total) }} metricas={costoMetrica} />
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
      </div>
    );
  }

  const alms = [...co.alm.values()].sort((x, y) => String(x.alm).localeCompare(String(y.alm)));
  // Prom./Meses inv./Cobertura de la tabla = SIEMPRE los 12 meses cerrados (misma cuenta que las
  // tarjetas del pedido); el periodo elegido solo afecta a la sección "Promedio por periodo".
  const conPeriodo = !!a.facMensual;
  const p12Centro = detalle12Cerrados(a, panel.material, panel.centro);
  const p12Alm = panel.almacen ? detalle12Cerrados(a, panel.material, panel.centro, panel.almacen) : null;
  const ventana12 = p12Centro.desde ? `${p12Centro.desde} a ${p12Centro.hasta}` : '12 meses cerrados';
  const periodoDifiere = !!a.facMensual && periodoCompleto(periodoProm) && !periodoDefault
    && (periodoProm.desde !== p12Centro.desde || periodoProm.hasta !== p12Centro.hasta);
  return (
    <DetalleLayout
      acciones={(
        <>
          <CentroNavControl centros={centrosMat} centro={panel.centro} irA={(c) => replaceTop({ ...panel, centro: c, almacen: undefined })} etiqueta={(c) => etiquetaCentro(c, nombresCentros, mostrarNombres)} />
          <AccionTotalesMaterial material={panel.material} push={push} />
        </>
      )}
      encabezado={(
        <>
        {nav}
        <h2 className="font-display text-lg font-semibold">{panel.material} · Centro {centroTxt}{panel.almacen ? ` / Alm ${etiquetaAlmacen(panel.almacen, nombresAlm)}` : ''}</h2>
        <p className="mt-1 text-sm text-text-muted">{mo!.desc}</p>
        </>
      )}
      datos={[
        { etiqueta: 'Condición', valor: condicionMat },
        { etiqueta: 'Sector', valor: a.enrich.matSector(panel.material) },
        { etiqueta: 'Grupo art.', valor: a.enrich.matGrupo(panel.material) },
        { etiqueta: 'Clase ABC', valor: a.abc.classByMaterial.get(norm(panel.material)) || '' },
      ]}
      banda={(
        <KpiBand
          className="mt-3"
          titulo={`Material × centro ${centroTxt}`}
          principal={{ etiqueta: 'Inv. general', valor: formatNumber(invGen(co)) }}
          distribuir
          metricas={[
            { etiqueta: 'Pendiente', valor: formatNumber(co.pend), tono: co.pend > 0 ? 'danger' : undefined },
            { etiqueta: 'En tránsito', valor: formatNumber(co.transito), tono: co.transito > 0 ? 'success' : undefined },
            { etiqueta: 'Importe pend.', valor: formatCurrency(co.impPend) },
            { etiqueta: 'Prom. 12m cerrados', valor: formatNumber(p12Centro.promedio), sub: p12Centro.desde ? `${p12Centro.desde} – ${p12Centro.hasta}` : `Centro ${centroTxt}`, title: ayudaPromedio12(p12Centro) },
            ...(p12Alm ? [{ etiqueta: `Prom. 12m · Alm ${etiquetaAlmacen(panel.almacen!, nombresAlm)}`, valor: formatNumber(p12Alm.promedio), sub: p12Alm.desde ? `${p12Alm.desde} – ${p12Alm.hasta}` : `Centro ${centroTxt}`, title: ayudaPromedio12(p12Alm) }] : []),
            ...costoMetrica,
          ]}
        />
      )}
      izquierda={<InventarioColumna sinPrincipales a={a} material={panel.material} centro={panel.centro} push={push} />}
      centro={(
        <>
        <ConsumoCostoPrecios a={a} material={panel.material} />
        <Section ancho tono="inv" origen="Disponibilidad" title="Desglose por almacén">
          <div>
            <Table wrapperClassName="max-h-64 rounded-lg border border-border">
              <TableHeader>
                <TableRow>
                  <TableHead>Almacén</TableHead><TableHead className="text-right">Inv.</TableHead><TableHead className="text-right">Pend.</TableHead><TableHead className="text-right">Tránsito</TableHead>
                  {conPeriodo && <TableHead className="text-right" title={`Cantidad facturada de ${ventana12} (12 meses cerrados, Fac_Mensual_CAM) ÷ 12, de este almacén.`}>Prom. mensual</TableHead>}
                  {conPeriodo && <TableHead className="text-right" title="Inventario del almacén ÷ promedio de 12 meses cerrados.">Meses inv.</TableHead>}
                  {conPeriodo && <TableHead title="Cobertura recalculada con el promedio de 12 meses cerrados.">Cobertura</TableHead>}
                  <TableHead>Último</TableHead><TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alms.map((al, i) => {
                  const pp = conPeriodo ? detalle12Cerrados(a, panel.material, panel.centro, al.alm) : null;
                  const mesesPp = pp && pp.promedio > 0 ? al.inv / pp.promedio : 0;
                  const cob = pp ? coberturaEstado(mesesPp, pp.promedio, al.inv) : null;
                  return (
                    <TableRow key={i} className={`cursor-pointer ${norm(al.alm) === norm(panel.almacen) ? 'bg-accent-soft' : ''}`} title="Clic para ver la tendencia de este almacén" onClick={() => replaceTop({ ...panel, almacen: norm(al.alm) === norm(panel.almacen) ? undefined : al.alm })}>
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
        <TendenciaCentro a={a} material={panel.material} centro={panel.centro} almacen={panel.almacen} centroTxt={centroTxt} almTxt={panel.almacen ? etiquetaAlmacen(panel.almacen, nombresAlm) : undefined} push={push} onVerCentro={() => replaceTop({ ...panel, almacen: undefined })} />
        {periodoDifiere && (
          <p className="mt-2 rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-text-muted">
            “Promedio por periodo” usa el periodo elegido ({periodoProm.desde} a {periodoProm.hasta}); las tarjetas “Prom. 12m” y la tabla de almacenes usan los 12 meses cerrados ({p12Centro.desde} a {p12Centro.hasta}).{' '}
            <button type="button" className="text-accent hover:underline" onClick={() => setPeriodoProm({ desde: '', hasta: '' })}>Usar 12 meses cerrados</button>
          </p>
        )}
        <PromedioPeriodoSection a={a} material={panel.material} centro={panel.centro} periodo={periodoProm} esDefault={periodoDefault} onChange={setPeriodoProm} />
        </>
      )}
      abajo={(
        <>
          <LotesOfertablesSection a={a} material={panel.material} centroPedido={panel.centro} push={push} />
          <TabsSugConsumo sug={sug} cons={cons} a={a} push={push} titulo="Sugerencias / Consumo en este centro" />
        <div className="mt-3">
          <Button variant="outline" size="sm" onClick={() => push({ type: 'materialTotales', material: panel.material })}>Ver totales del material</Button>
        </div>
        </>
      )}
    />
  );
}
