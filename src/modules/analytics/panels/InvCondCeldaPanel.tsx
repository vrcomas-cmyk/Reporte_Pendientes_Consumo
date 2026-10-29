import { useMemo } from 'react';
import { KpiBand } from '@/components/layout/report';
import { useRssFuenteStore } from '@/store/rssFuenteStore';
import type { DetalleLotesCondicion } from '@/core/invCondicionLibros';
import { Button } from '@/components/ui/button';
import { StatePill } from '../ui';
import { Section, vigenciaTxt } from './_shared';
import { CentroNavControl } from './CentroNavControl';
import { DetalleLayout, InventarioColumna, HistorialConsumo, TabsSugConsumo, AccionTotalesMaterial } from './DetalleLayout';
import { LotesOfertablesSection } from './OpcionesOferta';
import { MaterialNavControl, type OpcionMaterial } from './MaterialNavControl';
import { useCostoMetrica } from './CostoMaterial';
import { usePanelStore } from '@/store/panelStore';
import { formatNumber, formatCurrency, formatFechaCaducidad } from '@/lib/utils';
import { almacenesDeCondicion } from '@/core/inventoryRules';
import { pendSegunAmbito, transitoPorCondicion, impPendPorCondicion, coberturaEstado, COBERTURA_LABEL, COBERTURA_CLS, type RSSAlmacen } from '@/core/resumenSin';
import { detalle12Cerrados } from '../promedio12';
import { PromedioPeriodoSection, periodoCompleto, usePeriodoProm } from './PromedioPeriodoSection';
import { serieMaterial, serieMatCentro, rfTieneCentro } from '@/core/resumenFac';
import { norm, sugFor, consFor } from '../helpers';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { buildFromInvDetalle, buildFromResumenSin } from '@/services/solicitudService';
import { useSolicitarDialog } from '@/modules/solicitudes/useSolicitarDialog';
import { SolicitarDialog } from '@/modules/solicitudes/SolicitarDialog';
import { SolicitarContextMenu } from '@/modules/solicitudes/SolicitarContextMenu';
import { useSolicitudStore } from '@/store/solicitudStore';
import type { InvDetalleRow } from '@/core/types';
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
  const costoMetrica = useCostoMetrica(a, panel.material);
  // Un material puede tener varias condiciones (Inv con Condición): se usa la de la fila desde la que se abrió.
  const filaCond = a.invCondicion.find((r) => norm(r.material) === norm(panel.material) && (!panel.condicion || r.condicion === panel.condicion));
  const condicionMat = filaCond?.condicion || '';
  const condicionesMaterial = useMemo(() => [...new Set(a.invCondicion.filter((r) => norm(r.material) === norm(panel.material)).map((r) => r.condicion))], [a.invCondicion, panel.material]);
  // Inv con Condición (libros): el inventario de la fila ya es la regla del módulo (p. ej. corta caducidad = suma de los lotes
  // en cualquier almacén), así que el panel muestra ESE mismo valor en vez de recalcularlo por almacenes "aplicables".
  const deLibros = useRssFuenteStore((s) => s.fuente) === 'libros';
  // Condiciones distintas de Corta caducidad que traen lotes propios (PNC): se muestran sus lotes con las columnas de su hoja.
  const detalleCond = deLibros ? a.detalleLotesLibros[condicionMat] : undefined;
  const almacenesAplicables = new Set(almacenesDeCondicion(condicionMat).map(norm));
  const lotesMaterial = useMemo(() => a.lotes.filter((l) => norm(l.material) === norm(panel.material)), [a.lotes, panel.material]);
  // Sin lotes en 0: no aportan nada y ensucian la tabla.
  const lotes = useMemo(() => lotesMaterial.filter((l) => norm(l.centro) === norm(panel.centro) && l.cantidadDisp > 0), [lotesMaterial, panel.centro]);
  // Centro 1031 (no es columna por centro): su inventario es "Disp 31·30" / "Disp 31·32" de la fila (PNC: todo el 1031 va a Disp 31·32).
  const invDe1031 = filaCond ? (panel.almacen === '1030' ? filaCond.disponible31_30 : panel.almacen === '1032' ? filaCond.disponible31_32 : (filaCond.disponible31_30 || 0) + (filaCond.disponible31_32 || 0)) : 0;
  const totalAplica = deLibros && filaCond
    ? (panel.centro === '1031' ? invDe1031 : filaCond.invByCenter[panel.centro] ?? 0)
    : lotes.filter((l) => almacenesAplicables.has(norm(l.almacen))).reduce((s, l) => s + l.cantidadDisp, 0);
  const totalTodos = lotes.reduce((s, l) => s + l.cantidadDisp, 0);
  const desc = lotes[0]?.textoBreve || a.rss?.mats.get(norm(panel.material))?.desc || '';

  const mo = a.rss?.mats.get(norm(panel.material));
  const co = mo?.centros.get(norm(panel.centro));
  // Mismo alcance que eligió la tabla de Inv con Condición (por condición / todo el centro): así el detalle cuadra con el «Pend» de la celda.
  const ambitoPend = useRssFuenteStore((s) => s.ambitoPend);
  const pend = pendSegunAmbito(co, condicionMat, ambitoPend);
  const transito = transitoPorCondicion(co, condicionMat);
  const impPend = impPendPorCondicion(co, condicionMat);
  // Pedidos pendientes (Seg pedidos, según el modo de bloqueo de Inventario) del centro: solo los almacenes que aplican a la condición, o todos si la tabla está en «Pend. todo el centro».
  const sug = sugFor(a.bo, panel.material, panel.centro).filter((it) => ambitoPend === 'centro' || almacenesAplicables.has(norm(it.bo.almacen)));
  const cons = consFor(a.result?.consumo ?? [], panel.material, panel.centro);
  // Un almacén aplicable se muestra en cuanto tenga CUALQUIER dato — no solo
  // cuando Resumen Sin Sugerencias trae una fila propia para él (p.ej. 1060
  // puede no tener pendiente/tránsito reportado ahí y aun así tener
  // inventario, leído de `co.invAlm`, el mismo total por almacén que ya usa
  // `invPorCondicion`) — antes se ocultaba silenciosamente en ese caso.
  const almsAplicables: RSSAlmacen[] = co
    ? [...new Set([...almacenesDeCondicion(condicionMat), ...(ambitoPend === 'centro' ? [...co.alm.values()].filter((al) => al.pend > 0).map((al) => al.alm) : [])])]
        .map((alm): RSSAlmacen => co.alm.get(alm) ?? {
          alm, inv: co.invAlm[alm] || 0, pend: 0, transito: 0, impPend: 0, prom: 0,
          ultMes: '', cantUlt: 0, penMes: '', cantPen: 0, meses: 0, status: '', fuente: '',
        })
        .filter((al) => al.inv > 0 || al.pend > 0 || al.transito > 0)
        .sort((x, y) => String(x.alm).localeCompare(String(y.alm)))
    : [];

  const serieCentro = serieMatCentro(a.rf, panel.material, panel.centro);
  const usaCentro = serieCentro.length > 0;

  const { periodo: periodoProm, setPeriodo: setPeriodoProm, esDefault: periodoDefault } = usePeriodoProm(a);
  // Tabla de almacenes = siempre los 12 meses cerrados (misma cuenta que el detalle de pedido); el periodo elegido solo afecta a "Promedio por periodo".
  const conPeriodo = !!a.facMensual;
  const p12 = detalle12Cerrados(a, panel.material, panel.centro);
  const periodoDifiere = !!a.facMensual && periodoCompleto(periodoProm) && !periodoDefault && (periodoProm.desde !== p12.desde || periodoProm.hasta !== p12.hasta);

  const replaceTop = usePanelStore((s) => s.replaceTop);
  // Materiales a los que se puede saltar con el buscador: los de Inv Condición.
  const opcionesNav = useMemo<OpcionMaterial[]>(() => {
    const m = new Map<string, OpcionMaterial>();
    for (const r of a.invCondicion) if (!m.has(norm(r.material))) m.set(norm(r.material), { material: r.material, desc: r.textoBreve });
    return [...m.values()];
  }, [a.invCondicion]);
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

  return (
    <>
    <DetalleLayout
      acciones={(
        <>
          <CentroNavControl centros={mo ? [...mo.centros.keys()].sort() : []} centro={panel.centro} irA={(c) => replaceTop({ ...panel, centro: c, almacen: undefined })} />
          <AccionTotalesMaterial material={panel.material} push={push} />
        </>
      )}
      encabezado={(
        <>
        <div className="mb-3">
          <MaterialNavControl opciones={opcionesNav} material={panel.material} lista={panel.lista} irA={(m) => replaceTop({ ...panel, material: m })} />
        </div>
        <h2 className="font-display text-lg font-semibold">{panel.material} · Centro {panel.centro}{panel.almacen ? ` · Disp 31·${panel.almacen.slice(2)}` : ''}</h2>
        <p className="mt-1 text-sm text-text-muted">{desc} · Condición: {condicionMat || '—'}</p>
        {condicionesMaterial.length > 1 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs" role="group" aria-label="Condición del material">
            <span className="text-text-faint">Ver como condición:</span>
            {condicionesMaterial.map((cn) => (
              <button key={cn} type="button" aria-pressed={cn === condicionMat} onClick={() => replaceTop({ ...panel, condicion: cn })} className={cn === condicionMat ? 'rounded-full border border-accent bg-accent-soft px-2.5 py-0.5 font-medium text-accent' : 'rounded-full border border-border px-2.5 py-0.5 text-text-muted hover:border-accent/50'}>{cn || 'Sin condición'}</button>
            ))}
          </div>
        )}
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
          titulo={`Material × centro ${panel.centro}`}
            distribuir
          principal={{ etiqueta: 'Inv. según condición', valor: formatNumber(totalAplica), sub: `${formatNumber(totalTodos)} en todos los almacenes` }}
          metricas={[
            { etiqueta: 'Pendiente', valor: formatNumber(pend), tono: pend > 0 ? 'danger' : undefined },
            { etiqueta: 'En tránsito', valor: formatNumber(transito), tono: transito > 0 ? 'success' : undefined },
            { etiqueta: 'Importe pend.', valor: formatCurrency(impPend) },
            { etiqueta: 'Lotes', valor: formatNumber(lotes.length) },
            ...costoMetrica,
          ]}
        />
      )}
      izquierda={<InventarioColumna sinPrincipales a={a} material={panel.material} centro={panel.centro} abrirCelda={(c) => replaceTop({ ...panel, centro: c, almacen: undefined })} />}
      centro={(
        <>
          <Section ancho tono="inv" origen="Inv_Condicion" title="Desglose por almacén (según condición)">
            <p className="mb-2 text-xs text-text-faint">Clic derecho en una fila = Solicitar / Copiar.</p>
            {almsAplicables.length === 0 ? (
              <p className="text-sm text-text-muted">Sin inventario, pendiente ni tránsito en los almacenes aplicables a esta condición en este centro.</p>
            ) : (
              <div>
                <Table wrapperClassName="max-h-64 rounded-lg border border-border">
                  <TableHeader><TableRow><TableHead>Almacén</TableHead><TableHead className="text-right">Inv.</TableHead><TableHead className="text-right">Pend.</TableHead><TableHead className="text-right">Tránsito</TableHead>{conPeriodo && <TableHead className="text-right" title={`Cantidad facturada de ${p12.desde} a ${p12.hasta} (12 meses cerrados, Fac_Mensual_CAM) ÷ 12, de este almacén.`}>Prom. mensual</TableHead>}{conPeriodo && <TableHead className="text-right" title="Inventario del almacén ÷ promedio de 12 meses cerrados.">Meses inv.</TableHead>}{conPeriodo && <TableHead>Cobertura</TableHead>}<TableHead>Último</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {almsAplicables.map((al, i) => {
                      const pp = conPeriodo ? detalle12Cerrados(a, panel.material, panel.centro, al.alm) : null;
                      const mesesPp = pp && pp.promedio > 0 ? al.inv / pp.promedio : 0;
                      const cob = pp ? coberturaEstado(mesesPp, pp.promedio, al.inv) : null;
                      return (
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
                          {pp && <TableCell className="text-right font-medium">{formatNumber(pp.promedio)}</TableCell>}
                          {pp && <TableCell className="text-right">{pp.promedio > 0 ? formatNumber(mesesPp) : '—'}</TableCell>}
                          {cob && <TableCell><StatePill label={COBERTURA_LABEL[cob]} cls={COBERTURA_CLS[cob]} /></TableCell>}
                          <TableCell>{al.ultMes || '—'}</TableCell>
                          <TableCell>{al.status ? <StatePill label={al.status} cls="amb" /> : '—'}</TableCell>
                        </TableRow>
                      </SolicitarContextMenu>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </Section>
        <HistorialConsumo
          a={a}
          costosMaterial={panel.material}
          serie={usaCentro ? serieCentro : serieMaterial(a.rf, panel.material)}
          titulo={usaCentro ? `Historial de facturación · Centro ${panel.centro}` : rfTieneCentro(a.rf) ? 'Historial de facturación (general — sin historia en este centro)' : a.rf ? 'Historial de facturación (general — el Resumen_Fac cargado no trae la columna Centro: sincroniza Facturación desde Carga)' : 'Historial de facturación (sin facturación cargada: sincroniza Facturación desde Carga)'}
          onMonth={(mes) => push({ type: 'clientesMes', material: panel.material, mes, ...(usaCentro ? { centro: panel.centro } : {}) })}
        />
        {periodoDifiere && (
          <p className="mt-2 rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-text-muted">
            “Promedio por periodo” usa el periodo elegido ({periodoProm.desde} a {periodoProm.hasta}); la tabla de almacenes usa los 12 meses cerrados ({p12.desde} a {p12.hasta}).{' '}
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
          {detalleCond && <LotesCondicionSection condicion={condicionMat} detalle={detalleCond} material={panel.material} centro={panel.centro} />}
          {!detalleCond && <Section ancho title="Detalle de lotes (InvDetalle)">
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
                            <TableCell className="whitespace-nowrap text-xs">
                              {formatFechaCaducidad(l.fechaCaducidad)}
                              {(() => { const vg = vigenciaTxt(l.fechaCaducidad || ''); return vg && <div className="text-[11px]"><StatePill label={vg.txt} cls={vg.cls} /></div>; })()}
                            </TableCell>
                          </TableRow>
                        </SolicitarContextMenu>
                      ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Section>}
          <div className="mt-3">
            <Button variant="outline" size="sm" onClick={() => push({ type: 'materialTotales', material: panel.material })}>Ver totales del material</Button>
          </div>
        </>
      )}
    />
      <SolicitarDialog draft={solicitar.dialogDraft} loteOptions={solicitar.dialogLoteOptions} onClose={solicitar.cerrar} />
    </>
  );
}


/** Lotes de una condición con lotes propios (p. ej. PNC), con las columnas tal como las trae su hoja, del material y centro vistos. */
function LotesCondicionSection({ condicion, detalle, material, centro }: { condicion: string; detalle: DetalleLotesCondicion; material: string; centro: string }) {
  const filas = detalle.filas.filter((f) => norm(f.material) === norm(material) && norm(f.centro) === norm(centro));
  const iCant = detalle.columnas.indexOf('Cantidad');
  const total = iCant === -1 ? null : filas.reduce((s, f) => s + (Number(String(f.celdas[iCant] ?? '').replace(/[^0-9.-]/g, '')) || 0), 0);
  return (
    <Section ancho title={`Lotes de ${condicion} (${filas.length})`}>
      {filas.length === 0 ? (
        <p className="text-sm text-text-muted">Sin lotes de {condicion} para este material y centro.</p>
      ) : (
        <>
          <Table wrapperClassName="max-h-96 rounded-lg border border-border">
            <TableHeader>
              <TableRow>{detalle.columnas.map((c) => <TableHead key={c} className="whitespace-nowrap">{c}</TableHead>)}</TableRow>
            </TableHeader>
            <TableBody>
              {filas.map((f, i) => (
                <TableRow key={i}>
                  {f.celdas.map((v, j) => <TableCell key={j} className="whitespace-nowrap text-xs">{v || '—'}</TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {total !== null && <p className="mt-1 text-xs text-text-muted">Cantidad total: {formatNumber(total)}</p>}
        </>
      )}
    </Section>
  );
}
