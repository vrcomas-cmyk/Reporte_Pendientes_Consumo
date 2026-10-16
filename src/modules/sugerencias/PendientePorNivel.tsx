import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { CollapsibleCard, SegmentedControl } from '@/components/layout/report';
import { usePersistedState } from '@/hooks/usePersistedState';
import { cn, formatCurrency, formatNumber } from '@/lib/utils';

/** Un renglón pendiente del filtro actual, con lo necesario para agruparlo. */
export interface RenglonPendiente { material: string; descripcion: string; gerente: string; sector: string; grupo: string; qty: number; imp: number }

export type NivelPendiente = 'gerente' | 'sector' | 'grupoart' | 'material';
type Tope = '10' | '25' | 'todos';

/** Jerarquía de desglose: cada nivel se abre hacia los que le siguen. */
const ORDEN: readonly NivelPendiente[] = ['gerente', 'sector', 'grupoart', 'material'];
const ETIQUETA: Record<NivelPendiente, string> = { gerente: 'gerente', sector: 'sector', grupoart: 'grupo de artículo', material: 'material' };

interface Nodo { id: string; nivel: NivelPendiente; clave: string; desc: string; qty: number; imp: number; materiales: number; hijos: Nodo[] }

const claveDe = (r: RenglonPendiente, n: NivelPendiente): string =>
  n === 'gerente' ? r.gerente || 'Sin gerente' : n === 'sector' ? r.sector || 'Sin sector' : n === 'grupoart' ? r.grupo || 'Sin grupo' : r.material;

/** Agrupa los renglones por el primer nivel de `niveles` y, recursivamente, por los siguientes. Ordenado por importe. */
function agrupar(renglones: readonly RenglonPendiente[], niveles: readonly NivelPendiente[], prefijo: string): Nodo[] {
  const [nivel, ...resto] = niveles;
  if (!nivel) return [];
  const m = new Map<string, { rs: RenglonPendiente[]; qty: number; imp: number; mats: Set<string>; desc: string }>();
  for (const r of renglones) {
    const k = claveDe(r, nivel);
    const cur = m.get(k) ?? { rs: [], qty: 0, imp: 0, mats: new Set<string>(), desc: nivel === 'material' ? r.descripcion : '' };
    cur.rs.push(r); cur.qty += r.qty; cur.imp += r.imp; cur.mats.add(r.material);
    m.set(k, cur);
  }
  return [...m.entries()]
    .map(([clave, x]) => {
      const id = `${prefijo}/${clave}`;
      return { id, nivel, clave, desc: x.desc, qty: x.qty, imp: x.imp, materiales: x.mats.size, hijos: resto.length ? agrupar(x.rs, resto, id) : [] };
    })
    .sort((a, b) => b.imp - a.imp);
}

/** Una sola sección "Pendiente por …": el mismo cuadro por Gerente (de marca), Sector, Grupo de artículo o Material, con pendiente,
 * importe y su % del total; a elegir entre Top 10 / Top 25 o TODOS. Cada fila se despliega hacia los niveles de abajo
 * (gerente → sector → grupo de artículo → material). Arranca plegada (recuerda lo que el usuario elija).
 * Clic en el nombre: material → su detalle; gerente / sector / grupo → filtra la tabla. */
