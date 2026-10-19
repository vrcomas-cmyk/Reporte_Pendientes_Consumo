import { useMemo } from 'react';
import { StatePill } from '../ui';
import { Section } from './_shared';
import { formatNumber } from '@/lib/utils';
import { coberturaEstado, COBERTURA_LABEL, COBERTURA_CLS } from '@/core/resumenSin';
import { detalle12Cerrados } from '../promedio12';
import { almacenesDeCondicion } from '@/core/inventoryRules';
import { norm } from '../helpers';
import { useNombresStore } from '@/store/nombresStore';
import { etiquetaAlmacen } from '@/lib/nombres';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import type { Analytics } from '../AnalyticsContext';

/** «Desglose por almacén» del MATERIAL completo (todos los centros sumados), con la misma estructura que el del detalle por centro:
 * inventario, pendiente, tránsito, promedio mensual y meses de inventario de 12 meses cerrados y cobertura. Una fila por almacén. */
export function DesgloseAlmacenMaterial({ a, material }: { a: Analytics; material: string }) {
  const nombresAlm = useNombresStore((s) => s.almacenes);
  const conPeriodo = !!a.facMensual;
  const mo = a.rss?.mats.get(norm(material));
  const condicion = a.invCondicion.find((r) => norm(r.material) === norm(material))?.condicion || '';
  const aplicables = useMemo(() => new Set(almacenesDeCondicion(condicion).map(norm)), [condicion]);

  const filas = useMemo(() => {
    if (!mo) return [];
    const por = new Map<string, { alm: string; inv: number; pend: number; transito: number; prom: number; centros: Set<string> }>();
    for (const co of mo.centros.values()) {
      for (const al of co.alm.values()) {
        const k = norm(al.alm);
        const f = por.get(k) ?? { alm: al.alm, inv: 0, pend: 0, transito: 0, prom: 0, centros: new Set<string>() };
        f.inv += al.inv; f.pend += al.pend; f.transito += al.transito;
        if (conPeriodo) f.prom += detalle12Cerrados(a, material, co.centro, al.alm).promedio;
        f.centros.add(co.centro);
        por.set(k, f);
      }
    }
    return [...por.values()].sort((x, y) => String(x.alm).localeCompare(String(y.alm)));
  }, [mo, a, material, conPeriodo]);

  if (!filas.length) return null;
  return (
    <Section ancho collapsible defaultOpen storageKey="material.desglose.alm" tono="inv" origen="Disponibilidad" title="Desglose por almacén (todos los centros)">
      <div>
        <Table wrapperClassName="max-h-64 rounded-lg border border-border">
          <TableHeader>
            <TableRow>
              <TableHead>Almacén</TableHead><TableHead className="text-right">Inv.</TableHead><TableHead className="text-right">Pend.</TableHead><TableHead className="text-right">Tránsito</TableHead>
              {conPeriodo && <TableHead className="text-right" title="Suma del promedio mensual de 12 meses cerrados (Fac_Mensual_CAM) de este almacén en todos los centros.">Prom. mensual</TableHead>}
              {conPeriodo && <TableHead className="text-right" title="Inventario del almacén ÷ promedio mensual.">Meses inv.</TableHead>}
              {conPeriodo && <TableHead title="Cobertura recalculada con el promedio de 12 meses cerrados.">Cobertura</TableHead>}
              <TableHead className="text-right">Centros</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((f) => {
              const meses = f.prom > 0 ? f.inv / f.prom : 0;
              const cob = conPeriodo ? coberturaEstado(meses, f.prom, f.inv) : null;
              return (
                <TableRow key={f.alm}>
                  <TableCell>{etiquetaAlmacen(f.alm, nombresAlm)}{aplicables.has(norm(f.alm)) && <StatePill label="aplica" cls="verde" />}</TableCell>
                  <TableCell className="text-right">{formatNumber(f.inv)}</TableCell>
                  <TableCell className="text-right">{f.pend ? formatNumber(f.pend) : '—'}</TableCell>
                  <TableCell className="text-right">{f.transito ? formatNumber(f.transito) : '—'}</TableCell>
                  {conPeriodo && <TableCell className="text-right font-medium">{formatNumber(f.prom)}</TableCell>}
                  {conPeriodo && <TableCell className="text-right">{f.prom > 0 ? formatNumber(meses) : '—'}</TableCell>}
                  {cob && <TableCell><StatePill label={COBERTURA_LABEL[cob]} cls={COBERTURA_CLS[cob]} /></TableCell>}
                  <TableCell className="text-right">{f.centros.size}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Section>
  );
}
