import { useMemo, useState } from 'react';
import { Copy, Download, Trash2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { formatCurrency, formatNumber, formatFechaCaducidad } from '@/lib/utils';
import { exportXlsxMultiSheet, stamp } from '@/lib/exportXlsx';
import { toast } from '@/store/toastStore';
import { useOfertaLotesStore } from '@/store/ofertaLotesStore';
import { agruparOferta, filasOferta, importeItem, textoCliente, textoEjecutivo } from '@/core/ofertaLotesResumen';

async function copiar(texto: string, que: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success(`${que} copiado`);
  } catch {
    toast.error('No se pudo copiar');
  }
}

/** Resumen de los lotes seleccionados para ofertar, por ejecutivo y cliente: editar cantidades, quitar renglones, bajar Excel o copiar el mensaje. */
export function ResumenOfertaLotes({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const itemsMap = useOfertaLotesStore((s) => s.items);
  const { setCantidad, remove, clear } = useOfertaLotesStore.getState();
  const items = useMemo(() => Object.values(itemsMap), [itemsMap]);
  const grupos = useMemo(() => agruparOferta(items), [items]);
  const [confirmaVaciar, setConfirmaVaciar] = useState(false);
  const total = items.reduce((s, it) => s + importeItem(it), 0);

  const descargar = () => {
    const filas = filasOferta(items);
    const hojas = [{ name: 'Resumen', rows: filas }];
    for (const g of grupos) {
      const f = filas.filter((r) => r.Ejecutivo === g.ejecutivo);
      hojas.push({ name: g.ejecutivo.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Ejecutivo', rows: f });
    }
    void exportXlsxMultiSheet(`ofertas_lotes_${stamp()}.xlsx`, hojas);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle>Resumen de lotes a ofertar · {items.length}{total > 0 ? ` · ${formatCurrency(total)}` : ''}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={descargar} disabled={!items.length} className="gap-1.5"><Download className="size-3.5" /> Descargar Excel</Button>
          <Button size="sm" variant="outline" onClick={() => void copiar(grupos.map(textoEjecutivo).join('\n\n———\n\n'), 'Resumen')} disabled={!items.length} className="gap-1.5"><Copy className="size-3.5" /> Copiar todo</Button>
          {confirmaVaciar ? (
            <span className="flex items-center gap-1.5 text-xs text-danger">
              ¿Quitar los {items.length} lotes seleccionados?
              <Button size="sm" variant="destructive" onClick={() => { clear(); setConfirmaVaciar(false); }}>Sí, vaciar</Button>
              <Button size="sm" variant="outline" onClick={() => setConfirmaVaciar(false)}>Cancelar</Button>
            </span>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setConfirmaVaciar(true)} disabled={!items.length} className="gap-1.5"><Trash2 className="size-3.5" /> Vaciar selección</Button>
          )}
        </div>
        {!items.length ? (
          <p className="py-6 text-sm text-text-muted">No hay lotes seleccionados. Marca “Ofertar” en la lista de candidatos o de otros lotes del cliente.</p>
        ) : (
          <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
            {grupos.map((g) => (
              <section key={g.ejecutivo} className="rounded-lg border border-border">
                <header className="flex items-center justify-between gap-2 border-b border-border bg-bg-inset px-3 py-2">
                  <h3 className="text-sm font-semibold">{g.ejecutivo}</h3>
                  <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => void copiar(textoEjecutivo(g), `Mensaje de ${g.ejecutivo}`)}><Copy className="size-3" /> Copiar para el ejecutivo</Button>
                </header>
                {g.clientes.map((c) => (
                  <div key={c.destinatario} className="px-3 py-2">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{c.cliente} <span className="text-xs text-text-faint">{c.destinatario}</span></span>
                      <Button size="sm" variant="ghost" className="h-6 gap-1 text-xs" onClick={() => void copiar(textoCliente(c), `Mensaje de ${c.cliente}`)}><Copy className="size-3" /> Copiar para el cliente</Button>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Material</TableHead><TableHead>Lote</TableHead><TableHead>Centro</TableHead><TableHead>Caduca</TableHead>
                          <TableHead className="text-right">Disp.</TableHead><TableHead className="w-28 text-right">Cantidad</TableHead>
                          <TableHead className="text-right">Precio oferta</TableHead><TableHead className="text-right">Importe</TableHead><TableHead className="w-8" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {c.items.map((it) => (
                          <TableRow key={it.clave}>
                            <TableCell><span className="font-mono text-xs">{it.material}</span><div className="max-w-56 truncate text-[11px] text-text-faint">{it.desc}</div>{it.viaSustituto && <div className="text-[11px] text-warning">en lugar de {it.viaSustituto}</div>}</TableCell>
                            <TableCell className="text-xs">{it.lote || '—'}</TableCell>
                            <TableCell className="text-xs">{it.centro} · {it.almacen || '—'}</TableCell>
                            <TableCell className="whitespace-nowrap text-xs">{formatFechaCaducidad(it.caducidad)}</TableCell>
                            <TableCell className="text-right">{formatNumber(it.disponible)}</TableCell>
                            <TableCell className="text-right">
                              <input
                                type="number" min={0} max={it.disponible} value={it.cantidad}
                                onChange={(e) => setCantidad(it.clave, Math.min(it.disponible, Number(e.target.value) || 0))}
                                className="h-7 w-24 rounded-md border border-border bg-bg-elevated px-1.5 text-right text-xs"
                                aria-label={`Cantidad de ${it.material} lote ${it.lote}`}
                              />
                            </TableCell>
                            <TableCell className="text-right">{it.precioOferta ? formatCurrency(it.precioOferta) : '—'}</TableCell>
                            <TableCell className="text-right">{importeItem(it) ? formatCurrency(importeItem(it)) : '—'}</TableCell>
                            <TableCell><button type="button" title="Quitar" onClick={() => remove(it.clave)} className="text-text-faint hover:text-danger"><X className="size-3.5" /></button></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ))}
              </section>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