export function PendientePorNivel({ renglones, storageKey, onMaterial, onFiltrar }: {
  renglones: readonly RenglonPendiente[];
  /** Prefijo único de persistencia (p. ej. 'seg' / 'ped'). */
  storageKey: string;
  onMaterial: (material: string) => void;
  onFiltrar: (campo: 'gerente' | 'sector' | 'grupoart', valor: string) => void;
}) {
  const [nivel, setNivel] = usePersistedState<NivelPendiente>(`${storageKey}.pendiente.nivel`, 'material');
  const [tope, setTope] = usePersistedState<Tope>(`${storageKey}.pendiente.tope`, '10');
  const [abiertos, setAbiertos] = useState<ReadonlySet<string>>(new Set());

  const { filas, total } = useMemo(() => {
    const util = renglones.filter((r) => r.qty > 0);
    return { filas: agrupar(util, ORDEN.slice(ORDEN.indexOf(nivel)), nivel), total: util.reduce((s, r) => s + r.imp, 0) };
  }, [renglones, nivel]);

  const visibles = tope === 'todos' ? filas : filas.slice(0, Number(tope));
  const impVisible = visibles.reduce((s, f) => s + f.imp, 0);
  const abrirNodo = (n: Nodo) => {
    if (n.nivel === 'material') onMaterial(n.clave);
    else onFiltrar(n.nivel, n.clave);
  };
  const alternar = (id: string) => setAbiertos((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // Aplana el árbol según lo desplegado.
  const lineas: { n: Nodo; prof: number; pos: number }[] = [];
  const recorre = (nodos: readonly Nodo[], prof: number) => {
    nodos.forEach((n, i) => {
      lineas.push({ n, prof, pos: i + 1 });
      if (n.hijos.length && abiertos.has(n.id)) recorre(n.hijos, prof + 1);
    });
  };
  recorre(visibles, 0);

  return (
    <CollapsibleCard
      title={`Pendiente por ${ETIQUETA[nivel]} · ${formatNumber(filas.length)} ${filas.length === 1 ? 'valor' : 'valores'}`}
      storageKey={`${storageKey}.pendiente.abierto`}
      right={(
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            value={nivel}
            onChange={(v) => { setNivel(v); setAbiertos(new Set()); }}
            ariaLabel="Agrupar por"
            options={[{ value: 'gerente', label: 'Gerente' }, { value: 'sector', label: 'Sector' }, { value: 'grupoart', label: 'Grupo artículo' }, { value: 'material', label: 'Material' }]}
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
        <p className="text-sm text-text-muted">Sin pendientes en el filtro actual.</p>
      ) : (
        <div className="max-h-96 overflow-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-bg-elevated">
              <tr className="text-left text-xs text-text-faint">
                <th className="w-8 py-1.5 pl-2" />
                <th className="py-1.5 capitalize">{ETIQUETA[nivel]}</th>
                <th className="py-1.5 text-right">Pendiente</th>
                <th className="py-1.5 text-right">Importe</th>
                <th className="w-40 py-1.5 pr-2 text-right">% del importe</th>
              </tr>
            </thead>
            <tbody>
              {lineas.map(({ n, prof, pos }) => {
                const pct = total > 0 ? (n.imp / total) * 100 : 0;
                const expandible = n.hijos.length > 0;
                const hijo = prof > 0;
                const siguiente = ORDEN[ORDEN.indexOf(n.nivel) + 1];
                return (
                  <tr key={n.id} className={cn('border-t hover:bg-bg-inset', hijo ? 'border-border/40 bg-bg-inset/40 text-xs text-text-muted' : 'border-border/60')}>
                    <td className="py-1 pl-2 text-right text-[11px] tabular-nums text-text-faint">
                      {expandible
                        ? <button type="button" aria-label={`Ver ${siguiente ? ETIQUETA[siguiente] : 'detalle'}`} aria-expanded={abiertos.has(n.id)} onClick={() => alternar(n.id)}><ChevronDown className={cn('size-3.5 transition-transform', abiertos.has(n.id) && 'rotate-180')} /></button>
                        : (hijo ? null : pos)}
                    </td>
                    <td className="py-1" style={{ paddingLeft: prof * 16 }}>
                      <button
                        type="button"
                        onClick={() => abrirNodo(n)}
                        title={n.nivel === 'material' ? 'Ver el material' : 'Filtrar la tabla por este valor'}
                        className={cn('text-left hover:underline', hijo ? 'hover:text-accent' : 'text-accent')}
                      >
                        {n.clave}
                      </button>
                      <span className="ml-2 text-xs text-text-faint">{n.nivel === 'material' ? n.desc : `${formatNumber(n.materiales)} material(es)`}</span>
                    </td>
                    <td className="py-1 text-right tabular-nums">{formatNumber(n.qty)}</td>
                    <td className="py-1 text-right font-mono tabular-nums">{formatCurrency(n.imp)}</td>
                    <td className="py-1 pr-2">
                      <div className="flex items-center justify-end gap-2">
                        {!hijo && <div className="h-1.5 w-20 rounded-full bg-bg-inset"><div className="h-1.5 rounded-full bg-accent" style={{ width: `${Math.min(100, pct)}%` }} /></div>}
                        <span className="w-12 text-right text-xs tabular-nums text-text-muted">{pct.toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {filas.length > 0 && (
        <p className="mt-2 text-xs text-text-faint">
          Mostrando {formatNumber(visibles.length)} de {formatNumber(filas.length)} · {formatCurrency(impVisible)} de {formatCurrency(total)} ({total > 0 ? ((impVisible / total) * 100).toFixed(0) : 0}% del importe pendiente del filtro actual)
        </p>
      )}
    </CollapsibleCard>
  );
}
