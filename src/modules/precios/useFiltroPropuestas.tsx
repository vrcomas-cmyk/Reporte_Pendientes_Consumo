import { useMemo, useState, type ReactNode } from 'react';
import { ColumnFilterBar, ColumnFilterMenuMulti, passesFilters, type ActiveFilter, type FilterColumn } from '@/modules/analytics/ui';
import { TableHead } from '@/components/ui/table';
import { formatCurrency } from '@/lib/utils';
import { norm } from '@/lib/text';
import { etiquetaCombinacion } from '@/core/enrich';
import { analisisPrecio } from '@/core/politicaPrecios';
import type { Propuesta } from '@/services/preciosService';
import type { Analytics } from '@/modules/analytics/AnalyticsContext';

const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;
const dia = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

/** Qué columnas de filtro cuelgan del embudo de cada encabezado (un encabezado puede filtrar varias: «Material» → código y descripción). */
const COL_FILTRO: Record<string, string[]> = {
  material: ['material', 'descripcion'], sector: ['sector', 'grupo'], condicion: ['condicion'], costo: ['costo'], base: ['base'], calculado: ['calculado'],
  precio: ['precio', 'enviado', 'modificado'], descuento: ['descuento'], cede: ['cede'], margen: ['margen'],
  solicito: ['solicito', 'fecha'], autorizo: ['autorizo', 'fechaaut', 'archivo'],
};

/**
 * Buscador + filtros por CUALQUIER columna + embudo en cada encabezado para las tablas de «Por autorizar» y «Autorizados» (mismo patrón que Seg. de
 * pedidos). `th(clave, etiqueta, derecha)` pinta un encabezado con su embudo; `barra` es el buscador con los chips de filtros.
 */
export function useFiltroPropuestas(lista: readonly Propuesta[], a: Analytics, costoVisible: boolean) {
  const [q, setQ] = useState('');
  const [quick, setQuick] = useState<ActiveFilter[]>([]);

  const cols = useMemo<FilterColumn<Propuesta>[]>(() => {
    const an = (p: Propuesta) => (p.baseAlEnviar ? analisisPrecio(p.precioPropuesto, p.baseAlEnviar, p.costoAlEnviar) : null);
    return [
      { key: 'material', label: 'Material', get: (p) => p.material },
      { key: 'descripcion', label: 'Descripción', get: (p) => a.enrich.matTexto(p.material) || 'Sin descripción' },
      { key: 'sector', label: 'Sector', get: (p) => a.enrich.matSector(p.material) || 'Sin sector' },
      { key: 'grupo', label: 'Grupo de artículo', get: (p) => a.enrich.matGrupo(p.material) || 'Sin grupo' },
      { key: 'condicion', label: 'Condición', get: (p) => (p.condicion ? etiquetaCombinacion(p.condicion) : 'Sin condición') },
      ...(costoVisible ? [{ key: 'costo', label: 'Costo', get: (p: Propuesta) => formatCurrency(p.costoAlEnviar) }] : []),
      { key: 'base', label: 'Base', get: (p) => (p.baseAlEnviar ? formatCurrency(p.baseAlEnviar) : 'Sin base') },
      { key: 'calculado', label: 'Calculado', get: (p) => formatCurrency(p.precioCalculado) },
      { key: 'precio', label: 'Precio', get: (p) => formatCurrency(p.precioPropuesto) },
      { key: 'enviado', label: 'Precio que se mandó', get: (p) => (p.precioEnviado != null ? formatCurrency(p.precioEnviado) : 'Sin dato') },
      { key: 'modificado', label: '¿Modificado por el director?', get: (p) => (p.precioEnviado != null && Math.abs(p.precioEnviado - p.precioPropuesto) >= 0.005 ? 'Modificado' : 'Sin cambio') },
      { key: 'descuento', label: 'Descuento', get: (p) => { const x = an(p); return x ? pct(x.descuento) : 'Sin dato'; } },
      { key: 'cede', label: 'Cede del margen', get: (p) => { const x = an(p); return x ? pct(x.cede) : 'Sin dato'; } },
      { key: 'margen', label: 'Margen', get: (p) => pct((p.precioPropuesto - p.costoAlEnviar) / p.precioPropuesto) },
      { key: 'solicito', label: 'Solicitó', get: (p) => p.solicitadoPor || 'Sin dato' },
      { key: 'fecha', label: 'Fecha de solicitud', get: (p) => dia(p.solicitadoEn) },
      { key: 'autorizo', label: 'Autorizó', get: (p) => p.autorizadoPor || 'Sin dato' },
      { key: 'fechaaut', label: 'Fecha de autorización', get: (p) => dia(p.autorizadoEn) || 'Sin dato' },
      { key: 'archivo', label: 'Archivo del director', get: (p) => p.archivoAutorizacion || 'En la app' },
    ];
  }, [a.enrich, costoVisible]);

  const visibles = useMemo(() => {
    const t = norm(q).toLowerCase();
    return lista.filter((p) => {
      if (t) {
        const heno = `${p.material} ${a.enrich.matTexto(p.material)} ${a.enrich.matSector(p.material)} ${a.enrich.matGrupo(p.material)} ${p.condicion ? etiquetaCombinacion(p.condicion) : ''} ${p.solicitadoPor} ${p.autorizadoPor ?? ''}`.toLowerCase();
        if (!heno.includes(t)) return false;
      }
      return passesFilters(p, cols, quick);
    });
  }, [lista, q, quick, cols, a.enrich]);

  const filtroDe = (k: string) => {
    const claves = COL_FILTRO[k];
    const cs = claves ? cols.filter((c) => claves.includes(c.key)) : [];
    return cs.length ? <ColumnFilterMenuMulti columns={cs} rows={[...lista]} active={quick} onChange={setQuick} /> : undefined;
  };

  /** Encabezado con su embudo de filtro. */
  const th = (k: string, etiqueta: string, derecha = false): ReactNode => (
    <TableHead key={k} className={derecha ? 'text-right' : undefined}>
      <span className={`inline-flex items-center gap-1 ${derecha ? 'justify-end' : ''}`}>{etiqueta}{filtroDe(k)}</span>
    </TableHead>
  );

  const barra = (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <input aria-label="Buscar" className="h-9 w-64 rounded-md border border-border bg-bg-elevated px-2 text-sm" placeholder="Buscar material, descripción, sector, grupo…" value={q} onChange={(e) => setQ(e.target.value)} />
      <ColumnFilterBar columns={cols} rows={[...lista]} active={quick} onChange={setQuick} />
      {visibles.length !== lista.length && <span className="text-xs text-text-faint">Mostrando {visibles.length} de {lista.length}</span>}
    </div>
  );

  return { visibles, barra, th, hayFiltro: q.trim() !== '' || quick.some((f) => f.values.length > 0) };
}
