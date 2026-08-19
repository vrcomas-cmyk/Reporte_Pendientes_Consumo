import { useMemo } from 'react';
import { Download } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { EvolChart, TrendBadge, StatTile } from '@/modules/analytics/ui';
import { SugTable, ConsumoTable, LotesTable, PrecioCondicionBox } from '@/modules/analytics/panels/_shared';
import { formatNumber } from '@/lib/utils';
import { exportXlsx, stamp } from '@/lib/exportXlsx';
import { serieMaterial, tendenciaTexto } from '@/core/resumenFac';
import { sugFor, consFor, norm } from '@/modules/analytics/helpers';
import { rankClientes } from '@/core/scoring';
import { condicionEfectivaMaterial, condicionTextoEfectivo, materialesRelacionados } from '@/core/oportunidad';
import { destinatariosParaMaterial, type ContextoMaterial } from '@/core/matchingOfertas';
import { HubLinks } from '../components/HubLinks';
import { ScoreBar } from '../components/ScoreBar';
import { ScoreExplain } from '../components/ScoreExplain';
import { useConocimientoStore } from '@/store/conocimientoStore';
import { useScoringWeightsStore } from '@/store/scoringWeightsStore';
import { usePermissionsStore } from '@/store/permissionsStore';
import { isColumnHidden, isDetailHidden } from '@/core/permissions';
import { usePanelStore } from '@/store/panelStore';
import type { Panel, MaterialHubTab } from '@/store/panelStore';
import type { Analytics } from '@/modules/analytics/AnalyticsContext';

function diasHasta(fecha: string | null): number | null {
  if (!fecha) return null;
  const d = new Date(fecha);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0); d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / 86400000);
}

const TABS: { key: MaterialHubTab; label: string }[] = [
  { key: 'resumen', label: 'Resumen' }, { key: 'inventario', label: 'Inventario' },
  { key: 'pedidos', label: 'Pedidos' }, { key: 'consumo', label: 'Consumo' },
  { key: 'ventas', label: 'Ventas' }, { key: 'notas', label: 'Notas' },
  { key: 'historial', label: 'Historial' }, { key: 'compatibilidad', label: 'Compatibilidad' },
  { key: 'ofrecer', label: 'A quién ofrecer' },
];

/** Vista 360 de un material (req. 6): inventario, pedidos, consumo, ventas,
 * clientes compatibles e historial en un solo panel lateral con pestañas
 * (req. 7) — nunca un modal ni un cambio de página. Todo dato viene de
 * `useAnalytics()` en solo lectura; nada se copia ni se recalcula aparte. */
