import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart2, Boxes, Building2, Layers, ListChecks, Package, User, Users } from 'lucide-react';
import { Chip } from '../ui';
import { SegmentedControl } from '@/components/layout/report';
import { Section } from './_shared';
import { HistorialConsumo, InventarioColumna } from './DetalleLayout';
import { DetalleMosaico, ListaScroll, MetaField, Tile } from './DetalleMosaico';
import { LotesOfertablesSection } from './OpcionesOferta';
import { ResumenAB, usePeriodosAB } from './ComparaPeriodos';
import { ClienteResumen360, ClienteDatosHeader } from './ClienteResumen360';
import { cn, formatCurrency } from '@/lib/utils';
import { consumoEnrich, norm } from '../helpers';
import { serieMatDest, serieDest } from '@/core/resumenFac';
import { promedioConsumo } from '@/core/consumoDesdeRF';
import { usePanelStore, type Panel } from '@/store/panelStore';
import type { Analytics } from '../AnalyticsContext';

/** Panel — Detalle de Facturación por cliente (destinatario) y material, en la plantilla "mosaico" (ver `DetalleMosaico`):
 * cabecera con los datos del cliente; 1 · materiales facturados al cliente (con scroll; clic = material en foco);
 * 2 · inventario de ese material; 3 · historial de facturación (cliente y material) con consumo promedio y periodo A vs B;
 * 4 · lotes, condiciones y materiales ofertables; 5 · pedidos abiertos y consumo histórico del cliente. */
