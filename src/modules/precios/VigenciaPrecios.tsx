import { Input } from '@/components/ui/input';
import { useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/feedback/EmptyState';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { formatCurrency } from '@/lib/utils';
import { toast } from '@/store/toastStore';
import { StatePill } from '@/modules/analytics/ui';
import { etiquetaCombinacion } from '@/core/enrich';
import { estadoVigencia, fijarVigencia, historicoAutorizados, type Propuesta } from '@/services/preciosService';

/** Fechas de vigencia de un precio autorizado. Sin fechas rige hasta que se autorice otro; al vencer vuelve a regir el anterior. */
export function VigenciaCelda({ p, editable, onGuardado }: { p: Propuesta; editable: boolean; onGuardado: () => void }) {
  const [desde, setDesde] = useState(p.vigenteDesde ?? '');
  const [hasta, setHasta] = useState(p.vigenteHasta ?? '');
  const [ocupado, setOcupado] = useState(false);
  const cambio = desde !== (p.vigenteDesde ?? '') || hasta !== (p.vigenteHasta ?? '');
  if (!editable) return <span className="text-xs">{p.vigenteHasta ? `hasta ${p.vigenteHasta}` : 'sin límite'}</span>;

  async function guardar() {
    setOcupado(true);
    try {
      await fijarVigencia([p.id], desde || null, hasta || null);
      toast.success('Vigencia guardada', hasta ? `Al pasar el ${hasta} vuelve a regir el precio anterior.` : 'Sin fecha final.');
      onGuardado();
    } catch (e) {
      toast.error('No se pudo guardar la vigencia', (e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="flex items-center gap-1 text-xs">
      <Input type="date" aria-label="Vigente desde" title="Vigente desde (vacío = ya)" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-8 w-auto px-2" />
      <span className="text-text-faint">→</span>
      <Input type="date" aria-label="Vigente hasta" title="Vigente hasta (vacío = sin límite; después vuelve el precio anterior)" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-8 w-auto px-2" />
      {cambio && <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => void guardar()} aria-label="Guardar vigencia"><Save className="size-3.5" /></Button>}
    </div>
  );
}

/** Todos los precios autorizados de cada material + condición, del más reciente al más antiguo, comparados contra el que rige hoy. */
export function HistorialPrecios({ propuestas, matTexto, filtro }: { propuestas: Propuesta[]; matTexto: (m: string) => string; filtro: string }) {
  const grupos = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    return [...historicoAutorizados(propuestas).entries()]
      .filter(([k, l]) => !q || k.toLowerCase().includes(q) || matTexto(l[0].material).toLowerCase().includes(q))
      .sort((x, y) => (y[1][0].autorizadoEn ?? '').localeCompare(x[1][0].autorizadoEn ?? ''));
  }, [propuestas, matTexto, filtro]);

  if (!grupos.length) return <EmptyState title="Sin histórico" description="Aquí aparecen todos los precios autorizados de cada material y condición, también los que ya no rigen." />;
  return (
    <div className="space-y-3">
      {grupos.map(([k, lista]) => {
        // Rige el más reciente de los que están dentro de su vigencia.
        const rige = lista.find((p) => estadoVigencia(p) === 'vigente');
        return (
          <Card key={k} className="p-3">
            <div className="mb-2 flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-sm">{lista[0].material}</span>
              <span className="text-xs text-text-faint">{matTexto(lista[0].material)}</span>
              <span className="text-xs">{etiquetaCombinacion(lista[0].condicion)}</span>
            </div>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Autorizado</TableHead><TableHead className="text-right">Precio</TableHead><TableHead className="text-right">vs. el que rige</TableHead>
                <TableHead>Vigencia</TableHead><TableHead>Estado</TableHead><TableHead>Autorizó</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {lista.map((p) => {
                  const est = estadoVigencia(p);
                  const esElQueRige = p.id === rige?.id;
                  const dif = rige && !esElQueRige ? (p.precioPropuesto - rige.precioPropuesto) / rige.precioPropuesto : null;
                  const [txt, cls] = esElQueRige ? ['Rige hoy', 'verde'] : est === 'programado' ? ['Programado', 'vio'] : est === 'vencido' ? ['Vencido', 'gris'] : ['Reemplazado', 'gris'];
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs">{(p.autorizadoEn ?? '').slice(0, 10)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(p.precioPropuesto)}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs">{dif == null ? '—' : `${dif > 0 ? '+' : ''}${Math.round(dif * 1000) / 10}%`}</TableCell>
                      <TableCell className="text-xs">{p.vigenteDesde || p.vigenteHasta ? `${p.vigenteDesde ?? '…'} → ${p.vigenteHasta ?? 'sin límite'}` : 'sin límite'}</TableCell>
                      <TableCell><StatePill label={txt} cls={cls} /></TableCell>
                      <TableCell className="text-xs">{p.autorizadoPor}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        );
      })}
    </div>
  );
}
