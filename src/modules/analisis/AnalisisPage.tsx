import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { exportXlsxMultiSheet, stamp } from '@/lib/exportXlsx';
import { useAnalytics } from '@/modules/analytics/AnalyticsContext';
import { EmptyState } from '@/components/feedback/EmptyState';
import { usePanelStore } from '@/store/panelStore';
import { StatTile, EvolChart, ComparativaDual, Chip, RowContextMenu, StatePill, useSavedViews, SavedViewsControl } from '@/modules/analytics/ui';
import { analisisVentas, type ClienteAna, type MatAna, type AnalisisFilters } from '@/core/comercial';
import { mesKey, mesAnterior, hoyMes } from '@/core/resumenFac';
import { norm, num } from '@/modules/analytics/helpers';

function pct(a: number, b: number) {
  const p = b ? (a / b - 1) * 100 : a ? 100 : 0;
  return <span className={p >= 0 ? 'text-emerald-500' : 'text-danger'}>{p >= 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span>;
}

const qLabelOf = (k: number) => {
  const y = Math.floor((k - 1) / 12);
  const m = ((k - 1) % 12) + 1;
  return `Q${Math.floor((m - 1) / 3) + 1} ${y}`;
};

export function AnalisisPage() {
  const a = useAnalytics();
  const open = usePanelStore((s) => s.open);

  const [ejecutivo, setEjecutivo] = useState('');
  const [grupoCliente, setGrupoCliente] = useState('');
  const [sector, setSector] = useState('');
  const [grupoArticulo, setGrupoArticulo] = useState('');
  const [soloNoDetenido, setSoloNoDetenido] = useState(false);
  const [periodo, setPeriodo] = useState<'corriente' | 'anterior'>('corriente');

  // Vistas guardadas: snapshot de los 4 filtros + toggles, persistido entre sesiones.
  type AnalisisViewState = { ejecutivo: string; grupoCliente: string; sector: string; grupoArticulo: string; soloNoDetenido: boolean; periodo: 'corriente' | 'anterior' };
  const savedViews = useSavedViews<AnalisisViewState>('analisis_vistas');
  const applyView = (state: AnalisisViewState) => {
    setEjecutivo(state.ejecutivo); setGrupoCliente(state.grupoCliente); setSector(state.sector);
    setGrupoArticulo(state.grupoArticulo); setSoloNoDetenido(state.soloNoDetenido); setPeriodo(state.periodo);
  };
  const saveCurrentView = (name: string) => savedViews.save(name, { ejecutivo, grupoCliente, sector, grupoArticulo, soloNoDetenido, periodo });

  // Opciones distintas para los 4 filtros, tomadas de las mismas fuentes
  // (Resumen_Fac + catálogo) que alimenta analisisVentas — no dependen del
  // resultado ya filtrado, para no ir angostando las listas conforme se filtra.
  const { ejecOptions, grupoClienteOptions, sectorOptions, grupoArticuloOptions } = useMemo(() => {
    const ejecs = new Set<string>(), grupos = new Set<string>(), sectores = new Set<string>(), gArts = new Set<string>();
    if (a.rf) {
      a.rf.solic.forEach((_serie, code) => {
        const ej = a.enrich.ejecutivoNombre(a.rf!.solicGpoV.get(code) || '');
        if (ej) ejecs.add(ej);
        const gc = a.enrich.grupoCliente(a.rf!.solicGpoC.get(code) || '') || a.rf!.solicGpoC.get(code) || '';
        if (gc) grupos.add(gc);
      });
      a.rf.mat.forEach((_serie, m) => {
        sectores.add(a.enrich.matSector(m) || '(sin sector)');
        gArts.add(a.enrich.matGrupo(m) || '(sin grupo)');
      });
    }
    return {
      ejecOptions: [...ejecs].sort(),
      grupoClienteOptions: [...grupos].sort(),
      sectorOptions: [...sectores].sort(),
      grupoArticuloOptions: [...gArts].sort(),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.rf, a.enrich]);

  const A = useMemo(() => {
    const filters: AnalisisFilters = { ejecutivo, grupoCliente, sector, grupoArticulo };
    return analisisVentas(a.rf, a.bo, a.enrich, filters);
  }, [a.rf, a.bo, a.enrich, ejecutivo, grupoCliente, sector, grupoArticulo]);

  // #5: solicitantes con al menos un pedido pendiente + fuente disponible —
  // reactivar a un "cliente en riesgo" es más fácil si ya hay con qué surtirlo.
  const solicConFuente = useMemo(() => {
    const s = new Set<string>();
    a.bo.forEach((it) => {
      if (it.fuentes.length && num(it.bo.cantidadPendiente) > 0) s.add(norm(it.bo.solicitante));
    });
    return s;
  }, [a.bo]);

  // #6: inventario total (todos los centros) por material — para detectar
  // "cae en consumo Y sobra inventario" en la tabla de materiales a la baja.
  const invPorMaterial = useMemo(() => {
    const m = new Map<string, number>();
    a.invCondicion.forEach((r) => {
      const cur = m.get(norm(r.material)) || 0;
      m.set(norm(r.material), cur + (r.invSuma || 0));
    });
    return m;
  }, [a.invCondicion]);

  // Último trimestre YA COMPLETO (no el corriente en curso) vs el mismo
  // trimestre del año anterior — anclado en R (mes anterior a hoy, igual que
  // el KPI de "últ. mes completo"), retrocediendo un trimestre más si ese
  // trimestre aún no había cerrado, y otro más si "periodo" = anterior.
  const qCompleto = useMemo(() => {
    if (!A) return null;
    const R = mesKey(mesAnterior(hoyMes()));
    const y = Math.floor((R - 1) / 12);
    const m = ((R - 1) % 12) + 1;
    let qStartK = y * 12 + (Math.floor((m - 1) / 3) * 3 + 1);
    if (qStartK + 2 > R) qStartK -= 3;
    if (periodo === 'anterior') qStartK -= 3;
    const mesMap = new Map(A.serieTotal.map((p) => [mesKey(p.mes), p.imp]));
    let cur = 0, prev = 0;
    for (let i = 0; i < 3; i++) { cur += mesMap.get(qStartK + i) || 0; prev += mesMap.get(qStartK + i - 12) || 0; }
    return { qLabel: qLabelOf(qStartK), cur, prev };
  }, [A, periodo]);

  const opsShown = useMemo(() => {
    if (!A) return [];
    return A.ops.top.filter((o) => !soloNoDetenido || !o.bloqueado).slice(0, 15);
  }, [A, soloNoDetenido]);

  if (!A) {
    return <EmptyState title="Para el análisis se necesita la hoja Resumen_Fac." action={{ to: '/carga', label: 'Ir a Carga' }} />;
  }
  const k = A.kpi;

  const clientTable = (list: ClienteAna[], title: string, kind: 'riesgo' | 'var') => (
    <Card className="p-4">
      <h3 className="mb-2 text-sm font-semibold">{title} · {list.length}</h3>
      <div>
        <Table wrapperClassName="max-h-64">
          <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead className="text-right">{kind === 'riesgo' ? 'Base 12m' : '3m previos'}</TableHead><TableHead className="text-right">{kind === 'riesgo' ? '—' : 'Últ. 3m'}</TableHead><TableHead>{kind === 'riesgo' ? 'Situación' : 'Var.'}</TableHead>{kind === 'riesgo' && <TableHead>Oportunidad</TableHead>}</TableRow></TableHeader>
          <TableBody>
            {list.map((c) => (
              <RowContextMenu
                key={c.code}
                label={c.razon || c.code}
                onVerDetalle={() => open({ type: 'evol', kind: 'solic', key: c.code })}
                copyItems={[{ label: 'Cliente', value: c.razon }, { label: 'Solicitante', value: c.code }, { label: 'Ejecutivo', value: c.ejec }]}
              >
                <TableRow className="cursor-pointer" title="Doble clic para ver detalle" onDoubleClick={() => open({ type: 'evol', kind: 'solic', key: c.code })}>
                  <TableCell className="max-w-72 truncate"><Chip onClick={() => open({ type: 'evol', kind: 'solic', key: c.code })}>{c.razon || '—'}</Chip><div className="text-[11px] text-text-faint">Solic {c.code} · {c.ejec || '—'}</div></TableCell>
                  <TableCell className="text-right">{formatCurrency(kind === 'riesgo' ? c.base ?? 0 : c.p3)}</TableCell>
                  <TableCell className="text-right">{kind === 'riesgo' ? '—' : formatCurrency(c.a3)}</TableCell>
                  <TableCell>{kind === 'riesgo' ? `${c.sinComprar} m sin comprar` : pct(c.a3, c.p3)}</TableCell>
                  {kind === 'riesgo' && (
                    <TableCell>
                      {solicConFuente.has(norm(c.code))
                        ? <StatePill label="Pedido con fuente" cls="verde" />
                        : <span className="text-text-faint">—</span>}
                    </TableCell>
                  )}
                </TableRow>
              </RowContextMenu>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );

  const matTable = (list: MatAna[], title: string, showInv = false) => (
    <Card className="p-4">
      <h3 className="mb-2 text-sm font-semibold">{title} · {list.length}</h3>
      <div>
        <Table wrapperClassName="max-h-64">
          <TableHeader><TableRow><TableHead>Material</TableHead><TableHead className="text-right">3m previos</TableHead><TableHead className="text-right">Últ. 3m</TableHead><TableHead>Var.</TableHead>{showInv && <TableHead className="text-right">Inventario</TableHead>}</TableRow></TableHeader>
          <TableBody>
            {list.map((m) => {
              const inv = invPorMaterial.get(norm(m.code)) || 0;
              return (
                <RowContextMenu
                  key={m.code}
                  label={m.code}
                  onVerDetalle={() => open({ type: 'material', material: m.code })}
                  copyItems={[{ label: 'Material', value: m.code }, { label: 'Descripción', value: m.texto }]}
                >
                  <TableRow className="cursor-pointer" title="Doble clic para ver detalle" onDoubleClick={() => open({ type: 'material', material: m.code })}>
                    <TableCell><Chip onClick={() => open({ type: 'material', material: m.code })}>{m.code}</Chip><div className="text-[11px] text-text-faint max-w-72 truncate">{m.texto}</div></TableCell>
                    <TableCell className="text-right">{formatCurrency(m.p3)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(m.a3)}</TableCell>
                    <TableCell>{pct(m.a3, m.p3)}</TableCell>
                    {showInv && <TableCell className="text-right">{inv > 0 ? formatNumber(inv) : '—'}</TableCell>}
                  </TableRow>
                </RowContextMenu>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );

  const exportar = () => {
    void exportXlsxMultiSheet(`analisis_${stamp()}.xlsx`, [
      {
        name: 'Oportunidades',
        rows: A.ops.top.map((o) => ({ Pedido: o.pedido, Cliente: o.razon, Material: o.mat, 'Imp. pendiente': o.imp, Bloqueado: o.bloqueado ? 'Sí' : '' })),
      },
      {
        name: 'Sectores',
        rows: A.sectores.map((s) => ({ Sector: s.sector, '3m previos': s.p3, 'Últ. 3m': s.a3, 'Imp. 12m': s.i12, Grupos: s.grupos.size })),
      },
      {
        name: 'Clientes en riesgo',
        rows: A.riesgo.map((c) => ({ Cliente: c.razon, Solicitante: c.code, Ejecutivo: c.ejec, 'Base 12m': c.base ?? 0, 'Meses sin comprar': c.sinComprar })),
      },
      {
        name: 'Clientes a la baja',
        rows: A.caen.map((c) => ({ Cliente: c.razon, Solicitante: c.code, Ejecutivo: c.ejec, '3m previos': c.p3, 'Últ. 3m': c.a3 })),
      },
      {
        name: 'Clientes en crecimiento',
        rows: A.crecen.map((c) => ({ Cliente: c.razon, Solicitante: c.code, Ejecutivo: c.ejec, '3m previos': c.p3, 'Últ. 3m': c.a3 })),
      },
      {
        name: 'Materiales a la baja',
        rows: A.matCaen.map((m) => ({ Material: m.code, Descripción: m.texto, '3m previos': m.p3, 'Últ. 3m': m.a3 })),
      },
      {
        name: 'Materiales en crecimiento',
        rows: A.matSuben.map((m) => ({ Material: m.code, Descripción: m.texto, '3m previos': m.p3, 'Últ. 3m': m.a3 })),
      },
    ]);
  };

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-6">
      <div className="flex items-start justify-between gap-2">
        <div><h2 className="font-display text-2xl font-semibold">Análisis</h2>
          <p className="text-sm text-text-muted">Inteligencia comercial sobre las series de Resumen_Fac</p></div>
        <div className="flex items-center gap-2">
          <SavedViewsControl views={savedViews.views} onApply={applyView} onSave={saveCurrentView} onRemove={savedViews.remove} />
          <Button variant="outline" size="sm" onClick={exportar}><Download className="mr-1 size-3.5" />Exportar a Excel</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={ejecutivo} onChange={(ev) => setEjecutivo(ev.target.value)} className="w-auto">
          <option value="">Ejecutivo (todos)</option>{ejecOptions.map((v) => <option key={v} value={v}>{v}</option>)}
        </Select>
        <Select value={grupoCliente} onChange={(ev) => setGrupoCliente(ev.target.value)} className="w-auto">
          <option value="">Grupo cliente (todos)</option>{grupoClienteOptions.map((v) => <option key={v} value={v}>{v}</option>)}
        </Select>
        <Select value={sector} onChange={(ev) => setSector(ev.target.value)} className="w-auto">
          <option value="">Sector (todos)</option>{sectorOptions.map((v) => <option key={v} value={v}>{v}</option>)}
        </Select>
        <Select value={grupoArticulo} onChange={(ev) => setGrupoArticulo(ev.target.value)} className="w-auto">
          <option value="">Grupo artículo (todos)</option>{grupoArticuloOptions.map((v) => <option key={v} value={v}>{v}</option>)}
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatTile label={`Fact. ${k.refLbl} (últ. mes completo)`} value={formatCurrency(k.mesPrevImp)} sub={<>{pct(k.mesPrevImp, k.mesPrevAnt)} vs año ant.</>} />
        <StatTile label="Q corriente (a la fecha)" value={formatCurrency(k.qImp)} sub={<>{pct(k.qImp, k.qAnt)} vs año ant.</>} />
        <StatTile label="Clientes activos (≤3m)" value={formatNumber(k.activos3m)} sub={`de ${formatNumber(A.conc.nClientes)} en 12m`} />
        <StatTile label="Concentración 12m" value={`${(A.conc.top5 * 100).toFixed(0)}% top 5`} sub={`${(A.conc.top10 * 100).toFixed(0)}% top 10`} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {qCompleto && (
          <StatTile
            label={`Fact. ${qCompleto.qLabel} (últ. trimestre completo)`}
            value={formatCurrency(qCompleto.cur)}
            sub={<>{pct(qCompleto.cur, qCompleto.prev)} vs {formatCurrency(qCompleto.prev)} año ant.</>}
          />
        )}
        <div className="inline-flex items-center gap-1 rounded-md border border-border p-0.5 text-xs">
          <button onClick={() => setPeriodo('corriente')} className={`rounded px-2 py-1 ${periodo === 'corriente' ? 'bg-accent text-accent-fg' : 'text-text-muted hover:text-text'}`}>Periodo corriente</button>
          <button onClick={() => setPeriodo('anterior')} className={`rounded px-2 py-1 ${periodo === 'anterior' ? 'bg-accent text-accent-fg' : 'text-text-muted hover:text-text'}`}>Periodo anterior</button>
        </div>
      </div>

      <Card className="p-4">
        <h3 className="mb-2 text-sm font-semibold">Facturación mensual total</h3>
        <EvolChart serie={A.serieTotal} height={220} />
        <div className="mt-3"><ComparativaDual serie={A.serieTotal} /></div>
      </Card>

      <Card className="p-4">
        <h3 className="mb-2 text-sm font-semibold">Oportunidades en Sugerencias · pendiente × precio</h3>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="grid grid-cols-2 gap-2">
            <StatTile label="Importe pendiente total" value={formatCurrency(A.ops.total)} />
            <StatTile label="Detenido por bloqueo" value={formatCurrency(A.ops.bloq)} tone="text-danger" />
          </div>
          <label className="flex h-9 items-center gap-1.5 rounded-md border border-border bg-bg-elevated px-2 text-sm">
            <input type="checkbox" checked={soloNoDetenido} onChange={(ev) => setSoloNoDetenido(ev.target.checked)} />
            Solo no detenido
          </label>
        </div>
        <div>
          <Table wrapperClassName="max-h-64">
            <TableHeader><TableRow><TableHead>Pedido</TableHead><TableHead>Cliente</TableHead><TableHead>Material</TableHead><TableHead className="text-right">Imp. pendiente</TableHead></TableRow></TableHeader>
            <TableBody>
              {opsShown.map((o, i) => (
                <RowContextMenu
                  key={i}
                  label={o.pedido}
                  onVerDetalle={() => open({ type: 'pedido', pedido: o.pedido })}
                  copyItems={[{ label: 'Pedido', value: o.pedido }, { label: 'Cliente', value: o.razon }, { label: 'Material', value: o.mat }]}
                >
                  <TableRow
                    className={`cursor-pointer ${o.bloqueado ? 'bg-amber-400/20 hover:bg-amber-400/30' : ''}`}
                    title="Doble clic para ver detalle"
                    onDoubleClick={() => open({ type: 'pedido', pedido: o.pedido })}
                  >
                    <TableCell><Chip onClick={() => open({ type: 'pedido', pedido: o.pedido })}>{o.pedido}</Chip></TableCell>
                    <TableCell className="max-w-64 truncate">{o.razon}</TableCell>
                    <TableCell><Chip onClick={() => open({ type: 'material', material: o.mat })}>{o.mat}</Chip></TableCell>
                    <TableCell className="text-right">{formatCurrency(o.imp)}</TableCell>
                  </TableRow>
                </RowContextMenu>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="mb-2 text-sm font-semibold">Sectores — alza / baja</h3>
        <div>
          <Table wrapperClassName="max-h-64">
            <TableHeader><TableRow><TableHead>Sector</TableHead><TableHead className="text-right">3m previos</TableHead><TableHead className="text-right">Últ. 3m</TableHead><TableHead className="text-right">Imp. 12m</TableHead><TableHead>Var.</TableHead></TableRow></TableHeader>
            <TableBody>
              {A.sectores.map((s) => (
                <RowContextMenu
                  key={s.sector}
                  label={s.sector}
                  onVerDetalle={() => open({ type: 'sector', sector: s.sector })}
                  copyItems={[{ label: 'Sector', value: s.sector }]}
                >
                  <TableRow className="cursor-pointer" title="Doble clic para ver detalle" onDoubleClick={() => open({ type: 'sector', sector: s.sector })}>
                    <TableCell><Chip onClick={() => open({ type: 'sector', sector: s.sector })}>{s.sector}</Chip><div className="text-[11px] text-text-faint">{s.grupos.size} grupo(s)</div></TableCell>
                    <TableCell className="text-right">{formatCurrency(s.p3)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(s.a3)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(s.i12)}</TableCell>
                    <TableCell>{pct(s.a3, s.p3)}</TableCell>
                  </TableRow>
                </RowContextMenu>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {clientTable(A.riesgo, 'Clientes en riesgo de abandono', 'riesgo')}
        {clientTable(A.caen, 'Clientes a la baja', 'var')}
        {clientTable(A.crecen, 'Clientes en crecimiento', 'var')}
        {matTable(A.matCaen, 'Materiales a la baja', true)}
        {matTable(A.matSuben, 'Materiales en crecimiento')}
      </div>
    </div>
  );
}
