import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { LayoutGrid, List, Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatTile, useSavedViews, SavedViewsControl } from '@/modules/analytics/ui';
import { EmptyState } from '@/components/feedback/EmptyState';
import { cn, formatCurrency } from '@/lib/utils';
import { useAnalytics } from '@/modules/analytics/AnalyticsContext';
import { useDataStore } from '@/store/dataStore';
import { useConocimientoStore } from '@/store/conocimientoStore';
import { buildOportunidadesCandidatas } from '@/core/oportunidad';
import { norm } from '@/lib/text';
import { usePersistedState } from '@/hooks/usePersistedState';
import { MaterialSearch } from './components/MaterialSearch';
import { OportunidadTray } from './components/OportunidadTray';
import { OportunidadListView } from './components/OportunidadListView';
import type { CondicionEspecial, Oportunidad } from '@/core/types';

const CONDICION_FILTROS: { key: CondicionEspecial | ''; label: string }[] = [
  { key: '', label: 'Todas' },
  { key: 'corta-caducidad', label: 'Caducidad' },
  { key: 'lento-movimiento', label: 'Lento mov.' },
  { key: 'calidad', label: 'Calidad' },
  { key: 'danado', label: 'Dañado' },
];

interface ViewState { condicion: CondicionEspecial | ''; vista: 'tablero' | 'lista' }

/** Bandeja de Oportunidades Comerciales — punto de partida del módulo (req.
 * "Oportunidad Comercial" del plan). Sugiere candidatas derivadas de lotes con
 * condición especial que aún no tienen oportunidad abierta, y muestra las ya
 * creadas por estado. */
export function OportunidadesPage() {
  const { lotes, invCondicion } = useAnalytics();
  const settings = useDataStore((s) => s.settings);
  const oportunidades = useConocimientoStore((s) => s.oportunidades);
  const hydrate = useConocimientoStore((s) => s.hydrate);
  const addOportunidad = useConocimientoStore((s) => s.addOportunidad);

  const [condicion, setCondicion] = usePersistedState<CondicionEspecial | ''>('oportunidades.condicion', '');
  const [vista, setVista] = usePersistedState<'tablero' | 'lista'>('oportunidades.vista', 'tablero');
  const savedViews = useSavedViews<ViewState>('oportunidades_vistas');
  const applyView = (state: ViewState) => { setCondicion(state.condicion); setVista(state.vista); };

  useEffect(() => { void hydrate(); }, [hydrate]);

  const existingKeys = useMemo(
    () => new Set(oportunidades.map((o) => `${norm(o.material)}|${norm(o.lote ?? '')}`)),
    [oportunidades],
  );
  const candidatas = useMemo(
    () => buildOportunidadesCandidatas(lotes, invCondicion, settings?.shortExpiryDays ?? 90, existingKeys),
    [lotes, invCondicion, settings, existingKeys],
  );

  const filtradas = condicion ? oportunidades.filter((o) => o.condicion === condicion) : oportunidades;
  const abiertas = filtradas.filter((o) => !['colocada-total', 'sin-interesados'].includes(o.estado));
  const riesgo = candidatas.reduce((acc, c) => acc + c.cantidadDisponible * c.precioOferta, 0);
  const venceProximo = candidatas.filter((c) => c.diasVigencia != null && c.diasVigencia <= 60).length;

  // % de colocación entre las oportunidades CERRADAS en los últimos 90 días
  // (colocada-total vs. sin-interesados — colocada-parcial sigue activa,
  // nunca se marca `cerradaEn`) — KPI avanzado (fase 4): mide efectividad
  // real del cierre, no solo volumen de oportunidades abiertas.
  const colocacion90 = useMemo(() => {
    const hace90 = Date.now() - 90 * 86400000;
    const cerradas = oportunidades.filter((o) => o.cerradaEn && new Date(o.cerradaEn).getTime() >= hace90);
    if (cerradas.length === 0) return null;
    const colocadas = cerradas.filter((o) => o.estado === 'colocada-total').length;
    return Math.round((colocadas / cerradas.length) * 100);
  }, [oportunidades]);

  function crearDesde(c: (typeof candidatas)[number]) {
    const now = new Date().toISOString();
    const o: Oportunidad = {
      material: c.material, descripcion: c.descripcion, lote: c.lote, centro: c.centro,
      condicion: c.condicion, cantidadDisponible: c.cantidadDisponible, fechaCaducidad: c.fechaCaducidad,
      precioOferta: c.precioOferta, estado: 'nueva', responsable: '', prioridad: c.diasVigencia != null && c.diasVigencia <= 30 ? 'alta' : 'media',
      creadaEn: now, actualizadaEn: now, cantidadColocada: 0, notas: '',
    };
    void addOportunidad(o);
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-xl font-semibold">Oportunidades comerciales</h1>
        <div className="flex items-center gap-2">
          <MaterialSearch />
          <Button asChild variant="outline" size="sm">
            <Link to="/oportunidades/clientes"><Users className="size-3.5" /> Clientes</Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <StatTile label="Abiertas" value={String(abiertas.length)} />
        <StatTile label="Riesgo económico" value={formatCurrency(riesgo)} sub="lotes sin oportunidad" tone="text-danger" />
        <StatTile label="Vencen <60d" value={String(venceProximo)} />
        <StatTile label="Colocación 90d" value={colocacion90 != null ? `${colocacion90}%` : '—'} sub="oportunidades cerradas" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {CONDICION_FILTROS.map((f) => (
            <button
              key={f.key}
              onClick={() => setCondicion(f.key)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs transition-colors',
                condicion === f.key ? 'border-accent bg-accent-soft text-accent' : 'border-border text-text-muted hover:bg-bg-inset',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <SavedViewsControl views={savedViews.views} onApply={applyView} onSave={(name) => savedViews.save(name, { condicion, vista })} onRemove={savedViews.remove} />
          <div className="flex rounded-md border border-border">
            <button onClick={() => setVista('tablero')} className={cn('flex items-center gap-1 rounded-l-md px-2.5 py-1.5 text-xs', vista === 'tablero' ? 'bg-bg-inset text-text' : 'text-text-muted')} title="Vista tablero">
              <LayoutGrid className="size-3.5" /> Tablero
            </button>
            <button onClick={() => setVista('lista')} className={cn('flex items-center gap-1 rounded-r-md border-l border-border px-2.5 py-1.5 text-xs', vista === 'lista' ? 'bg-bg-inset text-text' : 'text-text-muted')} title="Vista lista">
              <List className="size-3.5" /> Lista
            </button>
          </div>
        </div>
      </div>

      {candidatas.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-text">Candidatas sugeridas ({candidatas.length})</h2>
          <div className="flex flex-wrap gap-2">
            {candidatas.slice(0, 8).map((c) => (
              <div key={`${c.material}-${c.lote}`} className="flex items-center gap-2 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-xs">
                <span className="font-mono text-accent">{c.material}</span>
                <span className="text-text-muted">{c.diasVigencia != null ? `${c.diasVigencia}d` : c.condicion}</span>
                <Button size="sm" variant="outline" onClick={() => crearDesde(c)}><Plus className="size-3" /> Crear</Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {filtradas.length === 0 ? (
        <EmptyState title="Sin oportunidades todavía" description="Crea una desde una candidata sugerida arriba, o busca un material para analizarlo." />
      ) : vista === 'tablero' ? (
        <OportunidadTray oportunidades={filtradas} />
      ) : (
        <OportunidadListView oportunidades={filtradas} />
      )}
    </div>
  );
}
