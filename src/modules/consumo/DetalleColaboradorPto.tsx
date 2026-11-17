import { useMemo, useState } from 'react';
import { SegmentedControl } from '@/components/layout/report';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { usePersistedState } from '@/hooks/usePersistedState';
import { cn, formatCurrency } from '@/lib/utils';
import { mesLabel } from '@/core/resumenFac';
import { desgloseColaborador, mesPorOmision } from '@/core/ventasPto';
import type { Analytics } from '@/modules/analytics/AnalyticsContext';
import { claseCumpl } from './cumplimiento';
import { useDetalleColaboradorPto, type ArgsDetalleColaborador } from './useDetalleColaboradorPto';

const pct = (c: number | null): string => (c == null ? '—' : `${Math.round(c * 100)}%`);

/** Presupuesto y venta de UN colaborador (gpo. vendedor): una fila por mes y, al elegir un mes, su desglose por sector o por grupo de artículo.
 *  Es el mismo contenido en la sección «Cumplimiento por» (compacto) y en el panel lateral. */
export function DetalleColaboradorPto({ a, compacto = false, ...args }: { a: Pick<Analytics, 'rf' | 'enrich'>; compacto?: boolean } & ArgsDetalleColaborador) {
  const d = useDetalleColaboradorPto(a, args);
  const [por, setPor] = usePersistedState<'sector' | 'grupo'>('facturacion.cumpl.detalle.por', 'sector');
  const [elegido, setElegido] = useState('');
  // El mes elegido debe existir en la lista actual (cambia con el periodo o el colaborador): si no, el último con venta.
  const mes = d.meses.some((m) => m.mes === elegido) ? elegido : mesPorOmision(d.meses);
  const desglose = useMemo(() => (mes ? desgloseColaborador(d.ventas, d.pto, mes, por, d.resolver) : []), [d.ventas, d.pto, mes, por, d.resolver]);
  const total = useMemo(() => {
    const ventas = d.meses.reduce((s, m) => s + m.ventas, 0);
    const presupuesto = d.meses.reduce((s, m) => s + m.presupuesto, 0);
    return { ventas, presupuesto, cumplimiento: presupuesto > 0 ? ventas / presupuesto : null };
  }, [d.meses]);
  const alto = compacto ? 'max-h-52' : 'max-h-72';

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="font-display text-base font-semibold">{d.nombre || `Gpo. vendedor ${d.codigo}`}</p>
        <p className="text-xs text-text-muted">
          Gpo. vendedor {d.codigo}{d.region ? ` · ${d.region}` : ''}{d.gerencia ? ` · ${d.gerencia}` : ''}
        </p>
        {d.ignorados.length > 0 && <p className="mt-1 text-xs text-text-muted">No aplica a este detalle: {d.ignorados.join(', ')}.</p>}
      </div>

      <section aria-label="Presupuesto y venta por mes">
        <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-text-faint">Por mes · clic para ver su desglose</h4>
        <div className={cn('overflow-auto rounded-lg border border-border', alto)}>
          <Table wrapperClassName="overflow-visible">
            <TableHeader><TableRow>
              <TableHead>Mes</TableHead><TableHead className="text-right">Venta</TableHead><TableHead className="text-right">Presupuesto</TableHead><TableHead className="text-right">% cumpl.</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {d.meses.map((m) => (
                <TableRow key={m.mes} className={cn('cursor-pointer', m.mes === mes && 'bg-accent-soft')} onClick={() => setElegido(m.mes)} aria-selected={m.mes === mes}>
                  <TableCell className="font-medium">{mesLabel(m.mes)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(m.ventas)}</TableCell>
                  <TableCell className="text-right">{m.presupuesto ? formatCurrency(m.presupuesto) : '—'}</TableCell>
                  <TableCell className={cn('text-right font-medium', claseCumpl(m.cumplimiento))}>{pct(m.cumplimiento)}</TableCell>
                </TableRow>
              ))}
              {d.meses.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-text-muted">Sin venta ni presupuesto en el periodo.</TableCell></TableRow>}
              {d.meses.length > 0 && (
                <TableRow className="border-t-2 font-semibold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">{formatCurrency(total.ventas)}</TableCell>
                  <TableCell className="text-right">{total.presupuesto ? formatCurrency(total.presupuesto) : '—'}</TableCell>
                  <TableCell className={cn('text-right', claseCumpl(total.cumplimiento))}>{pct(total.cumplimiento)}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      {mes && (
        <section aria-label={`Desglose de ${mesLabel(mes)}`}>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h4 className="text-xs font-medium uppercase tracking-wide text-text-faint">Desglose de {mesLabel(mes)}</h4>
            <SegmentedControl<'sector' | 'grupo'>
              ariaLabel="Desglosar por"
              value={por}
              onChange={setPor}
              options={[{ value: 'sector', label: 'Sector' }, { value: 'grupo', label: 'Grupo de artículo' }]}
            />
          </div>
          <div className={cn('overflow-auto rounded-lg border border-border', alto)}>
            <Table wrapperClassName="overflow-visible">
              <TableHeader><TableRow>
                <TableHead>{por === 'sector' ? 'Sector' : 'Grupo de artículo'}</TableHead>
                <TableHead className="text-right">Venta</TableHead><TableHead className="text-right">Presupuesto</TableHead><TableHead className="text-right">% cumpl.</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {desglose.map((f) => (
                  <TableRow key={f.clave}>
                    <TableCell className="font-medium">{f.clave}</TableCell>
                    <TableCell className="text-right">{formatCurrency(f.ventas)}</TableCell>
                    <TableCell className="text-right">{f.presupuesto ? formatCurrency(f.presupuesto) : '—'}</TableCell>
                    <TableCell className={cn('text-right font-medium', claseCumpl(f.cumplimiento))}>{pct(f.cumplimiento)}</TableCell>
                  </TableRow>
                ))}
                {desglose.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-text-muted">Sin venta ni presupuesto en este mes.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
          <p className="mt-1 text-[11px] text-text-faint">Una fila solo con presupuesto (venta —) o solo con venta (presupuesto —) es un sector o grupo sin su contraparte ese mes.</p>
        </section>
      )}
    </div>
  );
}