export function ClienteDetallePanel({ panel, a, push }: { panel: Extract<Panel, { type: 'clienteDetalle' }>; a: Analytics; push: (p: Panel) => void }) {
  const { bo, result, rf, enrich } = a;
  const replaceTop = usePanelStore((s) => s.replaceTop);
  const ab = usePeriodosAB();
  // Qué historial se ve: el del material en foco o el de todo el cliente.
  const [vista, setVista] = useState<'material' | 'cliente'>('material');
  const listaRef = useRef<HTMLDivElement>(null);
  const destN = norm(panel.dest);

  const filas = useMemo(() => (result?.consumo ?? []).filter((x) => norm(x.destinatario) === destN), [result, destN]);
  const razon = filas[0]?.razonSocial || bo.find((it) => norm(it.bo.destinatario) === destN)?.bo.razonSocial || '';
  // Materiales facturados al cliente (uno por material aunque tenga varios centros), del mayor al menor importe de la última facturación.
  const materiales = useMemo(() => {
    const m = new Map<string, { material: string; texto: string; imp: number; centro: string }>();
    for (const r of filas) {
      const k = norm(r.material);
      const e = m.get(k) ?? { material: r.material, texto: r.textoMaterial, imp: 0, centro: r.centro };
      e.imp += r.importeUltima;
      m.set(k, e);
    }
    return [...m.values()].sort((x, y) => y.imp - x.imp);
  }, [filas]);

  // Material en foco: el del panel o, si se abrió solo el cliente, el de mayor importe.
  const matFoco = panel.material ?? materiales[0]?.material;
  const textoFoco = materiales.find((m) => norm(m.material) === norm(matFoco ?? ''))?.texto ?? '';
  const centroFoco = materiales.find((m) => norm(m.material) === norm(matFoco ?? ''))?.centro || filas[0]?.centro || '';
  const serieMat = useMemo(() => (matFoco ? serieMatDest(rf, panel.dest, matFoco) : []), [rf, panel.dest, matFoco]);
  const serieCli = useMemo(() => serieDest(rf, panel.dest), [rf, panel.dest]);
  // Misma regla que Consumo/Facturación: 12 meses cerrados ÷ 12.
  const curmes = rf?.curmes;
  const promedio12 = useMemo(() => (serieMat.length && curmes ? Math.round(promedioConsumo(serieMat, '12m', curmes)) : null), [serieMat, curmes]);

  useEffect(() => {
    listaRef.current?.querySelector('[data-sel="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [matFoco]);

  // Sin material no hay vista de material.
  const vistaEfectiva = matFoco ? vista : 'cliente';
  const ce = consumoEnrich(enrich);
  const c0 = filas[0];
  const ejecutivo = (c0 ? ce.ejec(c0) : '') || '—';
  const grupo = (c0 ? ce.grupoCli(c0) : '') || '—';

  const cabecera = (
    <header className="shrink-0 overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-border/60 bg-bg-inset/40 px-4 py-2.5">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">Facturación · detalle del cliente</p>
          <h2 className="truncate font-display text-lg font-semibold" title={razon || panel.dest}>{razon || panel.dest}</h2>
        </div>
        <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-xs @lg:grid-cols-2 @4xl:grid-cols-4">
          <MetaField icon={Building2} label="Destinatario"><Chip onClick={() => push({ type: 'evol', kind: 'dest', key: panel.dest })}>{panel.dest}</Chip></MetaField>
          <MetaField icon={User} label="Solicitante">
            {c0?.solicitante ? <Chip onClick={() => push({ type: 'evol', kind: 'solic', key: c0.solicitante })}>{c0.solicitante}</Chip> : <span>—</span>}
          </MetaField>
          <MetaField icon={User} label="Ejecutivo"><span className="truncate font-medium text-text" title={ejecutivo}>{ejecutivo}</span></MetaField>
          <MetaField icon={Users} label="Grupo"><span className="truncate font-medium text-text" title={grupo}>{grupo}</span></MetaField>
        </div>
        <button className="text-xs text-accent hover:underline" onClick={() => push({ type: 'clienteConocimiento', dest: panel.dest, razonSocial: razon })}>
          Ver ficha comercial (Oportunidades) →
        </button>
      </div>
      <div className="px-4 pb-3"><ClienteDatosHeader dest={panel.dest} a={a} /></div>
    </header>
  );

  const izquierda = (
    <>
      <Tile
        icon={Package}
        title="1. Materiales facturados"
        trailing={<span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">{materiales.length}</span>}
        className="h-full"
        bodyClassName="flex min-h-0 flex-col"
      >
        <ListaScroll listRef={listaRef}>
          {materiales.length === 0 && <p className="p-2 text-sm text-text-muted">Sin materiales facturados.</p>}
          {materiales.map((m) => {
            const activo = norm(m.material) === norm(matFoco ?? '');
            return (
              <button
                key={m.material}
                type="button"
                data-sel={activo}
                title="Ver este material en el detalle"
                onClick={() => replaceTop({ type: 'clienteDetalle', dest: panel.dest, material: m.material })}
                className={cn(
                  'flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors',
                  activo ? 'border-accent bg-accent-soft font-medium text-accent shadow-xs' : 'border-border/60 hover:border-border hover:bg-bg-inset/70',
                )}
              >
                <span className="min-w-0 truncate">
                  <span className="font-semibold">{m.material}</span>
                  <span className="ml-1 text-text-faint">{m.texto}</span>
                </span>
                <span className="shrink-0 tabular-nums font-semibold">{formatCurrency(m.imp)}</span>
              </button>
            );
          })}
        </ListaScroll>
      </Tile>
      <Tile
        icon={Boxes}
        title="2. Disponibilidad de inventario"
        trailing={centroFoco ? <span className="rounded-full bg-bg-inset px-2.5 py-1 text-xs font-medium text-text-muted">Centro {centroFoco}</span> : undefined}
        className="h-full"
        bodyClassName="p-3"
      >
        {matFoco
          ? <InventarioColumna a={a} material={matFoco} centro={centroFoco || undefined} push={push} />
          : <p className="text-sm text-text-muted">Sin material en foco.</p>}
      </Tile>
    </>
  );

  const derecha = (
    <>
      <Tile
        icon={BarChart2}
        title="3. Historial de facturación"
        trailing={<span className="rounded-full bg-bg-inset px-2.5 py-1 text-xs font-medium text-text-muted">{matFoco ? `Material ${matFoco}` : 'Cliente'}</span>}
        bodyClassName="flex flex-col gap-2 p-4"
      >
        <SegmentedControl
          value={vistaEfectiva}
          onChange={setVista}
          ariaLabel="Nivel del historial"
          options={[
            ...(matFoco ? [{ value: 'material' as const, label: `Material ${matFoco}` }] : []),
            { value: 'cliente' as const, label: 'Cliente · todos los materiales' },
          ]}
        />
        {/* Protagonismo: siempre se dice QUÉ se está viendo, con el material en grande. */}
        {vistaEfectiva === 'material' && matFoco ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-accent/30 bg-accent-soft px-3 py-2">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-accent">Viendo el material</p>
              <p className="truncate font-display text-base font-bold text-text" title={textoFoco}>
                {matFoco}<span className="ml-2 text-sm font-medium text-text-muted">{textoFoco}</span>
              </p>
            </div>
            <Chip title="Ver el material" onClick={() => push({ type: 'material', material: matFoco })}>Abrir material</Chip>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-bg-inset/60 px-3 py-2">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">Viendo todo el cliente</p>
              <p className="truncate text-sm font-semibold text-text">{razon || panel.dest} · todos los materiales</p>
            </div>
            {matFoco && <button type="button" className="text-xs text-accent hover:underline" onClick={() => setVista('material')}>Volver al material {matFoco} →</button>}
          </div>
        )}
        {vistaEfectiva === 'material' && matFoco ? (
          <HistorialConsumo
            a={a}
            serie={serieMat}
            titulo="Facturación del material"
            dest={panel.dest}
            material={matFoco}
            promedioMensual={promedio12}
            onMonth={(mes) => push({ type: 'clientesMes', material: matFoco, mes, dest: panel.dest })}
          />
        ) : (
          <HistorialConsumo a={a} serie={serieCli} titulo="Facturación del cliente" />
        )}
        {/* Colapsada hasta que se active. */}
        <Section collapsible defaultOpen={false} storageKey="cliente.comparar.periodos" tono="fac" origen="Resumen_Fac" title="Comparar periodos">
          <ResumenAB serie={vistaEfectiva === 'material' ? serieMat : serieCli} ab={ab} titulo={vistaEfectiva === 'material' ? 'Material y destinatario' : 'Destinatario'} />
        </Section>
      </Tile>
      {matFoco && (
        <Tile icon={Layers} title="4. Lotes, condiciones y materiales ofertables" trailing={<Chip title="Ver el material" onClick={() => push({ type: 'material', material: matFoco })}>Material {matFoco}</Chip>} bodyClassName="p-4">
          <LotesOfertablesSection a={a} material={matFoco} cliente={`${panel.dest} — ${razon}`} push={push} />
        </Tile>
      )}
      <Tile icon={ListChecks} title="5. Pedidos abiertos y consumo histórico" bodyClassName="p-4">
        <ClienteResumen360 dest={panel.dest} a={a} push={push} sinDatos />
      </Tile>
    </>
  );

  return <DetalleMosaico cabecera={cabecera} izquierda={izquierda} derecha={derecha} />;
}
