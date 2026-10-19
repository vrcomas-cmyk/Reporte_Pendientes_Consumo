import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { CollapsibleCard, SegmentedControl } from '@/components/layout/report';
import { usePersistedState } from '@/hooks/usePersistedState';
import { cn, formatCurrency, formatNumber } from '@/lib/utils';
import {
  agruparFac, ETIQUETA_NIVEL_FAC, ORDEN_NIVELES_FAC, type DispersionMaterial, type NivelFac, type NodoFac, type OrdenFac, type RenglonFac,
} from '@/core/facPorNivel';

type Tope = '10' | '25' | 'todos';

const spreadTxt = (s: number) => `+${(s * 100).toFixed(0)}%`;
const claseSpread = (s: number) => (s > 1 ? 'font-medium text-danger' : 'font-medium text-warning');

function tituloDispersion(d: DispersionMaterial): string {
  return `Paga menos: ${d.clienteMin} (${formatCurrency(d.precioMin)}) · Paga más: ${d.clienteMax} (${formatCurrency(d.precioMax)}) · ${d.nClientes} clientes`;
}

/** UNA sola sección «Facturación promedio mensual por …» (Gerente, Sector, Grupo de artículo o Material) con su dispersión de precios entre
 * clientes. Cada fila se despliega hacia los niveles de abajo (gerente → sector → grupo → material); Top 10 / Top 25 / Todos; y se puede ordenar
 * por facturación o por dispersión (solo lo que tiene dispersión). Clic en el nombre: abre su detalle / filtra, según `onNodo`. */
