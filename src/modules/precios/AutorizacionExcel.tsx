import { useMemo, useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { formatCurrency } from '@/lib/utils';
import { stamp } from '@/lib/exportXlsx';
import { exportarParaDirector, leerArchivoDirector } from '@/lib/autorizacionXlsx';
import { toast } from '@/store/toastStore';
import { etiquetaCombinacion } from '@/core/enrich';
import { evaluarAutorizacion, filasParaDirector, leerArchivo, type EstadoRenglon, type ResultadoAutorizacion } from '@/core/autorizacionExcel';
import { aplicarAutorizacion, type DecisionArchivo, type Propuesta } from '@/services/preciosService';
import type { Analytics } from '@/modules/analytics/AnalyticsContext';

const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;
const ESTADO_TXT: Record<EstadoRenglon, { txt: string; cls: string }> = {
  aceptado: { txt: 'Aceptado', cls: 'text-success' },
  modificado: { txt: 'Modificado', cls: 'text-warning' },
  'no-autorizado': { txt: 'No autorizado', cls: 'text-text-muted' },
  error: { txt: 'Error', cls: 'text-danger' },
};

/** Autorización del director por Excel: exporta lo pendiente, carga el archivo que regresa (vista previa → aplicar). Cargar/aplicar es solo de admin. */
export function AutorizacionExcel({ a, pendientes, isAdmin, email, costoVisible, onAplicado }: {
  a: Analytics; pendientes: Propuesta[]; isAdmin: boolean; email: string; costoVisible: boolean; onAplicado: () => Promise<void> | void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState('');
  const [resultado, setResultado] = useState<ResultadoAutorizacion | null>(null);
  const [filtro, setFiltro] = useState<'todos' | EstadoRenglon>('todos');
  const [ocupado, setOcupado] = useState(false);

  function exportar() {
    const filas = filasParaDirector(pendientes, {
      descripcion: (m) => a.enrich.matTexto(m), sector: (m) => a.enrich.matSector(m), grupo: (m) => a.enrich.matGrupo(m),
      condicionTxt: etiquetaCombinacion, mostrarCosto: costoVisible,
    });
    exportarParaDirector(`precios-por-autorizar-${stamp()}.xlsx`, filas, costoVisible);
  }

  async function alElegir(file: File | undefined) {
    if (inputRef.current) inputRef.current.value = '';
    if (!file) return;
    try {
      const filas = leerArchivo(await leerArchivoDirector(file));
      if (!filas.length) { toast.warning('El archivo no trae renglones'); return; }
      setArchivo(file.name);
      setFiltro('todos');
      setResultado(evaluarAutorizacion(filas, pendientes, etiquetaCombinacion));
    } catch (e) {
      toast.error('No se pudo leer el archivo', e instanceof Error ? e.message : String(e));
    }
  }

  async function aplicar() {
    if (!resultado) return;
    const decisiones: DecisionArchivo[] = [];
    for (const r of resultado.renglones) {
      if (!r.propuesta) continue;
      const original = pendientes.find((p) => p.id === r.propuesta?.id);
      if (!original) continue;
      if ((r.estado === 'aceptado' || r.estado === 'modificado') && r.autorizado != null) decisiones.push({ propuesta: original, estado: 'autorizado', precio: r.autorizado, comentario: r.comentario });
      else if (r.estado === 'no-autorizado') decisiones.push({ propuesta: original, estado: 'rechazado', comentario: r.comentario });
    }
    if (!decisiones.length) { toast.warning('No hay nada que aplicar'); return; }
    setOcupado(true);
    try {
      const res = await aplicarAutorizacion(decisiones, email, archivo);
      if (res.fallidas.length) toast.warning('Aplicado con observaciones', `${res.aplicadas} aplicados; ${res.fallidas.length} no se pudieron (${res.fallidas[0]?.material}: ${res.fallidas[0]?.motivo}).`);
      else toast.success('Autorización aplicada', `${res.aplicadas} precio(s) del archivo ${archivo}.`);
      setResultado(null);
      await onAplicado();
    } catch (e) {
      toast.error('No se pudo aplicar', e instanceof Error ? e.message : String(e));
    } finally { setOcupado(false); }
  }

  const visibles = useMemo(() => (resultado ? resultado.renglones.filter((r) => filtro === 'todos' || r.estado === filtro) : []), [resultado, filtro]);
  const res = resultado?.resumen;
  const aplicables = res ? res.aceptados + res.modificados + res.noAutorizados : 0;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={!pendientes.length} onClick={exportar} title="Excel con los precios pendientes para que el director llene «Precio autorizado»">
          <Download className="size-4" /> Exportar para el director ({pendientes.length})
        </Button>
        {isAdmin && (
          <>
            <Button size="sm" variant="outline" disabled={!pendientes.length || ocupado} onClick={() => inputRef.current?.click()} title="Carga el Excel que regresó el director; antes de aplicar se muestra una vista previa">
              <Upload className="size-4" /> Cargar autorización (.xlsx)
            </Button>
            <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" aria-label="Archivo del director" onChange={(e) => void alElegir(e.target.files?.[0])} />
          </>
        )}
      </div>

      <Dialog open={!!resultado} onOpenChange={(o) => { if (!o && !ocupado) setResultado(null); }}>
        <DialogContent className="max-h-[90vh] max-w-[min(72rem,95vw)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Vista previa de la autorización</DialogTitle>
            <DialogDescription>{archivo} · nada se aplica hasta que confirmes.</DialogDescription>
          </DialogHeader>
          {res && (
            <>
              <div className="mb-3 flex flex-wrap gap-2 text-sm">
                {([
                  ['aceptado', res.aceptados], ['modificado', res.modificados], ['no-autorizado', res.noAutorizados], ['error', res.errores],
                ] as const).map(([k, n]) => (
                  <button key={k} type="button" onClick={() => setFiltro(filtro === k ? 'todos' : k)}
                    className={`rounded-full border px-3 py-1 ${filtro === k ? 'border-accent bg-accent-soft' : 'border-border'} ${ESTADO_TXT[k].cls}`}>
                    {ESTADO_TXT[k].txt}: <b>{n}</b>
                  </button>
                ))}
                {res.noVinieron > 0 && <span className="rounded-full border border-border px-3 py-1 text-text-muted">No venían en el archivo (siguen pendientes): <b>{res.noVinieron}</b></span>}
              </div>
              <Table wrapperClassName="max-h-[50vh] rounded-lg border border-border" className="text-xs">
                <TableHeader className="sticky top-0 z-10 bg-bg-elevated">
                  <TableRow>
                    <TableHead>Fila</TableHead><TableHead>Material</TableHead><TableHead>Condición</TableHead>
                    <TableHead className="text-right">Propuesto</TableHead><TableHead className="text-right">Autorizado</TableHead><TableHead className="text-right">Dif.</TableHead>
                    <TableHead className="text-right">Descuento</TableHead><TableHead className="text-right">Cede del margen</TableHead><TableHead className="text-right">Margen</TableHead>
                    <TableHead>Resultado</TableHead><TableHead>Nota</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibles.slice(0, 300).map((r) => (
                    <TableRow key={r.fila} className={r.estado === 'error' ? 'bg-danger/5' : undefined}>
                      <TableCell className="tabular-nums">{r.fila}</TableCell>
                      <TableCell className="font-mono">{r.propuesta?.material ?? '—'}</TableCell>
                      <TableCell>{r.propuesta ? (r.propuesta.concepto === 'base' ? 'Base' : etiquetaCombinacion(r.propuesta.condicion)) : '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.propuesta ? formatCurrency(r.propuesta.precioPropuesto) : '—'}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{r.autorizado != null ? formatCurrency(r.autorizado) : '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.diferencia != null && r.estado === 'modificado' ? `${r.diferencia > 0 ? '+' : '−'}${formatCurrency(Math.abs(r.diferencia))}` : '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.descuento != null ? pct(r.descuento) : '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.cede != null ? pct(r.cede) : '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.margen != null ? pct(r.margen) : '—'}</TableCell>
                      <TableCell className={ESTADO_TXT[r.estado].cls}>{ESTADO_TXT[r.estado].txt}</TableCell>
                      <TableCell className="max-w-64 text-text-muted">{r.error ?? r.comentario}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {visibles.length > 300 && <p className="text-xs text-text-faint">Mostrando 300 de {visibles.length}; filtra por resultado para ver el resto.</p>}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-text-muted">
                  Se autorizarán <b>{res.aceptados + res.modificados}</b> ({res.modificados} con precio modificado), se rechazarán <b>{res.noAutorizados}</b>
                  {res.errores > 0 && <>, se omitirán <b className="text-danger">{res.errores}</b> con error</>}.
                </p>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" disabled={ocupado} onClick={() => setResultado(null)}>Cancelar</Button>
                  <Button size="sm" disabled={ocupado || !aplicables} onClick={aplicar}>{ocupado ? 'Aplicando…' : `Aplicar (${aplicables})`}</Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
