import { useMemo, useRef, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Search, Download, ChevronUp, ChevronDown, ChevronsUpDown, Inbox } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useDataStore } from '@/store/dataStore';
import type { Sugerencia } from '@/core/types';
import { formatCurrency, formatNumber, formatFechaCaducidad } from '@/lib/utils';
import { ZoomControl, useZoom } from '@/modules/analytics/ui';

const columns: ColumnDef<Sugerencia>[] = [
  { accessorKey: 'materialBase', header: 'Material' },
  { accessorKey: 'descripcionSolicitada', header: 'Descripción' },
  { accessorKey: 'fuente', header: 'Fuente' },
  { accessorKey: 'centroPedido', header: 'Centro' },
  { accessorKey: 'pedido', header: 'Pedido' },
  { accessorKey: 'cantidadPendiente', header: 'Cant. pendiente', cell: (i) => formatNumber(i.getValue() as number) },
  { accessorKey: 'precio', header: 'Precio', cell: (i) => formatCurrency(i.getValue() as number) },
  { accessorKey: 'disponible', header: 'Disponible', cell: (i) => formatNumber(i.getValue() as number) },
  { accessorKey: 'mesesInventario', header: 'Meses inv.', cell: (i) => formatNumber(i.getValue() as number, 1) },
  { accessorKey: 'bloqueado', header: 'Bloqueado' },
];