export function FacPorNivel({ renglones, nMeses, ventana, storageKey, onNodo }: {
  renglones: readonly RenglonFac[];
  nMeses: number;
  /** Etiqueta de la ventana de meses, para el título. */
  ventana: string;
  /** Prefijo único de persistencia. */
  storageKey: string;
  onNodo: (nivel: NivelFac, clave: string) => void;
}) {
  const [nivel, setNivel] = usePersistedState<NivelFac>(`${storageKey}.facNivel.nivel`, 'sector');
  const [tope, setTope] = usePersistedState<Tope>(`${storageKey}.facNivel.tope`, '10');
  const [orden, setOrden] = usePersistedState<OrdenFac>(`${storageKey}.facNivel.orden`, 'facturacion');
  const [abiertos, setAbiertos] = useState<ReadonlySet<string>>(new Set());

  const { filas, total } = useMemo(() => ({
    filas: agruparFac(renglones, ORDEN_NIVELES_FAC.slice(ORDEN_NIVELES_FAC.indexOf(nivel)), nMeses, orden, nivel),
    total: renglones.reduce((s, r) => s + r.imp, 0) / (nMeses > 0 ? nMeses : 1),
  }), [renglones, nivel, nMeses, orden]);

  const visibles = tope === 'todos' ? filas : filas.slice(0, Number(tope));
  const alternar = (id: string) => setAbiertos((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // Aplana el árbol según lo desplegado.
  const lineas: { n: NodoFac; prof: number; pos: number }[] = [];
  const recorre = (nodos: readonly NodoFac[], prof: number) => {
    nodos.forEach((n, i) => {
      lineas.push({ n, prof, pos: i + 1 });
      if (n.hijos.length && abiertos.has(n.id)) recorre(n.hijos, prof + 1);
    });
  };
  recorre(visibles, 0);

  return (
    <CollapsibleCard
      title={`Facturación promedio mensual por ${ETIQUETA_NIVEL_FAC[nivel]} (${ventana}) · ${formatNumber(filas.length)} ${filas.length === 1 ? 'valor' : 'valores'}`}
      storageKey={`${storageKey}.facNivel.abierto`}
      defaultOpen
      right={(
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            value={nivel}
            onChange={(v) => { setNivel(v); setAbiertos(new Set()); }}
            ariaLabel="Agrupar por"
            options={[{ value: 'gerente', label: 'Gerente' }, { value: 'sector', label: 'Sector' }, { value: 'grupoart', label: 'Grupo artículo' }, { value: 'material', label: 'Material' }]}
          />
          <SegmentedControl
            value={orden}
            onChange={(v) => { setOrden(v); setAbiertos(new Set()); }}
            ariaLabel="Ordenar por"
            options={[{ value: 'facturacion', label: 'Por facturación' }, { value: 'dispersion', label: 'Por dispersión' }]}
          />
          <SegmentedControl
            value={tope}
            onChange={setTope}
            ariaLabel="Cuántos mostrar"
            options={[{ value: '10', label: 'Top 10' }, { value: '25', label: 'Top 25' }, { value: 'todos', label: 'Todos' }]}
          />
        </div>
      )}
    >
      {filas.length === 0 ? (
        <p className="text-sm text-text-muted">
          {orden === 'dispersion'
            ? 'Sin dispersión detectada (ningún material del filtro actual tiene 2+ clientes con precio vigente distinto).'
            : 'Sin facturación en la ventana del filtro actual.'}
        </p>
      ) : (
        <div className="max-h-96 overflow-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-bg-elevated">
              <tr className="text-left text-xs text-text-faint">
                <th className="w-8 py-1.5 pl-2" />
                <th className="py-1.5 capitalize">{ETIQUETA_NIVEL_FAC[nivel]}</th>
                <th className="py-1.5 text-right">$/mes</th>
                <th className="py-1.5 text-right">pzas/mes</th>
                <th className="w-40 py-1.5 text-right">% del importe</th>
                <th className="py-1.5 pr-2 text-right" title="Diferencia entre lo que paga el cliente que paga menos y el que paga más por el mismo material (precio unitario vigente). En los niveles de arriba: cuántos materiales tienen dispersión y la mayor.">Dispersión</th>
              </tr>
            </thead>
            <tbody>
              {lineas.map(({ n, prof, pos }) => {
                const pct = total > 0 ? (n.imp / total) * 100 : 0;
                const hijo = prof > 0;
                const siguiente = ORDEN_NIVELES_FAC[ORDEN_NIVELES_FAC.indexOf(n.nivel) + 1];
                return (
                  <tr key={n.id} className={cn('border-t hover:bg-bg-inset', hijo ? 'border-border/40 bg-bg-inset/40 text-xs text-text-muted' : 'border-border/60')}>
                    <td className="py-1 pl-2 text-right text-[11px] tabular-nums text-text-faint">
                      {n.hijos.length > 0
                        ? <button type="button" aria-label={`Ver ${siguiente ? ETIQUETA_NIVEL_FAC[siguiente] : 'detalle'}`} aria-expanded={abiertos.has(n.id)} onClick={() => alternar(n.id)}><ChevronDown className={cn('size-3.5 transition-transform', abiertos.has(n.id) && 'rotate-180')} /></button>
                        : (hijo ? null : pos)}
                    </td>
                    <td className="py-1" style={{ paddingLeft: prof * 16 }}>
                      <button type="button" onClick={() => onNodo(n.nivel, n.clave)} title={n.nivel === 'material' ? 'Ver el material' : n.nivel === 'gerente' ? 'Filtrar la tabla por este gerente' : 'Ver el detalle'}
                        className={cn('text-left hover:underline', hijo ? 'hover:text-accent' : 'text-accent')}>
                        {n.clave}
                      </button>
                      <span className="ml-2 text-xs text-text-faint">{n.nivel === 'material' ? n.desc : `${formatNumber(n.materiales)} material(es)`}</span>
                    </td>
                    <td className="py-1 text-right font-mono tabular-nums">{formatCurrency(n.imp)}</td>
                    <td className="py-1 text-right tabular-nums">{formatNumber(n.cant)}</td>
                    <td className="py-1">
                      <div className="flex items-center justify-end gap-2">
                        {!hijo && <div className="h-1.5 w-20 rounded-full bg-bg-inset"><div className="h-1.5 rounded-full bg-accent" style={{ width: `${Math.min(100, pct)}%` }} /></div>}
                        <span className="w-12 text-right text-xs tabular-nums text-text-muted">{pct.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="py-1 pr-2 text-right text-xs tabular-nums">
                      {n.dispersion
                        ? <span className={claseSpread(n.dispersion.spread)} title={tituloDispersion(n.dispersion)}>{spreadTxt(n.dispersion.spread)}</span>
                        : n.conDispersion > 0 && n.maxSpread != null
                          ? <span title={`${n.conDispersion} material(es) con dispersión; la mayor es ${spreadTxt(n.maxSpread)}`}><span className="text-text-muted">{n.conDispersion} mat. · máx </span><span className={claseSpread(n.maxSpread)}>{spreadTxt(n.maxSpread)}</span></span>
                          : <span className="text-text-faint">-</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-1 text-[11px] text-text-faint">Promedio mensual de la ventana {ventana} · $/mes y pzas/mes. La dispersión compara el precio unitario vigente de cada cliente por material.</p>
    </CollapsibleCard>
  );
}
