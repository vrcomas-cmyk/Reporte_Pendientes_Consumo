import { useEffect, useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { DebouncedSearch } from '@/modules/analytics/ui';
import { matchesQuery, norm } from '@/modules/analytics/helpers';
import { useAnalytics } from '@/modules/analytics/AnalyticsContext';
import { EmptyState } from '@/components/feedback/EmptyState';
import { Button } from '@/components/ui/button';
import { usePanelStore } from '@/store/panelStore';
import { useConocimientoStore } from '@/store/conocimientoStore';
import { fichaConfigurada } from '@/core/matchingOfertas';
import { CargaMasivaDialog } from './components/CargaMasivaDialog';
import type { ClienteConocimiento } from '@/core/types';

const CONDICION_LABEL: Record<string, string> = {
  'corta-caducidad': 'Corta caducidad', 'lento-movimiento': 'Lento movimiento', calidad: 'Calidad', danado: 'Dañado',
};
const ESTADO_LABEL: Record<string, string> = { indistinto: 'Indistinto', 'buen-estado': 'Solo buen estado', danado: 'Acepta dañado' };

interface ClienteRow {
  dest: string;
  razonSocial: string;
  grupoCliente: string;
  ejecutivo: string;
  ficha?: ClienteConocimiento;
  aceptaAlgo: boolean;
  overrides: number;
  ofertasCount: number;
}

/** Pestaña "Clientes" del hub de Oportunidades — el universo es SIEMPRE el
 * reporte de Consumo ya cargado (destinatarios reales, con ejecutivo/grupo
 * del catálogo); la ficha (si existe) solo enriquece esa fila con qué acepta.
 * No se listan clientes que no compran (sin fila en Consumo no hay tarjeta
 * ni forma de ofertarles), para no inventar demanda que no existe. */
export function ClientesTab() {
  const a = useAnalytics();
  const clientes = useConocimientoStore((s) => s.clientesByDest);
  const reglas = useConocimientoStore((s) => s.reglas);
  const ofertas = useConocimientoStore((s) => s.ofertas);
  const hydrate = useConocimientoStore((s) => s.hydrate);
  const open = usePanelStore((s) => s.open);
  const [q, setQ] = useState('');
  const [importarOpen, setImportarOpen] = useState(false);

  useEffect(() => { void hydrate(); }, [hydrate]);

  const rows = useMemo<ClienteRow[]>(() => {
    const m = new Map<string, ClienteRow>();
    for (const r of a.result?.consumo ?? []) {
      const d = norm(r.destinatario);
      if (!d) continue;
      const row = m.get(d) ?? { dest: r.destinatario, razonSocial: '', grupoCliente: '', ejecutivo: '', ficha: undefined, aceptaAlgo: false, overrides: 0, ofertasCount: 0 };
      if (!row.razonSocial) row.razonSocial = r.razonSocial;
      if (!row.grupoCliente) row.grupoCliente = a.enrich.grupoCliente(r.grpCliente) || r.grpCliente;
      if (!row.ejecutivo) row.ejecutivo = a.enrich.ejecutivoNombre(r.gpoVdor);
      m.set(d, row);
    }
    const overridesByDest = new Map<string, number>();
    for (const r of reglas) if (r.material != null) overridesByDest.set(norm(r.dest), (overridesByDest.get(norm(r.dest)) ?? 0) + 1);
    const ofertasByDest = new Map<string, number>();
    for (const o of ofertas) ofertasByDest.set(norm(o.dest), (ofertasByDest.get(norm(o.dest)) ?? 0) + 1);
    for (const row of m.values()) {
      const ficha = clientes.get(norm(row.dest));
      row.ficha = ficha;
      row.aceptaAlgo = !!ficha && ficha.activa !== false && fichaConfigurada(ficha);
      row.overrides = overridesByDest.get(norm(row.dest)) ?? 0;
      row.ofertasCount = ofertasByDest.get(norm(row.dest)) ?? 0;
    }
    return [...m.values()].sort((a2, b2) => (a2.razonSocial || a2.dest).localeCompare(b2.razonSocial || b2.dest));
  }, [clientes, reglas, ofertas, a.result, a.enrich]);

  const shown = useMemo(
    () => (q ? rows.filter((r) => matchesQuery(q, `${r.dest} ${r.razonSocial} ${r.ejecutivo} ${r.grupoCliente}`)) : rows),
    [rows, q],
  );

  const destinatariosParaImport = useMemo(
    () => rows.filter((r) => r.ejecutivo).map((r) => ({ dest: r.dest, razonSocial: r.razonSocial, ejecutivo: r.ejecutivo })),
    [rows],
  );

  const aceptan = rows.filter((r) => r.aceptaAlgo).length;

  if (rows.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text-muted">Destinatarios del reporte de Consumo, con lo que cada uno acepta (si ya se configuró su ficha).</p>
        <EmptyState
          title="Sin datos de Consumo cargados"
          description="Esta pestaña toma los clientes directo del reporte de Consumo — carga un análisis primero."
          action={{ to: '/carga', label: 'Ir a Carga' }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-muted" title="El listado es siempre el reporte de Consumo — un cliente sin ficha configurada NO cuenta como que acepta nada, aunque tenga contacto guardado.">
          {rows.length} cliente(s) del reporte · {aceptan} con al menos un criterio de aceptación configurado. Clic en una tarjeta abre su ficha: qué acepta, excepciones, ofertas e historial.
        </p>
        <Button variant="outline" size="sm" onClick={() => setImportarOpen(true)} title="Crea/actualiza fichas en lote para los destinatarios de un mismo ejecutivo">
          <Users className="size-3.5" /> Configurar por ejecutivo…
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <DebouncedSearch onChange={setQ} placeholder="Buscar por código, razón social, ejecutivo o grupo…" className="w-full sm:w-96" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((r) => (
          <button
            key={r.dest}
            className="rounded-lg border border-border bg-bg-elevated p-3 text-left text-sm hover:border-accent"
            onClick={() => open({ type: 'clienteConocimiento', dest: r.dest, razonSocial: r.razonSocial })}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium text-text">{r.razonSocial || r.dest}</p>
                <p className="font-mono text-xs text-text-faint">{r.dest}</p>
              </div>
              {r.aceptaAlgo ? (
                <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">Configurado</span>
              ) : (
                <span className="shrink-0 rounded-full bg-bg-inset px-2 py-0.5 text-[10px] text-text-faint" title="Sin criterio de aceptación marcado: no aparece como candidato en ningún matching todavía.">Sin configurar</span>
              )}
            </div>

            <div className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-text-faint">
              {r.ejecutivo && <span>{r.ejecutivo}</span>}
              {r.grupoCliente && <span>{r.grupoCliente}</span>}
            </div>

            <div className="mt-2 flex flex-wrap gap-1">
              {r.aceptaAlgo && r.ficha
                ? (r.ficha.condicionesAceptadas.length
                  ? r.ficha.condicionesAceptadas.map((c) => <span key={c} className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] text-accent">{CONDICION_LABEL[c] ?? c}</span>)
                  : <span className="text-[11px] text-text-faint">Sin condición específica</span>)
                : <span className="text-[11px] text-text-faint">Sin ficha configurada — clic para configurarla</span>}
            </div>

            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-text-faint">
              {r.aceptaAlgo && r.ficha && r.ficha.estadoMaterial !== 'indistinto' && <span>{ESTADO_LABEL[r.ficha.estadoMaterial]}</span>}
              {r.overrides > 0 && <span>{r.overrides} excepción(es) por material</span>}
              {r.ofertasCount > 0 && <span>{r.ofertasCount} oferta(s)</span>}
            </div>
          </button>
        ))}
      </div>

      {shown.length === 0 && <EmptyState title="Sin resultados" description={`Nada coincide con "${q}".`} />}

      <CargaMasivaDialog open={importarOpen} onClose={() => setImportarOpen(false)} destinatarios={destinatariosParaImport} />
    </div>
  );
}

/** Ruta directa `/oportunidades/clientes` — se conserva como deep-link pero
 * redirige al hub con la pestaña Clientes activa. */
export function ClientesPage() {
  return <Navigate to="/oportunidades?tab=clientes" replace />;
}