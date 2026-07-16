import { useEffect, useState } from 'react';
import { History as HistoryIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { reportRepository } from '@/repositories';
import type { HistoryEntry } from '@/core/types';
import { formatDateTime, formatDuration, formatNumber, formatCurrency } from '@/lib/utils';

export function HistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    reportRepository
      .listHistory()
      .then(setEntries)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex h-full flex-col gap-4 p-8">
      <div>
        <h2 className="font-display text-2xl font-semibold">Historial de análisis</h2>
        <p className="text-sm text-text-muted">Cada vez que procesas un reporte diario se guarda un registro aquí.</p>
      </div>
      <Card className="min-h-0 flex-1 overflow-hidden">
        <div className="h-full overflow-auto">
          {!loading && entries.length === 0 ? (
            <CardContent className="flex h-full flex-col items-center justify-center gap-2 text-center text-text-faint">
              <HistoryIcon className="size-6" />
              <p className="text-sm">Aún no hay análisis registrados.</p>
            </CardContent>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Archivo</TableHead>
                  <TableHead>Filas</TableHead>
                  <TableHead>Duración</TableHead>
                  <TableHead>Materiales</TableHead>
                  <TableHead>Valor económico</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{formatDateTime(e.processedAt)}</TableCell>
                    <TableCell className="max-w-xs truncate">{e.fileName}</TableCell>
                    <TableCell className="font-mono">{formatNumber(e.rowCount)}</TableCell>
                    <TableCell className="font-mono">{formatDuration(e.durationMs)}</TableCell>
                    <TableCell className="font-mono">{formatNumber(e.kpis.materialesAnalizados)}</TableCell>
                    <TableCell className="font-mono">{formatCurrency(e.kpis.valorEconomico)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </Card>
    </div>
  );
}
