import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableCell, SortableTableHead } from '@/components/ui/table';
import { useAnalytics } from '@/modules/analytics/AnalyticsContext';
import { useConocimientoStore } from '@/store/conocimientoStore';
import { usePanelStore } from '@/store/panelStore';
import { useSort } from '@/hooks/useSort';
import { usePersistedState } from '@/hooks/usePersistedState';
import { matchesQuery, norm } from '@/modules/analytics/helpers';
import { ColumnFilterBar, ColumnFilterMenu, passesFilters, StatePill, type ActiveFilter, type FilterColumn } from '@/modules/analytics/ui';
import { EmptyState } from '@/components/feedback/EmptyState';
import { CargaMasivaDialog } from './components/CargaMasivaDialog';

interface DestinatarioRow {
  dest: string;
  solicitante: string;
  razonSocial: string;
  grupoCliente: string;
  ejecutivo: string;
}

/** Índice de "Ofertas por Cliente" — un renglón por Destinatario, cruzando
 * los reportes ya cargados (Consumo trae solicitante/destinatario/razón
 * social/grupo) con el catálogo de ejecutivos por `gpoCte`. No se crea
 * catálogo nuevo. Clic en una fila abre las reglas de aceptación de ese
 * destinatario (regla global + overrides por material). */
export function OfertasClientePage() {
  const a = useAnalytics();
  const reglas = useConocimientoStore((s) => s.reglas);
  const open = usePanelStore((s) => s.open);
  const [q, setQ] = useState('');
  const [quick, setQuick] = usePersistedState<ActiveFilter[]>('ofertasCliente.quick', []);
  const [cargaMasivaOpen, setCargaMasivaOpen] = useState(false);

  const destinatarios = useMemo(() => {
    const m = new Map<string, DestinatarioRow>();
    for (const r of a.result?.consumo ?? []) {
      const d = norm(r.destinatario);
      if (!d || m.has(d)) continue;
      m.set(d, {
        dest: r.destinatario,
        solicitante: r.solicitante,
        razonSocial: r.razonSocial,
        grupoCliente: a.enrich.grupoCliente(r.grpCliente) || r.grpCliente,
        ejecutivo: a.enrich.ejecutivoNombre(r.gpoVdor),
      });
    }
    return [...m.values()];
  }, [a.result, a.enrich]);

  const reglasPorDest = useMemo(() => {
    const m = new Map<string, typeof reglas>();
    for (const r of reglas) {
      const d = norm(r.dest);
      const arr = m.get(d);
      if (arr) arr.push(r); else m.set(d, [r]);
    }
    return m;
  }, [reglas]);

  const filterCols: FilterColumn<DestinatarioRow>[] = useMemo(() => [
    { key: 'solicitante', label: 'Solicitante', get: (r) => r.solicitante },
    { key: 'destinatario', label: 'Destinatario', get: (r) => r.dest },
    { key: 'razonSocial', label: 'Razón Social', get: (r) => r.razonSocial },
    { key: 'grupoCliente', label: 'Grupo de cliente', get: (r) => r.grupoCliente },
    { key: 'ejecutivo', label: 'Ejecutivo', get: (r) => r.ejecutivo },
  ], []);

  const filtered = useMemo(() => destinatarios.filter((r) => {
    if (q && !matchesQuery(q, `${r.dest} ${r.solicitante} ${r.razonSocial}`)) return false;
    if (!passesFilters(r, filterCols, quick)) return false;
    return true;
  }), [destinatarios, q, quick, filterCols]);

  const sortAcc = useMemo(() => ({
    solicitante: (r: DestinatarioRow) => r.solicitante,
    dest: (r: DestinatarioRow) => r.dest,
    razonSocial: (r: DestinatarioRow) => r.razonSocial,
    grupoCliente: (r: DestinatarioRow) => r.grupoCliente,
    ejecutivo: (r: DestinatarioRow) => r.ejecutivo,
    reglas: (r: DestinatarioRow) => reglasPorDest.get(norm(r.dest))?.length ?? 0,
  }), [reglasPorDest]);
  const { sorted, sortKey, dir, toggleSort } = useSort(filtered, sortAcc);

  if (!a.result?.consumo?.length) {
    return <EmptyState title="Sin datos de Consumo cargados" description="Ofertas por Cliente cruza los destinatarios del reporte de Consumo — carga un análisis primero." action={{ to: '/carga', label: 'Ir a Carga' }} />;
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-2xl font-semibold">Ofertas por Cliente</h2>
          <p className="text-sm text-text-muted">{sorted.length} destinatario(s) · clic en una fila para configurar sus reglas de aceptación</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setCargaMasivaOpen(true)}>Traer clientes del ejecutivo…</Button>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <div className="relative w-64"><Search className="absolute left-2.5 top-2.5 size-3.5 text-text-faint" />
          <Input placeholder="Buscar destinatario…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" /></div>
      </div>

      <ColumnFilterBar columns={filterCols} rows={destinatarios} active={quick} onChange={setQuick} />

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border">
        <Table wrapperClassName="overflow-visible">
          <TableHeader>
            <TableRow>
              <SortableTableHead sortKey="solicitante" activeKey={sortKey} dir={dir} onSort={toggleSort} filter={<ColumnFilterMenu column={filterCols[0]} rows={destinatarios} active={quick} onChange={setQuick} />}>Solicitante</SortableTableHead>
              <SortableTableHead sortKey="dest" activeKey={sortKey} dir={dir} onSort={toggleSort} filter={<ColumnFilterMenu column={filterCols[1]} rows={destinatarios} active={quick} onChange={setQuick} />}>Destinatario</SortableTableHead>
              <SortableTableHead sortKey="razonSocial" activeKey={sortKey} dir={dir} onSort={toggleSort}>Razón Social</SortableTableHead>
              <SortableTableHead sortKey="grupoCliente" activeKey={sortKey} dir={dir} onSort={toggleSort} filter={<ColumnFilterMenu column={filterCols[3]} rows={destinatarios} active={quick} onChange={setQuick} />}>Grupo de cliente</SortableTableHead>
              <SortableTableHead sortKey="ejecutivo" activeKey={sortKey} dir={dir} onSort={toggleSort} filter={<ColumnFilterMenu column={filterCols[4]} rows={destinatarios} active={quick} onChange={setQuick} />}>Ejecutivo</SortableTableHead>
              <SortableTableHead sortKey="reglas" activeKey={sortKey} dir={dir} onSort={toggleSort}>Estado</SortableTableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((r) => {
              const propias = reglasPorDest.get(norm(r.dest)) ?? [];
              const condiciones = new Set<string>();
              propias.forEach((x) => x.condiciones.forEach((c) => condiciones.add(c)));
              return (
                <TableRow key={r.dest} className="cursor-pointer" onClick={() => open({ type: 'reglasAceptacion', dest: r.dest, razonSocial: r.razonSocial })}>
                  <TableCell className="text-xs">{r.solicitante || '—'}</TableCell>
                  <TableCell className="font-mono text-xs">{r.dest}</TableCell>
                  <TableCell className="max-w-56 truncate">{r.razonSocial || '—'}</TableCell>
                  <TableCell className="text-xs">{r.grupoCliente || '—'}</TableCell>
                  <TableCell className="text-xs">{r.ejecutivo || '—'}</TableCell>
                  <TableCell>
                    {propias.length === 0 ? (
                      <StatePill label="Sin configurar" cls="gris" />
                    ) : (
                      <div className="flex flex-wrap items-center gap-1">
                        <StatePill label={`${propias.length} regla(s)`} cls="verde" />
                        {[...condiciones].map((c) => <span key={c} className="rounded-full bg-bg-inset px-1.5 py-0.5 text-[10px] text-text-faint">{c}</span>)}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <CargaMasivaDialog open={cargaMasivaOpen} onClose={() => setCargaMasivaOpen(false)} destinatarios={destinatarios} />
    </div>
  );
}
