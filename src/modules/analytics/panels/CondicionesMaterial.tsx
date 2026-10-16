import { useMemo } from 'react';
import { Section, vigenciaTxt, precioPorCondicion } from './_shared';
import { Chip, StatePill } from '../ui';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { condicionesDeMaterial, type FilaCondicionMaterial } from '@/core/invCondicionLibros';
import { formatNumber, formatCurrency, formatFechaCaducidad } from '@/lib/utils';
import { norm } from '../helpers';
import type { Panel } from '@/store/panelStore';
import type { Analytics } from '../AnalyticsContext';

const CLS: Record<string, string> = { 'Corta caducidad': 'rojo', PNC: 'amb', Sustituto: 'azul', General: 'gris' };

type FilaUnificada = FilaCondicionMaterial & { precio: number };

/** UNA sola tabla "Lotes y condiciones" de un material (libros Inv_Condicion + Disponibilidad), una fila por lote/centro/condición:
 * Corta caducidad (lotes con caducidad y centro/almacén), PNC (lotes con su condición), Revision (centro/almacén con su Status),
 * Sustituto (el material sustituto) y "General" (los demás lotes del inventario, sin condición especial). Con su precio por lote
 * o, si no lo trae, el precio oferta de su condición. Aparece solo si el material tiene alguna condición o lote. */
export function CondicionesMaterialSection({ a, material, push }: { a: Analytics; material: string; push: (p: Panel) => void }) {
  const filas = useMemo<FilaUnificada[]>(() => {
    const precios = precioPorCondicion(a, material);
    const precioDe = (cond: string) => precios.find((p) => p.condicion === cond)?.precio ?? 0;
    const cond = condicionesDeMaterial(material, {
      filas: a.invCondicionLibros, lotes: a.lotesLibros, detalle: a.detalleLotesLibros, sustituciones: a.sustitucionesLibros, invRevision: a.invRevisionLibros,
    });
    const cubiertos = new Set(cond.filter((f) => f.lote).map((f) => `${norm(f.centro)}|${norm(f.almacen)}|${norm(f.lote)}`));
    const lotesPrecio = new Map(a.lotes.filter((l) => norm(l.material) === norm(material)).map((l) => [`${norm(l.centro)}|${norm(l.almacen)}|${norm(l.lote)}`, l.precioOferta ?? 0]));
    const conPrecio = cond.map((f) => ({ ...f, precio: lotesPrecio.get(`${norm(f.centro)}|${norm(f.almacen)}|${norm(f.lote)}`) || precioDe(f.condicion) }));
    const generales: FilaUnificada[] = a.lotes
      .filter((l) => norm(l.material) === norm(material) && !cubiertos.has(`${norm(l.centro)}|${norm(l.almacen)}|${norm(l.lote)}`))
      .map((l) => ({ condicion: 'General', centro: l.centro, almacen: l.almacen, lote: l.lote, caducidad: l.fechaCaducidad ?? '', cantidad: l.cantidadDisp, detalle: '', precio: l.precioOferta ?? 0 }));
    return [...conPrecio, ...generales].filter((f) => f.cantidad > 0);
  }, [a, material]);
  if (!filas.length) return null;
  return (
    <Section title={`Lotes y condiciones (${filas.length})`}>
      <Table wrapperClassName="max-h-72 rounded-lg border border-border">
        <TableHeader>
          <TableRow>
            <TableHead>Condición</TableHead><TableHead>Centro/Alm</TableHead><TableHead>Lote</TableHead><TableHead>Caducidad</TableHead>
            <TableHead className="text-right">Cantidad</TableHead><TableHead className="text-right">Precio</TableHead><TableHead>Detalle</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filas.map((f, i) => {
            const vg = f.caducidad ? vigenciaTxt(f.caducidad) : null;
            return (
              <TableRow key={`${f.condicion}|${f.centro}|${f.almacen}|${f.lote}|${i}`}>
                <TableCell><StatePill label={f.condicion} cls={CLS[f.condicion] ?? 'gris'} /></TableCell>
                <TableCell>{f.centro ? `${f.centro}${f.almacen ? ` / ${f.almacen}` : ''}` : '—'}</TableCell>
                <TableCell>{f.lote ? <Chip title="Ver el detalle del lote" onClick={() => push({ type: 'lote', material, lote: f.lote })}>{f.lote}</Chip> : '—'}</TableCell>
                <TableCell>{f.caducidad ? formatFechaCaducidad(f.caducidad) : '—'}{vg && <div className="text-[11px]"><StatePill label={vg.txt} cls={vg.cls} /></div>}</TableCell>
                <TableCell className="text-right">{formatNumber(f.cantidad)}</TableCell>
                <TableCell className="text-right font-mono">{f.precio ? formatCurrency(f.precio) : '—'}</TableCell>
                <TableCell>
                  {f.relacionado
                    ? <><Chip title="Ver el detalle del sustituto" onClick={() => push({ type: 'material', material: f.relacionado!.material })}>{f.relacionado.material}</Chip> <span className="text-[11px] text-text-faint">{f.relacionado.texto}</span></>
                    : f.detalle || (f.condicion === 'PNC' || f.condicion === 'Corta caducidad' || f.condicion === 'General' ? '' : <span className="text-[11px] text-text-faint">1030+1031+1060</span>)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Section>
  );
}