export function MaterialHubPanel({ panel, a }: { panel: Extract<Panel, { type: 'materialHub' }>; a: Analytics }) {
  const mat = panel.material;
  const push = usePanelStore((s) => s.push);
  const replaceTop = usePanelStore((s) => s.replaceTop);
  const { bo, enrich, lotes, rf, result, abc } = a;
  // Memoizados: sin esto, cada uno era un `.filter()` NUEVO en cada render —
  // referencia distinta aunque el contenido fuera igual. Inofensivo en un
  // componente hoja, pero al alimentar `rankClientes` (que a su vez crea
  // arrays nuevos) dentro de un panel que además re-renderiza por cada
  // notificación de conocimientoStore, generaba el patrón exacto de "render
  // en cascada" que terminó en Maximum update depth exceeded al cambiar de
  // tab (bug real, corregido junto con el mal uso de push() abajo).
  const lotesF = useMemo(() => lotes.filter((l) => norm(l.material) === norm(mat)), [lotes, mat]);
  const totalUni = useMemo(() => lotesF.reduce((s, l) => s + l.cantidadDisp, 0), [lotesF]);
  const sug = useMemo(() => sugFor(bo, mat), [bo, mat]);
  const cons = useMemo(() => consFor(result?.consumo ?? [], mat), [result, mat]);
  const serie = useMemo(() => serieMaterial(rf, mat), [rf, mat]);
  const oportunidades = useConocimientoStore((s) => s.oportunidades);
  const fichas = useConocimientoStore((s) => s.clientes);
  const clientesByDest = useConocimientoStore((s) => s.clientesByDest);
  const ofertas = useConocimientoStore((s) => s.ofertas);
  const ofertasMaterial = useMemo(() => ofertas.filter((o) => norm(o.material) === norm(mat)), [ofertas, mat]);
  const oportunidadAbierta = useMemo(
    () => oportunidades.find((o) => norm(o.material) === norm(mat) && (!panel.lote || norm(o.lote ?? '') === norm(panel.lote))),
    [oportunidades, mat, panel.lote],
  );

  // El lote EXACTO que trajo `panel.lote` (p. ej. al entrar desde una
  // Oportunidad o una Card con lote propio) — antes, sin Oportunidad
  // abierta, la caducidad/precio de referencia caían en `lotesF[0]`
  // (el primero de la lista, arbitrario), ignorando `panel.lote` casi
  // siempre. Sin `panel.lote`, se mantiene el mismo fallback de antes.
  const loteReal = useMemo(
    () => (panel.lote ? lotesF.find((l) => norm(l.lote) === norm(panel.lote)) : undefined),
    [lotesF, panel.lote],
  );

  // Condición/caducidad/precio de referencia para el score: prioriza la
  // Oportunidad abierta (datos reales del lote); si no hay pero sí un lote
  // concreto (`loteReal`), usa el suyo; si no hay ninguno de los dos, cae a
  // la condición efectiva del material — Fuentes de Pedidos primero, Inv
  // Condición como respaldo (ver `condicionEfectivaMaterial`).
  const condicion = oportunidadAbierta?.condicion ?? condicionEfectivaMaterial(mat, sug, a.invCondicion);
  const diasVigencia = oportunidadAbierta
    ? diasHasta(oportunidadAbierta.fechaCaducidad)
    : diasHasta(loteReal?.fechaCaducidad ?? lotesF[0]?.fechaCaducidad ?? null);
  const precioOferta = oportunidadAbierta?.precioOferta || loteReal?.precioOferta || enrich.matPrecioOferta(mat);
  const precioLista = enrich.matPrecioOferta(mat);
  const pesos = useScoringWeightsStore((s) => s.pesos);
  const perms = usePermissionsStore((s) => s.perms);
  const scoreExplainOculto = isDetailHidden(perms, 'oportunidades', 'scoreExplain');
  const precioOcultoEnLista = isColumnHidden(perms, 'oportunidades', 'precio');

  const ranking = useMemo(
    () => rankClientes(mat, { consumo: result?.consumo ?? [], rf, bo, abc, condicion, diasVigencia, precioOferta, precioLista, clientesByDest, ofertas, pesos }),
    [mat, result, rf, bo, abc, condicion, diasVigencia, precioOferta, precioLista, clientesByDest, ofertas, pesos],
  );
  const aceptados = useMemo(() => ranking.filter((r) => r.bloqueantes.length === 0), [ranking]);
  const descartados = useMemo(() => ranking.filter((r) => r.bloqueantes.length > 0), [ranking]);
  const relacionados = useMemo(() => materialesRelacionados(rf, mat, 8), [rf, mat]);

  // Contexto real del lote para el matching de "A quién ofrecer": misma
  // condición/vigencia ya resueltas arriba para el score, reescritas al
  // vocabulario del motor de reglas (días restantes de vigencia).
  const reglas = useConocimientoStore((s) => s.reglas);
  const condicionTexto = useMemo(() => condicionTextoEfectivo(mat, sug, a.invCondicion), [mat, sug, a.invCondicion]);
  const ctxOfrecer: ContextoMaterial = useMemo(() => ({
    condicion, condicionTexto, diasCaducidad: diasVigencia, danado: condicion === 'danado',
  }), [condicion, condicionTexto, diasVigencia]);
  const razonSocialDe = useMemo(() => {
    const m = new Map<string, string>();
    cons.forEach((r) => { if (!m.has(norm(r.destinatario))) m.set(norm(r.destinatario), r.razonSocial); });
    return m;
  }, [cons]);
  const consumoDe = useMemo(() => {
    const m = new Map<string, number>();
    cons.forEach((r) => m.set(norm(r.destinatario), (m.get(norm(r.destinatario)) ?? 0) + r.consumoActual));
    return m;
  }, [cons]);
  const matches = useMemo(
    () => destinatariosParaMaterial(fichas, reglas, mat, ctxOfrecer, {
      razonSocialDe: (d) => clientesByDest.get(d)?.razonSocial || razonSocialDe.get(d) || d,
      consumoDe: (d) => consumoDe.get(d) ?? 0,
    }),
    [fichas, reglas, mat, ctxOfrecer, clientesByDest, razonSocialDe, consumoDe],
  );
  const matchesAceptan = useMemo(() => matches.filter((m) => m.evaluacion.acepta), [matches]);

  function exportarCompatibles() {
    void exportXlsx(`oportunidad_${mat}_${stamp()}.xlsx`, aceptados.map((r) => ({
      Cliente: r.razonSocial || r.dest,
      Destinatario: r.dest,
      Score: r.score,
      Nivel: r.nivel,
      ...(precioOcultoEnLista ? {} : { 'Precio oferta': precioOferta }),
    })), 'Clientes compatibles');
  }

  return (
    <div>
      <h2 className="font-display text-lg font-semibold">{mat}</h2>
      <p className="mt-1 text-sm text-text-muted">{enrich.matTexto(mat) || 'Sin descripción'} · {lotesF.length} lote(s) · {formatNumber(totalUni)} unidades</p>
      <div className="mt-3"><HubLinks material={mat} /></div>

      <Tabs defaultValue={panel.tab ?? 'resumen'} onValueChange={(v) => replaceTop({ ...panel, tab: v as MaterialHubTab })} className="mt-4">
        <TabsList>
          {TABS.map((t) => <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>)}
        </TabsList>

        <TabsContent value="resumen">
          <div className="flex flex-wrap gap-2">
            <StatTile label="Inventario" value={formatNumber(totalUni)} />
            <StatTile label="Sugerencias" value={String(sug.length)} />
            <StatTile label="Consumo (clientes)" value={String(cons.length)} />
            {oportunidadAbierta && <StatTile label="Oportunidad" value={oportunidadAbierta.estado} />}
            <StatTile label="Destinatarios que aceptan" value={String(matchesAceptan.length)} tone={matchesAceptan.length === 0 ? 'text-danger' : undefined} />
          </div>
          <PrecioCondicionBox a={a} material={mat} />
        </TabsContent>

        <TabsContent value="inventario">
          {lotesF.length > 0 ? <LotesTable lotes={lotesF} a={a} material={mat} /> : <p className="text-sm text-text-muted">Sin lotes registrados.</p>}
        </TabsContent>

        <TabsContent value="pedidos">
          <SugTable list={sug} a={a} push={push} />
        </TabsContent>

        <TabsContent value="consumo">
          <ConsumoTable list={cons} a={a} push={push} />
        </TabsContent>

        <TabsContent value="ventas">
          <div className="mb-2"><TrendBadge t={tendenciaTexto(serie)} /></div>
          <EvolChart serie={serie} onMonth={(mes) => push({ type: 'clientesMes', material: mat, mes })} />
        </TabsContent>

        <TabsContent value="notas">
          <NotasMaterial material={mat} push={push} />
        </TabsContent>

        <TabsContent value="historial">
          {ofertasMaterial.length === 0 ? (
            <p className="text-sm text-text-muted">Sin ofertas registradas para este material todavía. Se registran desde la pestaña Compatibilidad, botón "Ofertar".</p>
          ) : (
            <div className="flex flex-col gap-2">
              {ofertasMaterial.map((o) => (
                <div key={o.id} className="rounded-lg border border-border bg-bg-elevated p-2.5 text-sm">
                  <div className="flex items-center justify-between">
                    <button className="font-medium text-accent hover:underline" onClick={() => push({ type: 'clienteConocimiento', dest: o.dest, razonSocial: o.razonSocial })}>{o.razonSocial || o.dest}</button>
                    <span className="text-xs text-text-faint">{new Date(o.fechaOferta).toLocaleDateString('es-MX')}</span>
                  </div>
                  <p className="mt-0.5 text-text-muted">{o.cantidadOfertada} unid. a ${o.precioOfertado} · {o.resultado}</p>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="compatibilidad">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text">Clientes compatibles ({aceptados.length})</h3>
            <Button size="sm" variant="outline" onClick={exportarCompatibles} disabled={aceptados.length === 0}>
              <Download className="size-3.5" /> Exportar
            </Button>
          </div>
          {ranking.length === 0 && <p className="text-sm text-text-muted">Sin clientes candidatos: este material no tiene consumo, facturación ni pedidos abiertos registrados.</p>}
          <div className="flex flex-col gap-2">
            {aceptados.slice(0, 25).map((r) => (
              <div key={r.dest} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-bg-elevated p-2.5">
                <div className="min-w-0 flex-1">
                  <button className="truncate text-left text-sm font-medium text-text hover:text-accent" onClick={() => push({ type: 'clienteDetalle', dest: r.dest })}>{r.razonSocial || r.dest}</button>
                  <div className="mt-0.5 flex items-center gap-2">
                    {!scoreExplainOculto && <ScoreExplain result={r} />}
                    <button className="text-xs text-text-muted hover:text-text" onClick={() => push({ type: 'clienteConocimiento', dest: r.dest, razonSocial: r.razonSocial, tab: 'ficha' })}>Ficha</button>
                    <button className="text-xs text-accent hover:underline" onClick={() => push({ type: 'clienteConocimiento', dest: r.dest, razonSocial: r.razonSocial, tab: 'ofertas', prefillMaterial: mat, prefillOportunidadId: oportunidadAbierta?.id })}>Ofertar</button>
                  </div>
                </div>
                <ScoreBar score={r.score} nivel={r.nivel} />
              </div>
            ))}
          </div>
          {descartados.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-semibold text-text-muted hover:text-text">Descartados ({descartados.length})</summary>
              <div className="mt-2 flex flex-col gap-2">
                {descartados.map((r) => (
                  <div key={r.dest} className="rounded-lg border border-dashed border-border p-2.5">
                    <p className="text-sm font-medium text-text-muted">{r.razonSocial || r.dest}</p>
                    <p className="mt-0.5 text-xs text-danger">{r.bloqueantes.join(' · ')}</p>
                  </div>
                ))}
              </div>
            </details>
          )}
        </TabsContent>
        <TabsContent value="ofrecer">
          <p className="mb-2 text-xs text-text-muted">
            Clientes con ficha (qué aceptan) o con una excepción por material, evaluados contra
            {oportunidadAbierta ? ' la Oportunidad abierta de este lote' : loteReal ? ` el lote ${loteReal.lote}` : ' la condición general del material (sin un lote específico)'}
            {' '}— sin salir de este panel.
          </p>
          {matches.length === 0 && (
            <p className="text-sm text-text-muted">Ningún cliente tiene ficha ni excepción por material configurada todavía. Crea o edita fichas en la pestaña Clientes de Oportunidades.</p>
          )}
          <div className="flex flex-col gap-2">
            {matches.map((m) => (
              <div key={m.dest} className={`flex items-center justify-between gap-3 rounded-lg border p-2.5 ${m.evaluacion.acepta ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-border border-dashed'}`}>
                <div className="min-w-0 flex-1">
                  <button className="truncate text-left text-sm font-medium text-text hover:text-accent" onClick={() => push({ type: 'clienteDetalle', dest: m.dest })}>{m.razonSocial}</button>
                  <p className={`mt-0.5 text-xs ${m.evaluacion.acepta ? 'text-emerald-600 dark:text-emerald-400' : 'text-text-faint'}`}>
                    {m.evaluacion.acepta ? 'Acepta' : 'No acepta'} · {m.evaluacion.motivos.join(' · ')}
                  </p>
                </div>
                {m.evaluacion.acepta && (
                  <Button size="sm" onClick={() => push({ type: 'clienteConocimiento', dest: m.dest, razonSocial: m.razonSocial, tab: 'ofertas', prefillMaterial: mat, prefillOportunidadId: oportunidadAbierta?.id })}>
                    Ofertar
                  </Button>
                )}
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {relacionados.length > 0 && (
        <div className="mt-6 border-t border-border pt-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-faint">Materiales relacionados</h3>
          <div className="flex flex-wrap gap-1.5">
            {relacionados.map((r) => (
              <button
                key={r.material}
                className="rounded-full border border-border bg-bg-elevated px-2.5 py-1 text-xs text-text-muted hover:border-accent hover:text-accent"
                onClick={() => push({ type: 'materialHub', material: r.material })}
                title={`${r.clientesEnComun} cliente(s) en común`}
              >
                <span className="font-mono">{r.material}</span> {r.texto && `· ${r.texto}`}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Observaciones ligadas a este material, sin importar de qué cliente vengan
 * (req.: "Notas" del material) — agregarlas se hace desde la ficha del
 * cliente correspondiente (Compatibilidad → Ficha), no aquí, porque una
 * observación siempre pertenece a un `dest`. */
function NotasMaterial({ material, push }: { material: string; push: (p: Panel) => void }) {
  const todasObservaciones = useConocimientoStore((s) => s.observaciones);
  const observaciones = useMemo(() => todasObservaciones.filter((o) => norm(o.material ?? '') === norm(material)), [todasObservaciones, material]);
  if (observaciones.length === 0) {
    return <p className="text-sm text-text-muted">Sin observaciones para este material todavía. Se agregan desde la ficha de cada cliente, en la pestaña Compatibilidad.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {observaciones.map((o) => (
        <li key={o.id} className="rounded-lg border border-border bg-bg-elevated p-2.5 text-sm">
          <button className="font-medium text-accent hover:underline" onClick={() => push({ type: 'clienteConocimiento', dest: o.dest })}>{o.dest}</button>
          <p className="mt-0.5 text-text">{o.texto}</p>
          <p className="mt-0.5 text-[11px] text-text-faint">{new Date(o.creadoEn).toLocaleDateString('es-MX')}</p>
        </li>
      ))}
    </ul>
  );
}