export function ResultsPage() {
  const activeAnalysis = useDataStore((s) => s.activeAnalysis);
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'cantidadPendiente', desc: true }]);
  const [fuenteFilter, setFuenteFilter] = useState<string>('todas');
  const [bloqueadoFilter, setBloqueadoFilter] = useState<string>('todos');
  const [selected, setSelected] = useState<Sugerencia | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const zoom = useZoom();

  const rows = activeAnalysis?.sugerencias ?? [];

  const fuentes = useMemo(() => ['todas', ...new Set(rows.map((r) => r.fuente).filter(Boolean))], [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (fuenteFilter !== 'todas' && r.fuente !== fuenteFilter) return false;
      if (bloqueadoFilter === 'si' && !r.bloqueado) return false;
      if (bloqueadoFilter === 'no' && r.bloqueado) return false;
      if (globalFilter) {
        const q = globalFilter.toLowerCase();
        return (
          r.materialBase.toLowerCase().includes(q) ||
          r.descripcionSolicitada.toLowerCase().includes(q) ||
          r.pedido.toLowerCase().includes(q) ||
          r.destinatario.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [rows, fuenteFilter, bloqueadoFilter, globalFilter]);

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const tableRows = table.getRowModel().rows;

  const virtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 36,
    overscan: 12,
  });

  function exportToExcel() {
    const data = filtered.map((r) => ({
      Material: r.materialBase,
      Descripcion: r.descripcionSolicitada,
      Fuente: r.fuente,
      Centro: r.centroPedido,
      Pedido: r.pedido,
      'Cantidad pendiente': r.cantidadPendiente,
      Precio: r.precio,
      Disponible: r.disponible,
      'Meses inventario': r.mesesInventario,
      Bloqueado: r.bloqueado,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sugerencias');
    XLSX.writeFile(wb, `sugerencias_export_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  if (!activeAnalysis) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <Inbox className="size-8 text-text-faint" />
        <p className="text-sm text-text-muted">No hay resultados todavía.</p>
        <Button asChild>
          <Link to="/carga">Ir a Carga</Link>
        </Button>
      </div>
    );
  }

  const items = virtualizer.getVirtualItems();
  const paddingTop = items.length ? items[0].start : 0;
  const paddingBottom = items.length ? virtualizer.getTotalSize() - items[items.length - 1].end : 0;

  return (
    <div className="flex h-full flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold">Resultados</h2>
          <p className="text-sm text-text-muted">Todas las Sugerencias · {formatNumber(filtered.length)} de {formatNumber(rows.length)} filas</p>
        </div>
        <Button onClick={exportToExcel} variant="outline">
          <Download className="size-4" /> Exportar a Excel
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 size-3.5 text-text-faint" />
          <Input placeholder="Buscar material, pedido, cliente…" value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)} className="pl-8" />
        </div>
        <select
          value={fuenteFilter}
          onChange={(e) => setFuenteFilter(e.target.value)}
          className="h-9 rounded-md border border-border bg-bg-elevated px-2 text-sm"
        >
          {fuentes.map((f) => (
            <option key={f} value={f}>
              {f === 'todas' ? 'Todas las fuentes' : f}
            </option>
          ))}
        </select>
        <select
          value={bloqueadoFilter}
          onChange={(e) => setBloqueadoFilter(e.target.value)}
          className="h-9 rounded-md border border-border bg-bg-elevated px-2 text-sm"
        >
          <option value="todos">Bloqueado: todos</option>
          <option value="si">Solo bloqueados</option>
          <option value="no">Solo no bloqueados</option>
        </select>
        <div className="ml-auto"><ZoomControl level={zoom.level} setLevel={zoom.setLevel} /></div>
      </div>

      <Card className="min-h-0 flex-1 overflow-hidden">
        <div ref={scrollRef} className="h-full overflow-auto">
          <Table className={zoom.className} wrapperClassName="overflow-visible">
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  {hg.headers.map((h) => {
                    const s = h.column.getIsSorted();
                    const Icon = s === 'asc' ? ChevronUp : s === 'desc' ? ChevronDown : ChevronsUpDown;
                    return (
                      <TableHead key={h.id} onClick={h.column.getToggleSortingHandler()} className="cursor-pointer select-none hover:text-text-muted">
                        <span className="inline-flex items-center gap-1">
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          <Icon className={`size-3 ${s ? 'opacity-100 text-accent' : 'opacity-40'}`} />
                        </span>
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {paddingTop > 0 && (
                <tr>
                  <td style={{ height: paddingTop }} colSpan={columns.length} />
                </tr>
              )}
              {items.map((vi) => {
                const row = tableRows[vi.index];
                return (
                  <TableRow key={row.id} className="cursor-pointer" onClick={() => setSelected(row.original)}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                    ))}
                  </TableRow>
                );
              })}
              {paddingBottom > 0 && (
                <tr>
                  <td style={{ height: paddingBottom }} colSpan={columns.length} />
                </tr>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent>
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.materialBase}</SheetTitle>
                <SheetDescription>{selected.descripcionSolicitada}</SheetDescription>
              </SheetHeader>
              <div className="mt-4 flex flex-col gap-2 text-sm">
                <Badge variant="outline" className="w-fit">Fuente: {selected.fuente}</Badge>
                {Object.entries({
                  Pedido: selected.pedido,
                  Solicitante: selected.solicitante,
                  Destinatario: selected.destinatario,
                  'Razón social': selected.razonSocial,
                  'Centro pedido': selected.centroPedido,
                  Almacén: selected.almacen,
                  'Cantidad pedido': formatNumber(selected.cantidadPedido),
                  'Cantidad pendiente': formatNumber(selected.cantidadPendiente),
                  'Cantidad a ofertar': formatNumber(selected.cantidadOfertar),
                  Precio: formatCurrency(selected.precio),
                  'Consumo promedio': formatNumber(selected.consumoPromedio),
                  'Material sugerido': selected.materialSugerido,
                  'Centro sugerido': selected.centroSugerido,
                  Disponible: formatNumber(selected.disponible),
                  Lote: selected.lote,
                  'Fecha caducidad': formatFechaCaducidad(selected.fechaCaducidad),
                  'Meses inventario': formatNumber(selected.mesesInventario, 1),
                  'En tránsito': formatNumber(selected.cantTransito),
                  Bloqueado: selected.bloqueado || 'No',
                }).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between border-b border-border/60 py-1.5">
                    <span className="text-text-faint">{k}</span>
                    <span className="font-medium">{String(v) || '—'}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
